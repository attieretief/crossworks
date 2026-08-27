/* Crossworks in-page editor.
   Loaded on demand from js/site.js (?edit, or Ctrl/Cmd+Shift+E). Visitors never
   see it. The page's own markup is the editing surface: content.json is the
   working copy, shared/page.mjs re-renders whenever something is added, moved or
   removed, and Save posts the whole document to the Worker, which commits
   content.json, any new images and a freshly rendered index.html. */

import { render } from '../shared/page.mjs';

const API = ((window.CROSSWORKS && window.CROSSWORKS.api) || '').replace(/\/$/, '');
const SESSION_KEY = 'cw.session';
const MAX_UPLOAD_BYTES = 18 * 1024 * 1024;   /* keep one save comfortably inside the Worker's limit */
const MAX_EDGE = 1600;                        /* photos are downscaled before they leave the browser */

const state = {
  content: null,
  original: '',
  session: null,
  uploads: new Map(),   /* repo path -> data URL, sent on save */
  previews: new Map(),  /* repo path -> object URL, shown until then */
  bar: null,
  status: null
};

/* ── paths ──────────────────────────────────────────────────────────────── */

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

const dirty = () => JSON.stringify(state.content) !== state.original || state.uploads.size > 0;

/* ── chrome ─────────────────────────────────────────────────────────────── */

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(kid => node.append(kid));
  return node;
}

function say(message, kind = '') {
  if (!state.status) return;
  state.status.textContent = message;
  state.status.className = 'cw-status ' + kind;
}

function button(label, title, onclick, cls = '') {
  return el('button', { type: 'button', class: 'cw-btn ' + cls, title: title || label, onclick }, label);
}

/* ── sign in ────────────────────────────────────────────────────────────── */

function buildBar() {
  state.bar?.remove();
  state.status = el('p', { class: 'cw-status' });

  const bar = el('div', { class: 'cw-bar', role: 'region', 'aria-label': 'Page editor' });

  if (!state.session) {
    const input = el('input', { type: 'password', placeholder: 'Editor passphrase', autocomplete: 'current-password' });
    const submit = async () => {
      if (!API) return say('No editor service configured yet (js/config.js).', 'bad');
      say('Checking…');
      try {
        const res = await fetch(API + '/auth', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ passphrase: input.value })
        });
        if (!res.ok) throw new Error('rejected');
        state.session = await res.json();
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
        await startEditing();
      } catch (_) {
        say('That passphrase was not accepted.', 'bad');
        input.select();
      }
    };
    const form = el('form', { class: 'cw-signin', onsubmit: e => { e.preventDefault(); submit(); } },
      input,
      el('button', { type: 'submit', class: 'cw-btn cw-primary' }, 'Sign in'));
    bar.append(
      el('span', { class: 'cw-title' }, 'Edit this page'),
      form,
      button('✕', 'Close the editor', () => bar.remove()),
      state.status
    );
    setTimeout(() => input.focus(), 0);
  } else {
    const save = button('Save changes', 'Publish these changes', onSave, 'cw-primary');
    save.disabled = !dirty();
    bar.dataset.dirty = dirty() ? '1' : '';
    bar.append(
      el('span', { class: 'cw-title' }, `Editing as ${state.session.name}`),
      button('Discard', 'Throw away every unsaved change', () => {
        if (dirty() && !confirm('Discard every change you have made since the last save?')) return;
        location.reload();
      }),
      save,
      button('Sign out', 'Sign out', () => {
        if (dirty() && !confirm('You have unsaved changes. Sign out anyway?')) return;
        sessionStorage.removeItem(SESSION_KEY);
        location.reload();
      }),
      state.status
    );
  }

  document.body.append(bar);
  state.bar = bar;
}

const refreshBar = () => { if (state.session) buildBar(); };

/* ── images ─────────────────────────────────────────────────────────────── */

