/* The file an editor hands over.
   One JSON document carrying the whole site's content plus any photos they
   added, as data URLs. It is self-contained on purpose: it survives email and
   WhatsApp, needs no archive tool at either end, and can be read by eye if
   anything ever looks wrong. */

import { clean, referencedAssets } from './schema.mjs';

export const FORMAT = 'crossworks/handover@1';

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const UPLOAD_PATH = /^img\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

/** Build the handover file. Photos the page no longer uses are left out. */
export function pack({ content, uploads, editor }) {
  const cleaned = clean(content);
  const wanted = referencedAssets(cleaned);
  const carried = {};
  for (const [path, dataUrl] of uploads) {
    if (wanted.has(path) && UPLOAD_PATH.test(path) && DATA_URL.test(dataUrl)) carried[path] = dataUrl;
  }
  return {
    format: FORMAT,
    editor: String(editor || '').slice(0, 80),
    written: new Date().toISOString(),
    content: cleaned,
    uploads: carried
  };
}

/**
 * Read a handover file. Everything in it is treated as untrusted — it arrives
 * by email from someone else's laptop — so the content goes back through the
 * schema and only real photos at real upload paths come out the other side.
 */
export function unpack(raw) {
  let doc;
  try {
    doc = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (_) {
    throw new Error('That file is not readable as a handover file.');
  }
  if (!doc || doc.format !== FORMAT) {
    throw new Error('That does not look like a Crossworks handover file.');
  }

  const content = clean(doc.content);
  const wanted = referencedAssets(content);
  const photos = [];
  const skipped = [];

  for (const [path, dataUrl] of Object.entries(doc.uploads || {})) {
    const match = DATA_URL.exec(String(dataUrl));
    if (!UPLOAD_PATH.test(path) || path.includes('..') || !match) {
      skipped.push({ path, why: 'not a photo at a safe path' });
      continue;
    }
    if (!wanted.has(path)) {
      skipped.push({ path, why: 'the page does not use it' });
      continue;
    }
    photos.push({ path, type: match[1], base64: match[2] });
  }

  /* a photo the content points at but the file did not carry */
  const missing = [...wanted].filter(p => p.startsWith('img/uploads/') && !photos.some(f => f.path === p));

  return { content, photos, skipped, missing, editor: String(doc.editor || '').slice(0, 80), written: doc.written };
}
