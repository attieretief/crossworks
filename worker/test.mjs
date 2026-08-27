/* Exercises the Worker with GitHub stubbed out. `npm test` from worker/. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const worker = (await import('./src/index.mjs')).default;
const { clean } = await import('../shared/schema.mjs');
const { renderAll } = await import('../shared/page.mjs');

const SECRET = 'test-secret-value';
const PASS = 'a-long-enough-passphrase';
const hash = createHash('sha256').update(`${SECRET}:${PASS}`).digest('hex');

const env = {
  SESSION_SECRET: SECRET,
  EDITORS: JSON.stringify([{ name: 'Vicki', hash }]),
  GITHUB_TOKEN: 'ghp_fake',
  REPO: 'attieretief/crossworks',
  BRANCH: 'main',
  ALLOWED_ORIGINS: 'https://crossworksmissions.org'
};

let committed = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  const ok = data => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('/git/ref/heads/')) return ok({ object: { sha: 'refsha' } });
  if (u.includes('/git/commits/refsha')) return ok({ tree: { sha: 'treesha' } });
  if (u.endsWith('/git/blobs')) { committed.push(body); return ok({ sha: 'blob' + committed.length }); }
  if (u.endsWith('/git/trees')) { committed.tree = body.tree; return ok({ sha: 'newtree' }); }
  if (u.endsWith('/git/commits')) return ok({ sha: 'newcommit' });
  if (u.includes('/git/refs/heads/')) return ok({ ok: true });
  throw new Error('unexpected fetch ' + u);
};

const call = (path, init = {}) => worker.fetch(new Request('https://api.example/' + path, {
  headers: { origin: 'https://crossworksmissions.org', 'content-type': 'application/json', ...(init.headers || {}) },
  ...init
}), env);

let failures = 0;
const check = (label, pass, extra = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
};

/* auth */
check('wrong passphrase rejected', (await call('auth', { method: 'POST', body: JSON.stringify({ passphrase: 'nope-nope-nope' }) })).status === 401);
const authRes = await call('auth', { method: 'POST', body: JSON.stringify({ passphrase: PASS }) });
const session = await authRes.json();
check('right passphrase accepted', authRes.status === 200 && session.name === 'Vicki');

/* the save gate */
check('save needs a token', (await call('save', { method: 'POST', body: '{}' })).status === 401);
check('tampered token rejected', (await call('save', {
  method: 'POST', body: '{}', headers: { authorization: 'Bearer ' + session.token.split('.')[0] + '.deadbeef' }
})).status === 401);

const content = JSON.parse(readFileSync(ROOT + '/content.json', 'utf8'));
const jpeg = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');
content.gallery.items.push({ id: 'gal-new', src: 'img/uploads/2026-08-27-test.jpg', alt: 'A test photo' });

const res = await call('save', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + session.token },
  body: JSON.stringify({
    content,
    uploads: [
      { path: 'img/uploads/2026-08-27-test.jpg', dataUrl: jpeg },   /* referenced → kept */
      { path: 'img/uploads/orphan.jpg', dataUrl: jpeg },            /* not referenced → dropped */
      { path: '../../.github/workflows/evil.yml', dataUrl: jpeg },  /* traversal → dropped */
      { path: 'index.html', dataUrl: jpeg },                        /* outside img/uploads → dropped */
      { path: 'img/uploads/shell.jpg', dataUrl: 'data:text/html;base64,' + Buffer.from('<script>').toString('base64') }
    ]
  })
});
check('save succeeds', res.status === 200, `status ${res.status}`);
check('commits content.json and the one referenced photo, nothing else', committed.length === 2, `${committed.length} blobs`);
check('the Worker no longer writes HTML', !committed.some(b => String(b.content || '').includes('<!DOCTYPE')));

/* injection through content */
committed = [];
const evil = JSON.parse(JSON.stringify(content));
evil.who.body = 'Hello <img src=x onerror="fetch(1)"> <script>alert(1)</script> world';
evil.hero.image = 'https://evil.example/x.jpg';
await call('save', { method: 'POST', headers: { authorization: 'Bearer ' + session.token }, body: JSON.stringify({ content: evil, uploads: [] }) });
const stored = JSON.parse(committed.find(b => b.content?.startsWith('{')).content);
check('markup stripped before it is stored', stored.who.body === 'Hello world');
check('off-site image refused', stored.hero.image === 'img/hero.jpg');

/* whatever is stored must survive rendering */
const built = renderAll(clean(stored));
const html = built.map(f => f.html).join('');
check('nothing executable reaches the built pages', !/<script>alert/.test(html) && !/onerror=/.test(html) && !html.includes('evil.example'));

/* news posts each get their own page, and two of the same name do not collide */
committed = [];
const withPosts = JSON.parse(JSON.stringify(content));
withPosts.news.posts = [
  { title: 'Kalabo', date: 'August 2026', summary: 'One', image: 'img/hero.jpg', alt: '', body: ['a'] },
  { title: 'Kalabo', date: 'July 2026', summary: 'Two', image: 'img/hero.jpg', alt: '', body: ['b'] }
];
await call('save', { method: 'POST', headers: { authorization: 'Bearer ' + session.token }, body: JSON.stringify({ content: withPosts, uploads: [] }) });
const savedPosts = JSON.parse(committed.find(b => b.content?.startsWith('{')).content).news.posts;
check('duplicate titles get distinct pages', savedPosts[0].slug === 'kalabo' && savedPosts[1].slug === 'kalabo-2');
const pages = renderAll(clean({ ...content, news: { ...content.news, posts: savedPosts } })).map(f => f.path);
check('a page is built per letter', pages.length === 3 && pages[1] === 'news/kalabo/index.html', pages.join(' '));

check('CORS origin echoed', res.headers.get('access-control-allow-origin') === 'https://crossworksmissions.org');
check('unknown route refused', (await call('subscribe', { method: 'POST', body: '{}' })).status === 404);

process.exit(failures ? 1 : 0);
