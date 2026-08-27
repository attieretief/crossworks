/* Crossworks editor service.
   Two jobs: check an editor's passphrase, and commit their changes to GitHub.
   It holds the only credential in the system — a fine-grained GitHub token — so
   the site itself stays a folder of static files. It does not render anything:
   .github/workflows/build.yml rebuilds the pages from content.json after the
   commit lands. */

import { clean, referencedAssets } from '../../shared/schema.mjs';

const SESSION_HOURS = 8;
const MAX_BODY_BYTES = 22 * 1024 * 1024;
const UPLOAD_PREFIXES = ['img/uploads/'];

/* ── helpers ────────────────────────────────────────────────────────────── */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });

const b64url = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const enc = new TextEncoder();

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

async function issueToken(env, name) {
  const payload = b64url(enc.encode(JSON.stringify({ name, exp: Date.now() + SESSION_HOURS * 3600e3 })));
  return `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
}

async function readToken(env, request) {
  const raw = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  if (!timingSafeEqual(signature, await hmac(env.SESSION_SECRET, payload))) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0))
    ));
    return claims.exp > Date.now() ? claims : null;
  } catch (_) {
    return null;
  }
}

function cors(env, request) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0] || '',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin'
  };
}

/* ── GitHub ─────────────────────────────────────────────────────────────── */

async function gh(env, path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${env.REPO}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'crossworks-editor',
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** One commit carrying content.json and any newly uploaded photos. */
async function commit(env, { files, message, author }) {
  const branch = env.BRANCH || 'main';
  const ref = await gh(env, `/git/ref/heads/${branch}`);
  const head = await gh(env, `/git/commits/${ref.object.sha}`);

  const tree = [];
  for (const file of files) {
    const blob = await gh(env, '/git/blobs', {
      method: 'POST',
      body: JSON.stringify(
        file.base64 === undefined
          ? { content: file.content, encoding: 'utf-8' }
          : { content: file.base64, encoding: 'base64' }
      )
    });
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const newTree = await gh(env, '/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: head.tree.sha, tree })
  });
  const made = await gh(env, '/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [ref.object.sha],
      author: { name: author, email: env.COMMIT_EMAIL || 'info@crossworksmissions.org', date: new Date().toISOString() }
    })
  });
  await gh(env, `/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: made.sha }) });
  return made.sha;
}

/* ── routes ─────────────────────────────────────────────────────────────── */

async function auth(request, env) {
  const { passphrase } = await request.json().catch(() => ({}));
  if (typeof passphrase !== 'string' || passphrase.length < 6) return json({ error: 'no' }, 401);

  let editors;
  try {
    editors = JSON.parse(env.EDITORS);
  } catch (_) {
    return json({ error: 'The editor list is not configured.' }, 500);
  }

  const given = await sha256Hex(`${env.SESSION_SECRET}:${passphrase}`);
  const match = editors.find(e => timingSafeEqual(String(e.hash || ''), given));
  if (!match) {
    await new Promise(r => setTimeout(r, 400));      /* slow down guessing */
    return json({ error: 'no' }, 401);
  }

  return json({
    name: match.name,
    token: await issueToken(env, match.name),
    expires: Date.now() + SESSION_HOURS * 3600e3
  });
}

function decodeDataUrl(dataUrl) {
  const m = /^data:([\w./+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  return m ? { type: m[1], base64: m[2], bytes: Math.floor(m[2].length * 0.75) } : null;
}

async function save(request, env) {
  const who = await readToken(env, request);
  if (!who) return json({ error: 'Your session has expired — sign in again.' }, 401);

  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'That save was not readable.' }, 400);

  const content = clean(body.content);
  const wanted = referencedAssets(content);
  const files = [{ path: 'content.json', content: JSON.stringify(content, null, 2) + '\n' }];

  let uploadedBytes = 0;
  for (const upload of (Array.isArray(body.uploads) ? body.uploads : []).slice(0, 60)) {
    const path = String(upload?.path || '');
    if (!UPLOAD_PREFIXES.some(p => path.startsWith(p))) continue;
    if (path.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(path)) continue;
    if (!wanted.has(path)) continue;                 /* nothing the page does not use */

    const decoded = decodeDataUrl(upload.dataUrl);
    if (!decoded) continue;
    if (!/^image\/(jpeg|png|webp)$/.test(decoded.type)) continue;

    uploadedBytes += decoded.bytes;
    if (uploadedBytes > MAX_BODY_BYTES) return json({ error: 'Too many photos in one save — save these, then add the rest.' }, 413);
    files.push({ path, base64: decoded.base64 });
  }

  try {
    const sha = await commit(env, { files, author: who.name, message: `Site edit by ${who.name}` });
    return json({ ok: true, commit: sha });
  } catch (err) {
    return json({ error: 'GitHub refused the change. Try again in a moment.', detail: String(err).slice(0, 200) }, 502);
  }
}

export default {
  async fetch(request, env) {
    const headers = cors(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const { pathname } = new URL(request.url);
    const routes = { 'POST /auth': auth, 'POST /save': save };
    const handler = routes[`${request.method} ${pathname}`];
    if (!handler) return json({ error: 'Not found' }, 404, headers);

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_BODY_BYTES) return json({ error: 'That is too large to send in one go.' }, 413, headers);

    try {
      const res = await handler(request, env);
      Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (err) {
      return json({ error: 'Something went wrong on our side.', detail: String(err).slice(0, 200) }, 500, headers);
    }
  }
};
