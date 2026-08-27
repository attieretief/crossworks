/* Crossworks in-page editor.
   Loaded on demand from js/site.js (?edit, or Ctrl/Cmd+Shift+E). Visitors never
   see it. The page itself is the editing surface: content.json is the working
   copy, and shared/page.mjs re-renders whenever something is added, moved or
   removed. Nothing here can publish and nothing here holds a credential: the
   work is kept as a draft in this browser, and **Download changes** writes one
   file to hand to Attie, who puts it live. */

import { renderHome, renderPost } from '../shared/page.mjs';
import { slug } from '../shared/sanitize.mjs';
import { pack } from '../shared/handover.mjs';

const BASE = window.CROSSWORKS_BASE || '';
const DRAFT_KEY = 'cw.draft';
const MAX_UPLOAD_BYTES = 18 * 1024 * 1024;   /* one save's worth of photos, comfortably under GitHub's blob limit */
const MAX_EDGE = 1600;                        /* photos are downscaled before they leave the browser */

const state = {
  content: null,
  original: '',
  editor: '',           /* whoever is at the keyboard, for the handover file */
  page: null,           /* {kind:'home'} or {kind:'post', slug} */
  uploads: new Map(),   /* repo path -> data URL, sent on save */
  previews: new Map(),  /* repo path -> data URL, shown until then */
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

function splitIndex(path) {
  const at = path.lastIndexOf('.');
  return [path.slice(0, at), Number(path.slice(at + 1))];
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

const button = (label, title, onclick, cls = '') =>
  el('button', { type: 'button', class: 'cw-btn ' + cls, title: title || label, onclick }, label);

/* ── sign in ────────────────────────────────────────────────────────────── */

function buildBar() {
  state.bar?.remove();
  barShows = dirty();
  state.status = el('p', { class: 'cw-status' });

  const download = button('Download changes', 'Write the file to send to Attie', onDownload, 'cw-primary');
  download.disabled = !dirty();

  const bar = el('div', { class: 'cw-bar', role: 'region', 'aria-label': 'Page editor' });
  bar.dataset.dirty = dirty() ? '1' : '';
  bar.append(
    el('span', { class: 'cw-title' }, 'Editing'),
    button('Start again', 'Throw away every change and go back to what is on the site', () => {
      if (dirty() && !confirm('Throw away every change you have made?')) return;
      localStorage.removeItem(DRAFT_KEY);
      location.reload();
    }),
    download,
    button('✕', 'Close the editor', () => {
      if (dirty() && !confirm('Close the editor? Your changes stay saved on this computer.')) return;
      location.href = location.pathname;
    }),
    state.status
  );

  document.body.append(bar);
  state.bar = bar;
}

/* Typing fires this on every keystroke: keep the draft write off the hot path,
   and only touch the bar when it actually needs to change. */
let draftTimer = null;
let barShows = null;
function refreshBar() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 900);
  const now = dirty();
  if (now !== barShows) {
    barShows = now;
    buildBar();
  }
}

/* ── images ─────────────────────────────────────────────────────────────── */

