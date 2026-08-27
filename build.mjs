#!/usr/bin/env node
/* Regenerates index.html from content.json. Run it after editing content.json
   by hand; the Worker does exactly the same thing when Vicki or Reynold save
   from the site. */

import { readFileSync, writeFileSync } from 'node:fs';
import { render } from './shared/page.mjs';

const content = JSON.parse(readFileSync(new URL('./content.json', import.meta.url), 'utf8'));
const html = render(content);
writeFileSync(new URL('./index.html', import.meta.url), html);
console.log(`index.html — ${html.length.toLocaleString()} bytes`);
