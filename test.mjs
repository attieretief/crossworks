#!/usr/bin/env node
/* node test.mjs — the site's whole safety net.
   Covers what the browser does when an editor saves (the GitHub commit chain),
   what the build does with whatever lands in content.json, and the sanitiser
   that stands between the two. */

import { readFileSync } from 'node:fs';
import { github } from './shared/github.mjs';
import { clean, referencedAssets } from './shared/schema.mjs';
import { renderAll } from './shared/page.mjs';
import { rich, plain } from './shared/sanitize.mjs';

let failures = 0;
const check = (label, pass, extra = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
};

const content = JSON.parse(readFileSync(new URL('./content.json', import.meta.url), 'utf8'));

/* ── the commit chain ───────────────────────────────────────────────────── */

function stubGitHub({ movesUnderUs = 0, push = true } = {}) {
  const calls = [];
  let moved = 0;
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status });

  const doFetch = async (url, init = {}) => {
    const path = String(url).replace('https://api.github.com/repos/attieretief/crossworks', '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method: init.method || 'GET', body });

    if (path === '') return reply({ full_name: 'attieretief/crossworks', default_branch: 'main', permissions: { push } });
    if (path.startsWith('/git/ref/heads/')) return reply({ object: { sha: 'head' + moved } });
    if (path.startsWith('/git/commits/head')) return reply({ tree: { sha: 'tree' + moved } });
    if (path === '/git/blobs') return reply({ sha: 'blob' + calls.filter(c => c.path === '/git/blobs').length });
    if (path === '/git/trees') return reply({ sha: 'newtree' });
    if (path === '/git/commits') return reply({ sha: 'newcommit' });
    if (path.startsWith('/git/refs/heads/')) {
      if (moved < movesUnderUs) { moved++; return reply({ message: 'not a fast forward' }, 422); }
      return reply({ ok: true });
    }
    return reply({ message: 'unexpected ' + path }, 500);
  };

  return { doFetch, calls };
}

{
  const { doFetch, calls } = stubGitHub();
  const gh = github({ token: 'tok', repo: 'attieretief/crossworks', fetch: doFetch });
  const info = await gh.check();
  check('a key with push access is accepted', info.repo === 'attieretief/crossworks');

  const sha = await gh.commit({
    branch: 'main',
    files: [
      { path: 'content.json', content: '{}' },
      { path: 'img/uploads/a.jpg', base64: 'AAAA' }
    ],
    message: 'Site edit by Vicki',
    author: { name: 'Vicki', email: 'info@crossworksmissions.org' }
  });
  check('the commit lands', sha === 'newcommit');
  check('one blob per file', calls.filter(c => c.path === '/git/blobs').length === 2);
  check('the photo is sent as base64', calls.find(c => c.body?.encoding === 'base64')?.content === undefined
    && calls.some(c => c.body?.encoding === 'base64'));
  check('the commit is credited to the editor', calls.find(c => c.path === '/git/commits')?.body.author.name === 'Vicki');
  check('it builds on the current head, not a blank tree',
    calls.find(c => c.path === '/git/trees')?.body.base_tree === 'tree0');
}

{
  const { doFetch } = stubGitHub({ push: false });
  let refused = false;
  try { await github({ token: 'tok', repo: 'attieretief/crossworks', fetch: doFetch }).check(); }
  catch (err) { refused = err.status === 403; }
  check('a read-only key is refused at sign-in', refused);
}

{
  /* someone else saves while this one is mid-flight */
  const { doFetch, calls } = stubGitHub({ movesUnderUs: 1 });
  const sha = await github({ token: 'tok', repo: 'attieretief/crossworks', fetch: doFetch }).commit({
    branch: 'main',
    files: [{ path: 'content.json', content: '{}' }],
    message: 'Site edit by Reynold',
    author: { name: 'Reynold', email: 'info@crossworksmissions.org' }
  });
  check('a branch that moved is rebuilt on, not clobbered', sha === 'newcommit');
  check('the retry rebased onto the new head',
    calls.filter(c => c.path === '/git/trees').map(c => c.body.base_tree).join(',') === 'tree0,tree1');
  check('the photos were not re-uploaded on the retry', calls.filter(c => c.path === '/git/blobs').length === 1);
  check('nothing was force-pushed', !calls.some(c => c.body?.force));
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
