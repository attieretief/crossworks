/* Shared by the Node build and the Cloudflare Worker.
   Editors type into contenteditable elements, so whatever comes back has to be
   treated as hostile: decode first, escape everything, then re-admit a very small
   set of inline tags. */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', middot: '·'
};

function decode(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    const named = ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Plain text: every tag dropped, the text inside kept. */
export function plain(s) {
  return esc(decode(strip(s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim());
}

/* Tags whose *contents* are code, not prose. Stripping the tag alone would
   leave the script body sitting on the page as visible text. */
const DROP_WHOLE = /<\s*(script|style|template|iframe|object|noscript)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi;
const strip = s => String(s ?? '').replace(DROP_WHOLE, '');

const SELF_CLOSING = new Set(['br']);
const INLINE = new Set(['br', 'strong', 'b', 'em', 'i', 'a']);
const CANONICAL = { b: 'strong', i: 'em' };

function safeHref(raw) {
  const href = decode(raw).trim();
  return /^(https?:\/\/|mailto:|tel:|#|\/|[\w./-]+\.html)/i.test(href) && !/[\s"'<>]/.test(href)
    ? href
    : null;
}

/**
 * Limited inline HTML: <br>, <strong>, <em>, <a href>. Everything else is
 * flattened to its text. Unbalanced tags are closed at the end.
 */
export function rich(s) {
  const input = strip(s);
  let out = '';
  let last = 0;
  const open = [];

  for (const m of input.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
    out += esc(decode(input.slice(last, m.index)));
    last = m.index + m[0].length;

    const closing = m[0][1] === '/';
    const name = CANONICAL[m[1].toLowerCase()] || m[1].toLowerCase();
    if (!INLINE.has(m[1].toLowerCase())) continue;

    if (SELF_CLOSING.has(name)) {
      if (!closing) out += '<br>';
      continue;
    }
    if (closing) {
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }
    if (name === 'a') {
      const href = safeHref((m[2].match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) || [])[0]?.replace(/^href\s*=\s*['"]?/i, '').replace(/['"]$/, '') || '');
      if (!href) continue;
      out += `<a href="${esc(href)}">`;
    } else {
      out += `<${name}>`;
    }
    open.push(name);
  }

  out += esc(decode(input.slice(last)));
  while (open.length) out += `</${open.pop()}>`;
  return out.replace(/\s+/g, ' ').trim();
}

/** Slug used for uploaded file names — never trust an editor's filename. */
export function slug(s, fallback = 'file') {
  const out = String(s ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return out || fallback;
}