function pickFiles({ multiple = false } = {}) {
  return new Promise(resolve => {
    const input = el('input', { type: 'file', accept: 'image/*', multiple, class: 'cw-file' });
    const done = files => { resolve(files); input.remove(); };
    input.addEventListener('change', () => done([...input.files]));
    /* closing the picker without choosing must not leave the editor waiting */
    input.addEventListener('cancel', () => done([]));
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
  const stem = slug(file.name.replace(/\.[^.]+$/, ''), 'photo').slice(0, 48);
  const stamp = new Date().toISOString().slice(0, 10);
  return `img/uploads/${stamp}-${stem}-${Math.random().toString(36).slice(2, 7)}.jpg`;
}

async function queueImage(file) {
  const dataUrl = await downscale(file);
  const bytes = dataUrl.length * 0.75;
  const queued = [...state.uploads.values()].reduce((n, d) => n + d.length * 0.75, 0);
  if (queued + bytes > MAX_UPLOAD_BYTES) throw new Error('too much');
  const path = repoPath(file);
  state.uploads.set(path, dataUrl);
  state.previews.set(path, dataUrl);
  return path;
}

const tooMuch = err => err.message === 'too much'
  ? 'That is as much as one save can carry — save these, then add the rest.'
  : 'That file could not be read as a photo.';

async function replaceImage(fieldPath) {
  const [file] = await pickFiles();
  if (!file) return;
  say('Preparing the photo…');
  try {
    setPath(state.content, fieldPath, await queueImage(file));
    say('');
    redraw();
  } catch (err) {
    say(tooMuch(err), 'bad');
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
    try { image = await queueImage(file); say(''); } catch (err) { say(tooMuch(err), 'bad'); }
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
      say(tooMuch(err), 'bad');
      break;
    }
  }
  redraw();
}

async function addPost() {
  const title = (prompt('What is this letter called?', '') || '').trim();
  if (!title) return;

  const [file] = await pickFiles();
  let image = 'img/hero.jpg';
  if (file) {
    say('Preparing the photo…');
    try { image = await queueImage(file); say(''); } catch (err) { say(tooMuch(err), 'bad'); }
  }

  /* the slug is fixed now, so renaming the letter later never breaks its link */
  const taken = new Set(state.content.news.posts.map(p => p.slug));
  let stem = slug(title, 'letter');
  for (let n = 2; taken.has(stem); n++) stem = `${slug(title, 'letter')}-${n}`;

  state.content.news.posts.unshift({
    id: newId('nl'),
    slug: stem,
    date: new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
    title,
    summary: 'One or two sentences that make someone want to read the rest.',
    image,
    alt: title,
    body: ['Write the letter here.']
  });
  redraw();
}

function addParagraph(listPath) {
  getPath(state.content, listPath).push('');
  redraw();
  const fresh = document.querySelector(`[data-edit="${listPath}.${getPath(state.content, listPath).length - 1}"]`);
  fresh?.focus();
}

/* ── per-item controls ──────────────────────────────────────────────────── */

const TOOLS = {
  project: path => {
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
  group: path => {
    const [listPath, index] = splitIndex(path);
    return [
      button('↑', 'Move this country up', () => move(listPath, index, -1)),
      button('↓', 'Move this country down', () => move(listPath, index, 1)),
      button('+ Project', 'Add a project to this country', () => addProject(path), 'cw-wide'),
      button('✕', 'Remove this country and its projects', () => remove(listPath, index, 'country and every project in it'), 'cw-danger')
    ];
  },
  photo: path => {
    const [listPath, index] = splitIndex(path);
    return [
      button('↑', 'Move earlier', () => move(listPath, index, -1)),
      button('↓', 'Move later', () => move(listPath, index, 1)),
      button('✕', 'Remove this photo', () => remove(listPath, index, 'photo'), 'cw-danger')
    ];
  },
  post: path => {
    const [listPath, index] = splitIndex(path);
    return [
      button('↑', 'Move this letter up', () => move(listPath, index, -1)),
      button('↓', 'Move this letter down', () => move(listPath, index, 1)),
      button('✕', 'Remove this letter and its page', () => remove(listPath, index, 'letter'), 'cw-danger')
    ];
  },
  para: path => {
    const [listPath, index] = splitIndex(path);
    return [
      button('↑', 'Move this paragraph up', () => move(listPath, index, -1)),
      button('↓', 'Move this paragraph down', () => move(listPath, index, 1)),
      button('✕', 'Remove this paragraph', () => remove(listPath, index, 'paragraph'), 'cw-danger')
    ];
  }
};

const ADDERS = [
  { test: p => p === 'projects.groups', make: () => button('+ Add a country', 'Add another country heading', addGroup, 'cw-add') },
  { test: p => p === 'gallery.items', make: () => button('+ Add photos', 'Upload one or more photos', addPhotos, 'cw-add') },
  { test: p => p === 'news.posts', make: () => button('+ Write a letter', 'Start a new letter', addPost, 'cw-add') },
  { test: p => /^news\.posts\.\d+\.body$/.test(p), make: p => button('+ Paragraph', 'Add another paragraph', () => addParagraph(p), 'cw-add cw-add-sm') }
];

/* ── editing affordances ────────────────────────────────────────────────── */

function wire() {
  document.querySelectorAll('[data-edit]').forEach(node => {
    const path = node.dataset.edit;
    if (node.hasAttribute('data-image')) {
      node.classList.add('cw-img');
      node.addEventListener('click', e => { e.preventDefault(); replaceImage(path); });
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

  /* photos need a description for people who cannot see them */
  document.querySelectorAll('[data-image]').forEach(img => {
    const altPath = img.dataset.edit.replace(/\.(image|src)$/, '.alt');
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
    const path = node.dataset.list;
    const adder = ADDERS.find(a => a.test(path));
    if (adder) node.after(el('div', { class: 'cw-add-row' }, adder.make(path)));
  });

  /* blocks a visitor never sees, but an editor still has to reach */
  document.querySelectorAll('.posts.is-empty, .need.is-empty').forEach(n => {
    n.hidden = false;
    n.classList.remove('is-empty');
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

/** On the home page, each letter gets its text opened up underneath its card,
    so the whole site is written from one screen. */
function openLetters() {
  if (state.page.kind !== 'home') return;
  document.querySelectorAll('.post-card[data-item]').forEach(card => {
    const path = card.dataset.item;
    const post = getPath(state.content, path);
    const list = el('div', { 'data-list': `${path}.body` },
      post.body.map((para, i) => {
        const p = el('p', {
          'data-item': `${path}.body.${i}`,
          'data-kind': 'para',
          'data-edit': `${path}.body.${i}`,
          'data-rich': '1'
        });
        p.innerHTML = para;
        return p;
      }));
    card.append(el('div', { class: 'cw-panel', contenteditable: 'false' },
      el('p', { class: 'cw-panel-title' }, 'The letter itself'),
      list));
  });
}

/* ── render ─────────────────────────────────────────────────────────────── */

function currentPostIndex() {
  return state.content.news.posts.findIndex(p => slug(p.slug || p.title, p.id) === state.page.slug);
}

function redraw() {
  const scroll = window.scrollY;

  let html;
  if (state.page.kind === 'post') {
    const index = currentPostIndex();
    if (index === -1) {
      say('This letter has been removed. Save, then go back to the home page.', 'bad');
      return;
    }
    html = renderPost(state.content, index);
  } else {
    html = renderHome(state.content);
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.body.innerHTML = doc.body.innerHTML;

  /* freshly uploaded photos are not on the server yet — show them from memory */
  state.previews.forEach((dataUrl, path) => {
    document.querySelectorAll(`img[src="${CSS.escape(path)}"], img[src="${CSS.escape(BASE + path)}"]`)
      .forEach(img => { img.src = dataUrl; });
  });

  document.body.classList.add('cw-editing');
  openLetters();
  wire();
  buildBar();
  window.scrollTo(0, scroll);
}

/* ── save ───────────────────────────────────────────────────────────────── */

/* ── the draft, and the file that carries it out ────────────────────────── */

/* Nothing is published from here, so an unfinished letter must survive a closed
   tab, a flat battery or a stray reload. */
function saveDraft() {
  if (!dirty()) return localStorage.removeItem(DRAFT_KEY);
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      content: state.content,
      uploads: [...state.uploads],
      editor: state.editor,
      at: new Date().toISOString()
    }));
  } catch (_) {
    /* out of room — usually too many photos. The work stays in the page. */
    say('This computer will not hold any more photos as a draft. Download your changes now.', 'bad');
  }
}

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return draft?.content ? draft : null;
  } catch (_) {
    return null;
  }
}

const humanSize = bytes => bytes > 900_000
  ? `${(bytes / 1_000_000).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1000))} KB`;

function onDownload() {
  if (!dirty()) return say('Nothing has changed yet.');

  const name = state.editor || prompt('Who should Attie thank for these changes?', '') || '';
  state.editor = name.trim();

  const file = pack({ content: state.content, uploads: state.uploads, editor: state.editor });
  const text = JSON.stringify(file);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `crossworks-${stamp}${state.editor ? '-' + slug(state.editor, 'edit') : ''}.json`;

  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  const photos = Object.keys(file.uploads).length;
  say(`Saved ${filename} to your downloads — ${humanSize(text.length)}${photos ? `, ${photos} new photo${photos > 1 ? 's' : ''}` : ''}. Send it to Attie and he will put it on the site.`, 'good');
}

/* ── start ──────────────────────────────────────────────────────────────── */

async function startEditing() {
  const res = await fetch(BASE + 'content.json', { cache: 'no-store' });
  state.content = await res.json();
  state.original = JSON.stringify(state.content);

  /* Unfinished work comes back on its own. Nothing asks a question that could
     throw it away by accident — only "Start again" does that, and it asks. */
  const draft = readDraft();
  if (draft) {
    state.content = draft.content;
    state.uploads = new Map(draft.uploads || []);
    state.previews = new Map(draft.uploads || []);
    state.editor = draft.editor || '';
  }

  redraw();
  say(draft
    ? `Picked up where you left off on ${new Date(draft.at).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}. "Start again" throws these changes away.`
    : 'Click any text to change it. Click a photo to replace it. Nothing goes live until you send Attie the file.');
}

state.page = document.body.classList.contains('post-page')
  ? { kind: 'post', slug: location.pathname.replace(/\/(index\.html)?$/, '').split('/').pop() }
  : { kind: 'home' };

addEventListener('beforeunload', e => {
  if (dirty()) { saveDraft(); e.preventDefault(); }
});

startEditing();
