/* Exercises the Worker with GitHub and KV stubbed out. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const worker = (await import('./src/index.mjs')).default;

const SECRET = 'test-secret-value';
const PASS = 'a-long-enough-passphrase';
const hash = createHash('sha256').update(`${SECRET}:${PASS}`).digest('hex');

const kv = new Map();
const env = {
  SESSION_SECRET: SECRET,
  EDITORS: JSON.stringify([{ name: 'Vicki', hash }]),
  GITHUB_TOKEN: 'ghp_fake',
  REPO: 'attieretief/crossworks',
  BRANCH: 'main',
  ALLOWED_ORIGINS: 'https://crossworksmissions.org',
  SUBSCRIBERS: {
    get: async k => (kv.has(k) ? kv.get(k) : null),
    put: async (k, v) => { kv.set(k, v); },
    list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true })
  }
};

const committed = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  const ok = data => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('/git/ref/heads/')) return ok({ object: { sha: 'refsha' } });
  if (u.includes('/git/commits/refsha')) return ok({ tree: { sha: 'treesha' } });
  if (u.endsWith('/git/blobs')) { committed.push(body); return ok({ sha: 'blob' + committed.length }); }
  if (u.endsWith('/git/trees')) return ok({ sha: 'newtree' });
  if (u.endsWith('/git/commits')) return ok({ sha: 'newcommit' });
  if (u.includes('/git/refs/heads/')) return ok({ ok: true });
  throw new Error('unexpected fetch ' + u);
};

const call = (path, init = {}) => worker.fetch(new Request('https://api.example/' + path, {
  headers: { origin: 'https://crossworksmissions.org', 'content-type': 'application/json', ...(init.headers || {}) },
  ...init
}), env);

const check = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);

/* auth */
check('wrong passphrase rejected', (await call('auth', { method: 'POST', body: JSON.stringify({ passphrase: 'nope-nope-nope' }) })).status === 401);
const authRes = await call('auth', { method: 'POST', body: JSON.stringify({ passphrase: PASS }) });
const session = await authRes.json();
check('right passphrase accepted', authRes.status === 200 && session.name === 'Vicki');

/* save without a token */
check('save needs a token', (await call('save', { method: 'POST', body: '{}' })).status === 401);
check('tampered token rejected', (await call('save', {
  method: 'POST', body: '{}', headers: { authorization: 'Bearer ' + session.token.split('.')[0] + '.deadbeef' }
})).status === 401);

/* a real save, with one legitimate upload and three that must be refused */
const content = JSON.parse(readFileSync(ROOT + '/content.json', 'utf8'));
const jpeg = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');
content.gallery.items.push({ id: 'gal-new', src: 'img/uploads/2026-08-27-test.jpg', alt: 'A test photo' });

const res = await call('save', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + session.token },
  body: JSON.stringify({
    content,
    uploads: [
      { path: 'img/uploads/2026-08-27-test.jpg', dataUrl: jpeg },              /* referenced → kept */
      { path: 'img/uploads/orphan.jpg', dataUrl: jpeg },                       /* not referenced → dropped */
      { path: '../../.github/workflows/evil.yml', dataUrl: jpeg },             /* traversal → dropped */
      { path: 'img/uploads/shell.jpg', dataUrl: 'data:text/html;base64,' + Buffer.from('<script>').toString('base64') }
    ]
  })
});
check('save succeeds', res.status === 200, `status ${res.status}`);
const paths = committed.length;
check('only content.json, index.html and the referenced upload committed', paths === 3, `${paths} blobs`);

/* injection through content */
committed.length = 0;
const evil = JSON.parse(JSON.stringify(content));
evil.who.body = 'Hello <img src=x onerror="fetch(1)"> <script>alert(1)</script> world';
evil.hero.image = 'https://evil.example/x.jpg';
await call('save', { method: 'POST', headers: { authorization: 'Bearer ' + session.token }, body: JSON.stringify({ content: evil, uploads: [] }) });
const html = committed.find(b => b.content && b.content.startsWith('<!DOCTYPE'))?.content || '';
check('no script survives into index.html', !/<script>alert/.test(html) && !/onerror=/.test(html));
check('off-site hero image refused', !html.includes('evil.example'));

/* newsletter */
check('bad email refused', (await call('subscribe', { method: 'POST', body: JSON.stringify({ email: 'nope' }) })).status === 400);
check('good email stored', (await call('subscribe', { method: 'POST', body: JSON.stringify({ name: 'Vicki', email: 'V@Example.COM ' }) })).status === 200);
check('stored lowercased once', kv.has('sub:v@example.com'));
for (let i = 0; i < 6; i++) await call('subscribe', { method: 'POST', body: JSON.stringify({ email: `x${i}@example.com` }) });
check('rate limited', (await call('subscribe', { method: 'POST', body: JSON.stringify({ email: 'last@example.com' }) })).status === 429);

const csv = await call('subscribers', { method: 'GET', headers: { authorization: 'Bearer ' + session.token } });
check('subscriber export needs auth', (await call('subscribers', { method: 'GET' })).status === 401);
check('subscriber export returns CSV', (await csv.text()).startsWith('email,name,joined'));
check('CORS origin echoed', csv.headers.get('access-control-allow-origin') === 'https://crossworksmissions.org');