function pickFiles({ multiple = false, accept = 'image/*' } = {}) {
  return new Promise(resolve => {
    const input = el('input', { type: 'file', accept, multiple, class: 'cw-file' });
    input.addEventListener('change', () => {
      resolve([...input.files]);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

const readAsDataURL = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

/** Shrink to MAX_EDGE and re-encode as JPEG, so a 6 MB phone photo lands at ~300 KB. */
async function downscale(file) {
  if (!/^image\//.test(file.type)) throw new Error('not an image');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 500 * 1024) return readAsDataURL(file);

  const canvas = el('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

function repoPath(file) {
  const stem = (file.name.replace(/\.[^.]+$/, '') || 'photo')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'photo';
  const stamp = new Date().toISOString().slice(0, 10);
  return `img/uploads/${stamp}-${stem}-${Math.random().toString(36).slice(2, 7)}.jpg`;
}

async function queueImage(file) {
  const dataUrl = await downscale(file);
  const bytes = Math.round(dataUrl.length * 0.75);
  const queued = [...state.uploads.values()].reduce((n, d) => n + d.length * 0.75, 0);
  if (queued + bytes > MAX_UPLOAD_BYTES) throw new Error('too much');
  const path = repoPath(file);
  state.uploads.set(path, dataUrl);
  state.previews.set(path, dataUrl);
  return path;
}

async function replaceImage(fieldPath) {
  const [file] = await pickFiles();
  if (!file) return;
  say('Preparing the photo…');
  try {
    setPath(state.content, fieldPath, await queueImage(file));
    say('');
    redraw();
  } catch (err) {
    say(err.message === 'too much'
      ? 'That is more than one save can carry — save what you have, then add the rest.'
      : 'That file could not be read as a photo.', 'bad');
  }
}

/* ── list operations ────────────────────────────────────────────────────── */

const newId = prefix => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function move(listPath, index, delta) {
  const list = getPath(state.content, listPath);
  const to = index + delta;
  if (to < 0 || to >= list.length) return;
  [list[index], list[to]] = [list[to], list[index]];
  redraw();
}

function remove(listPath, index, what) {
  if (!confirm(`Remove this ${what}? It disappears from the site when you save.`)) return;
  getPath(state.content, listPath).splice(index, 1);
  redraw();
}

async function addProject(groupPath) {
  const [file] = await pickFiles();
  let image = 'img/hero.jpg';
  if (file) {
    say('Preparing the photo…');
    try { image = await queueImage(file); say(''); } catch (_) { say('That photo could not be used.', 'bad'); }
  }
  getPath(state.content, `${groupPath}.items`).push({
    id: newId('pr'),
    title: 'New project',
    image,
    alt: 'New project',
    body: 'Describe the project here — where it is, who it serves and what it needs.',
    funding: '',
    wide: false
  });
  redraw();
}

function addGroup() {
  state.content.projects.groups.push({ id: newId('g'), country: 'New country', items: [] });
  redraw();
}

async function addPhotos() {
  const files = await pickFiles({ multiple: true });
  if (!files.length) return;
  say(`Preparing ${files.length} photo${files.length > 1 ? 's' : ''}…`);
  for (const file of files) {
    try {
      state.content.gallery.items.push({ id: newId('gal'), src: await queueImage(file), alt: '' });
      say('');
    } catch (err) {
      say(err.message === 'too much'
        ? 'That is as much as one save can carry — save these, then add the rest.'
        : 'One file could not be read as a photo.', 'bad');
      break;
    }
  }
  redraw();
}

async function addIssue() {
  const [file] = await pickFiles({ accept: 'application/pdf' });
  if (!file) return;
  if (file.size > MAX_UPLOAD_BYTES) return say('That PDF is too large to upload here.', 'bad');
  const stem = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 48) || 'newsletter';
  const path = `newsletters/${new Date().toISOString().slice(0, 10)}-${stem}.pdf`;
  state.uploads.set(path, await readAsDataURL(file));
  state.content.newsletter.issues.unshift({
    id: newId('nl'),
    date: new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
    title: 'New newsletter',
    file: path
  });
  redraw();
}

/* ── editing affordances ────────────────────────────────────────────────── */

const TOOLS = {
  project: (path) => {
    const [listPath, index] = splitIndex(path);
    const card = getPath(state.content, path);
    return [
      button('↑', 'Move up', () => move(listPath, index, -1)),
      button('↓', 'Move down', () => move(listPath, index, 1)),
      button('⤢', card.wide ? 'Make this a normal card' : 'Make this card full width', () => {
        card.wide = !card.wide;
        redraw();
      }),
      button('R', 'Show or hide the funding line', () => {
        card.funding = card.funding ? '' : 'R0';
        redraw();
      }),
      button('✕', 'Remove this project', () => remove(listPath, index, 'project'), 'cw-danger')
    ];
  },
  group: (path) => {
    const [listPath, index] = splitIndex(path);
    return [
      button('↑', 'Move this country up', () => move(listPath, index, -1)),
      button('↓', 'Move this country down', () => move(listPath, index, 1)),
      button('+ Project', 'Add a project to this country', () => addProject(path), 'cw-wide'),
      button('✕', 'Remove this country and its projects', () => remove(listPath, index, 'country and every project in it'), 'cw-danger')
    ];
  },
  photo: (path) => {
    const [listPath, index] = splitIndex(path);
    return [
      button('↑', 'Move earlier', () => move(listPath, index, -1)),
      button('↓', 'Move later', () => move(listPath, index, 1)),
      button('✕', 'Remove this photo', () => remove(listPath, index, 'photo'), 'cw-danger')
    ];
  },
  issue: (path) => {
    const [listPath, index] = splitIndex(path);
    return [button('✕', 'Remove this newsletter', () => remove(listPath, index, 'newsletter'), 'cw-danger')];
  }
};

function splitIndex(path) {
  const at = path.lastIndexOf('.');
  return [path.slice(0, at), Number(path.slice(at + 1))];
}

const ADDERS = {
  'projects.groups': () => button('+ Add a country', 'Add another country heading', addGroup, 'cw-add'),
  'gallery.items': () => button('+ Add photos', 'Upload one or more photos', addPhotos, 'cw-add'),
  'newsletter.issues': () => button('+ Add a newsletter', 'Upload a newsletter PDF', addIssue, 'cw-add')
};

function wire() {
  document.querySelectorAll('[data-edit]').forEach(node => {
    const path = node.dataset.edit;
    if (node.hasAttribute('data-image')) {
      node.classList.add('cw-img');
      node.addEventListener('click', e => { e.preventDefault(); replaceImage(path); });
      node.addEventListener('dblclick', e => e.preventDefault());
      return;
    }
    node.contentEditable = 'true';
    node.spellcheck = true;
    node.classList.add('cw-field');
    node.addEventListener('input', () => {
      setPath(state.content, path, node.hasAttribute('data-rich') ? node.innerHTML : node.textContent);
      refreshBar();
    });
    node.addEventListener('paste', e => {
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text'));
    });
  });

  /* photos need an alt line for screen readers and for search */
  document.querySelectorAll('[data-image]').forEach(img => {
    const base = img.dataset.edit.replace(/\.(image|src)$/, '');
    const altPath = `${base}.alt`;
    if (getPath(state.content, altPath) === undefined) return;
    img.title = 'Click to replace this photo · Shift-click to describe it';
    img.addEventListener('click', e => {
      if (!e.shiftKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const next = prompt('Describe this photo for people who cannot see it:', getPath(state.content, altPath) || '');
      if (next === null) return;
      setPath(state.content, altPath, next);
      redraw();
    }, true);
  });

  document.querySelectorAll('[data-item][data-kind]').forEach(node => {
    const tools = TOOLS[node.dataset.kind];
    if (!tools) return;
    node.classList.add('cw-item');
    const holder = el('div', { class: 'cw-tools', contenteditable: 'false' }, tools(node.dataset.item));
    (node.tagName === 'IMG' ? wrapImage(node) : node).append(holder);
  });

  document.querySelectorAll('[data-list]').forEach(node => {
    const add = ADDERS[node.dataset.list];
    if (add) node.after(el('div', { class: 'cw-add-row' }, add()));
  });

  /* an empty archive is hidden for visitors — an editor still has to reach it */
  document.querySelectorAll('.issues.is-empty, .need.is-empty').forEach(n => {
    n.hidden = false;
    n.classList.add('cw-revealed');
  });

  document.addEventListener('click', e => {
    const link = e.target.closest('a[href]');
    if (link && !link.closest('.cw-bar')) e.preventDefault();
  }, true);
}

/** Gallery tiles are bare <img>; give them a positioned parent to hang tools on. */
function wrapImage(img) {
  const wrap = el('figure', { class: 'cw-imgwrap' });
  img.replaceWith(wrap);
  wrap.append(img);
  return wrap;
}

/* ── render ─────────────────────────────────────────────────────────────── */

function redraw() {
  const scroll = window.scrollY;
  const doc = new DOMParser().parseFromString(render(state.content), 'text/html');
  document.body.innerHTML = doc.body.innerHTML;

  /* freshly uploaded files are not on the server yet — show them from memory */
  state.previews.forEach((dataUrl, path) => {
    document.querySelectorAll(`img[src="${CSS.escape(path)}"]`).forEach(img => { img.src = dataUrl; });
  });

  document.body.classList.add('cw-editing');
  wire();
  buildBar();
  window.scrollTo(0, scroll);
}

/* ── save ───────────────────────────────────────────────────────────────── */

async function onSave() {
  if (!dirty()) return say('Nothing has changed yet.');
  say('Saving…');
  state.bar.querySelectorAll('button').forEach(b => { b.disabled = true; });

  try {
    const res = await fetch(API + '/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${state.session.token}` },
      body: JSON.stringify({
        content: state.content,
        uploads: [...state.uploads].map(([path, dataUrl]) => ({ path, dataUrl }))
      })
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Your session has expired — sign in again.');
    if (!res.ok) throw new Error(body.error || 'The save did not go through.');

    state.uploads.clear();
    state.original = JSON.stringify(state.content);
    buildBar();
    say('Saved. The live site updates in about a minute.', 'good');
  } catch (err) {
    buildBar();
    say(err.message, 'bad');
  }
}

/* ── start ──────────────────────────────────────────────────────────────── */

async function startEditing() {
  const res = await fetch('content.json', { cache: 'no-store' });
  state.content = await res.json();
  state.original = JSON.stringify(state.content);
  redraw();
  say(`Click any text to change it. Click a photo to replace it.`);
}

addEventListener('beforeunload', e => {
  if (state.session && dirty()) e.preventDefault();
});

try {
  state.session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  if (state.session && state.session.expires < Date.now()) state.session = null;
} catch (_) {
  state.session = null;
}

if (state.session) startEditing().catch(() => { state.session = null; buildBar(); });
else buildBar();
