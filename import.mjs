#!/usr/bin/env node
/* node import.mjs ~/Downloads/crossworks-2026-08-27-vicki.json
   Takes the file an editor sent, checks it, writes the content and any photos
   into the repo, and rebuilds the pages. It changes files and nothing else —
   look at the diff, then commit if you are happy. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { unpack } from './shared/handover.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const [, , given] = process.argv;

if (!given) {
  console.error('Which file?  node import.mjs ~/Downloads/crossworks-….json');
  process.exit(1);
}

let doc;
try {
  doc = unpack(readFileSync(resolve(given), 'utf8'));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const before = readFileSync(join(root, 'content.json'), 'utf8');
const after = JSON.stringify(doc.content, null, 2) + '\n';

console.log(`\nFrom ${doc.editor || 'someone'}${doc.written ? `, written ${new Date(doc.written).toLocaleString('en-ZA')}` : ''}.`);

if (before === after && !doc.photos.length) {
  console.log('Nothing in it differs from what is already on the site.\n');
  process.exit(0);
}

for (const photo of doc.photos) {
  const target = join(root, photo.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, Buffer.from(photo.base64, 'base64'));
  console.log(`  + ${photo.path}`);
}
writeFileSync(join(root, 'content.json'), after);
console.log(`  ~ content.json${before === after ? ' (unchanged)' : ''}`);

for (const { path, why } of doc.skipped) console.log(`  · left out ${path} — ${why}`);
for (const path of doc.missing) {
  console.log(`  ! ${path} is used by the page but was not in the file — the page will show a gap`);
}

console.log('');
execFileSync('node', [join(root, 'build.mjs')], { stdio: 'inherit' });

/* only what this import touched — anything else in the tree is your own work */
try {
  const touched = ['content.json', 'index.html', 'news', ...doc.photos.map(p => p.path)];
  const stat = execFileSync('git', ['-C', root, 'diff', '--stat', '--', ...touched], { encoding: 'utf8' }).trim();
  console.log('\n' + (stat || 'Nothing changed in the site itself.'));
} catch (_) { /* not a git checkout, or git is unhappy — the files are written either way */ }

console.log(`\nLook it over, then:  git add -A && git commit -m "Site edit by ${doc.editor || 'an editor'}" && git push\n`);
