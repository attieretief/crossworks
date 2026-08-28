#!/usr/bin/env node
/* node test.mjs — the site's whole safety net.
   Covers the handover file an editor downloads and Attie imports, what the
   build does with whatever lands in content.json, and the sanitiser that stands
   between the two. */

import { readFileSync } from 'node:fs';
import { pack, unpack } from './shared/handover.mjs';
import { clean, referencedAssets } from './shared/schema.mjs';
import { renderAll } from './shared/page.mjs';
import { rich, plain } from './shared/sanitize.mjs';

let failures = 0;
const check = (label, pass, extra = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
};

const content = JSON.parse(readFileSync(new URL('./content.json', import.meta.url), 'utf8'));

/* ── the handover file ──────────────────────────────────────────────────── */

const jpeg = 'data:image/jpeg;base64,' + Buffer.from('pretend-jpeg').toString('base64');

{
  const edited = JSON.parse(JSON.stringify(content));
  edited.who.body = 'Changed by Vicki.';
  edited.gallery.items.push({ id: 'gal-new', src: 'img/uploads/2026-08-27-borehole.jpg', alt: 'A new borehole' });

  const file = pack({
    content: edited,
    uploads: new Map([
      ['img/uploads/2026-08-27-borehole.jpg', jpeg],
      ['img/uploads/changed-my-mind.jpg', jpeg]      /* dropped before download */
    ]),
    editor: 'Vicki'
  });

  check('the file says what it is', file.format === 'crossworks/handover@1' && file.editor === 'Vicki');
  check('only photos the page uses are carried',
    Object.keys(file.uploads).join() === 'img/uploads/2026-08-27-borehole.jpg');

  const back = unpack(JSON.stringify(file));
  check('it survives the round trip', back.content.who.body === 'Changed by Vicki.');
  check('the photo comes back as bytes', back.photos[0]?.path === 'img/uploads/2026-08-27-borehole.jpg'
    && Buffer.from(back.photos[0].base64, 'base64').toString() === 'pretend-jpeg');
  check('nothing is reported missing', back.missing.length === 0);
}

{
  /* the file arrives by email from someone else's laptop — treat it as hostile */
  const hostile = {
    format: 'crossworks/handover@1',
    editor: 'Vicki',
    content: { ...content, who: { ...content.who, body: '<script>fetch("//evil")</script>caught' } },
    uploads: {
      '../../.github/workflows/evil.yml': jpeg,
      'img/uploads/../../../etc/passwd': jpeg,
      'img/uploads/notaphoto.jpg': 'data:text/html;base64,' + Buffer.from('<script>').toString('base64'),
      'js/editor.js': jpeg
    }
  };
  const back = unpack(JSON.stringify(hostile));
  check('a hostile file yields no files to write', back.photos.length === 0, `${back.photos.length} would be written`);
  check('every rejected path is reported, not silently dropped', back.skipped.length === 4);
  check('its markup is stripped on the way in', back.content.who.body === 'caught');
}

{
  let refused = '';
  try { unpack('{"format":"something-else"}'); } catch (err) { refused = err.message; }
  check('a file from somewhere else is refused', /Crossworks handover file/.test(refused));
  try { unpack('not json at all'); } catch (err) { refused = err.message; }
  check('a mangled file is refused', /not readable/.test(refused));
}

{
  /* a photo referenced but not carried — the gap is named rather than hidden */
  const doc = {
    format: 'crossworks/handover@1',
    content: { ...content, gallery: { ...content.gallery, items: [{ id: 'g', src: 'img/uploads/lost.jpg', alt: '' }] } },
    uploads: {}
  };
  check('a missing photo is called out', unpack(JSON.stringify(doc)).missing.includes('img/uploads/lost.jpg'));
}

/* ── the gate on what gets stored ───────────────────────────────────────── */

check('content.json is already canonical', JSON.stringify(clean(content)) === JSON.stringify(content));

{
  const evil = clean({
    ...content,
    who: { ...content.who, body: 'Hello <img src=x onerror="fetch(1)"> <script>alert(1)</script> world' },
    hero: { ...content.hero, image: 'https://evil.example/x.jpg' }
  });
  check('markup is stripped, and script bodies with it', evil.who.body === 'Hello world');
  check('an off-site image is refused', evil.hero.image === 'img/hero.jpg');
  check('a traversal path is refused', clean({ hero: { image: '../../.github/workflows/x.yml' } }).hero.image === 'img/hero.jpg');
  check('inline emphasis and links survive', rich('keep <em>this</em> and <a href="https://x.co">that</a>')
    === 'keep <em>this</em> and <a href="https://x.co">that</a>');
  check('a javascript: link does not', !rich('<a href="javascript:alert(1)">x</a>').includes('javascript'));
  check('plain fields keep their ampersands', plain('Zambia & Angola') === 'Zambia &amp; Angola');

  const html = renderAll(evil).map(f => f.html).join('');
  check('nothing executable reaches the built pages',
    !/<script>alert/.test(html) && !/onerror=/.test(html) && !html.includes('evil.example'));
}

/* ── pages ──────────────────────────────────────────────────────────────── */

{
  const withPosts = clean({
    ...content,
    news: {
      ...content.news,
      posts: [
        { title: 'Kalabo', date: 'August 2026', summary: 'One', image: 'img/hero.jpg', alt: '', body: ['a'] },
        { title: 'Kalabo', date: 'July 2026', summary: 'Two', image: 'img/hero.jpg', alt: '', body: ['b'] }
      ]
    }
  });
  check('two letters of the same name get separate pages',
    withPosts.news.posts.map(p => p.slug).join(',') === 'kalabo,kalabo-2');

  const pages = renderAll(withPosts);
  check('a page is built per letter',
    pages.map(p => p.path).join(' ') === 'index.html news/kalabo/index.html news/kalabo-2/index.html');
  check('a letter page reaches its assets from two levels down',
    pages[1].html.includes('href="../../css/style.css"'));
  check('every photo the pages use is a repo path',
    [...referencedAssets(withPosts)].every(p => p.startsWith('img/')));
}

process.exit(failures ? 1 : 0);
