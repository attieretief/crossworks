#!/usr/bin/env node
/* content.json → index.html and one page per news post.
   Run by .github/workflows/build.yml on every push that touches the content or
   the templates; run it by hand after editing content.json locally. */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAll } from './shared/page.mjs';
import { clean } from './shared/schema.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const content = clean(JSON.parse(readFileSync(join(root, 'content.json'), 'utf8')));
const pages = renderAll(content);

for (const page of pages) {
  const target = join(root, page.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, page.html);
  console.log(`${page.path} — ${page.html.length.toLocaleString()} bytes`);
}

/* a renamed or deleted post must not leave its old page behind. The directory is
   made even when there are no letters, so the build step can stage it either way. */
const keep = new Set(pages.map(p => p.path.split('/')[1]));
const newsDir = join(root, 'news');
mkdirSync(newsDir, { recursive: true });
{
  for (const entry of readdirSync(newsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !keep.has(entry.name)) {
      rmSync(join(newsDir, entry.name), { recursive: true, force: true });
      console.log(`removed news/${entry.name}/ — no longer in content.json`);
    }
  }
}
