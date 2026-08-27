/* The single source of the site's markup. `build.mjs` runs it in the GitHub
   Actions build; the editor runs it in the browser to preview a change. The
   published site is plain static HTML — no client-side rendering, and it reads
   fine with JavaScript off. */

import { esc, plain, rich, slug } from './sanitize.mjs';

/* data-edit marks a field the in-page editor can change; data-rich allows the
   small inline tag set (<br>, <strong>, <em>, <a>) instead of plain text. */
const t = path => `data-edit="${esc(path)}"`;

function field(path, value, tag, cls, { rich: isRich = false } = {}) {
  const attrs = [cls ? `class="${esc(cls)}"` : '', t(path), isRich ? 'data-rich="1"' : '']
    .filter(Boolean).join(' ');
  return `<${tag} ${attrs}>${isRich ? rich(value) : plain(value)}</${tag}>`;
}

export const postPath = post => `news/${slug(post.slug || post.title, post.id)}/index.html`;
export const postUrl = post => `news/${slug(post.slug || post.title, post.id)}/`;

/* ── shared chrome ──────────────────────────────────────────────────────── */

function head({ title, description, image, base }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${plain(title)}</title>
<meta name="description" content="${plain(description)}">
<meta property="og:title" content="${plain(title)}">
<meta property="og:description" content="${plain(description)}">
<meta property="og:image" content="${base}${esc(image)}">
<meta property="og:type" content="website">
<link rel="icon" href="${base}img/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${base}css/style.css">`;
}

function header(base) {
  const home = base || '';
  return `<header class="site-header" id="top">
  <a class="brand" href="${home}${base ? '' : '#top'}">
    <img src="${base}img/logo.png" alt="Crossworks logo" width="46" height="46">
    <span class="brand-name">Crossworks</span>
  </a>
  <nav class="nav">
    <a href="${home}#who">Who we are</a>
    <a href="${home}#projects">Projects</a>
    <a href="${home}#gallery">Gallery</a>
    <a href="${home}#news">News</a>
    <a href="${home}#contact">Contact</a>
    <a class="btn btn-outline btn-sm" href="${home}#give">Donate</a>
  </nav>
  <button class="nav-toggle" aria-label="Menu" aria-expanded="false">☰</button>
</header>`;
}

function footer(c, base) {
  return `<footer class="site-footer">
  <div class="wrap footer-inner">
    <img src="${base}img/logo.png" alt="" width="40" height="40">
    <p ${t('footer.line')}>${plain(c.footer.line)}</p>
    <p class="copy">© <span id="year">2026</span> Crossworks</p>
  </div>
</footer>`;
}

const scripts = base => `<div class="toast" id="toast">Copied</div>
<script>window.CROSSWORKS_BASE=${JSON.stringify(base || './')}</script>
<script src="${base}js/site.js"></script>`;

/* ── home page sections ─────────────────────────────────────────────────── */

function projectCard(card, path) {
  const wide = card.wide ? ' card-wide' : '';
  const funding = `\n          <p class="need${card.funding ? '' : ' is-empty'}"${card.funding ? '' : ' hidden'}>Funding required: <strong ${t(`${path}.funding`)}>${plain(card.funding)}</strong></p>`;
  return `      <article class="card${wide}" data-item="${esc(path)}" data-kind="project">
        <img src="${esc(card.image)}" alt="${plain(card.alt)}" loading="lazy" ${t(`${path}.image`)} data-image>
        <div class="card-body">
          ${field(`${path}.title`, card.title, 'h3', '')}
          ${field(`${path}.body`, card.body, 'p', '', { rich: true })}${funding}
        </div>
      </article>`;
}

function projectGroup(group, path) {
  return `    <p class="country" ${t(`${path}.country`)} data-item="${esc(path)}" data-kind="group">${plain(group.country)}</p>
    <div class="cards" data-list="${esc(path)}.items">
${group.items.map((c, i) => projectCard(c, `${path}.items.${i}`)).join('\n')}
    </div>`;
}

function newsSection(c) {
  const posts = c.news.posts;
  const cards = posts.map((post, i) => `      <article class="post-card" data-item="news.posts.${i}" data-kind="post">
        <a class="post-link" href="${postUrl(post)}">
          <img src="${esc(post.image)}" alt="${plain(post.alt)}" loading="lazy" ${t(`news.posts.${i}.image`)} data-image>
          <div class="post-card-body">
            <p class="post-date" ${t(`news.posts.${i}.date`)}>${plain(post.date)}</p>
            <h3 ${t(`news.posts.${i}.title`)}>${plain(post.title)}</h3>
            <p class="post-summary" ${t(`news.posts.${i}.summary`)} data-rich="1">${rich(post.summary)}</p>
            <span class="post-more">Read the letter</span>
          </div>
        </a>
      </article>`).join('\n');

  return `<section class="section section-light" id="news">
  <div class="wrap">
    <p class="overline dark" ${t('news.overline')}>${plain(c.news.overline)}</p>
    <h2 class="section-title dark" ${t('news.title')}>${plain(c.news.title)}</h2>
    <p class="body-lg" ${t('news.blurb')} data-rich="1">${rich(c.news.blurb)}</p>
    <div class="posts${posts.length ? '' : ' is-empty'}" data-list="news.posts">
${cards}
    </div>
${posts.length ? '' : `    <p class="posts-empty" ${t('news.emptyNote')}>${plain(c.news.emptyNote)}</p>\n`}  </div>
</section>`;
}

export function renderHome(c) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head({ title: c.meta.title, description: c.meta.description, image: c.hero.image, base: '' })}
</head>
<body>

${header('')}

<section class="hero">
  <img class="hero-img" src="${esc(c.hero.image)}" alt="${plain(c.hero.alt)}" ${t('hero.image')} data-image>
  <div class="hero-inner">
    <p class="overline" ${t('hero.overline')}>${plain(c.hero.overline)}</p>
    <h1 ${t('hero.title')} data-rich="1">${rich(c.hero.title)}</h1>
    <p class="lead" ${t('hero.lead')} data-rich="1">${rich(c.hero.lead)}</p>
    <p class="verse" ${t('hero.verse')} data-rich="1">${rich(c.hero.verse)}</p>
    <div class="hero-actions">
      <a class="btn btn-gold" href="#give" ${t('hero.primaryCta')}>${plain(c.hero.primaryCta)}</a>
      <a class="btn btn-ghost" href="#projects" ${t('hero.secondaryCta')}>${plain(c.hero.secondaryCta)}</a>
    </div>
  </div>
</section>

<section class="section section-light" id="who">
  <div class="wrap narrow center">
    <p class="overline dark" ${t('who.overline')}>${plain(c.who.overline)}</p>
    <h2 ${t('who.title')} data-rich="1">${rich(c.who.title)}</h2>
    <p class="body-lg" ${t('who.body')} data-rich="1">${rich(c.who.body)}</p>
  </div>
  <div class="wrap pillars" data-list="who.pillars">
${c.who.pillars.map((p, i) => `    <div class="pillar" data-item="who.pillars.${i}" data-kind="pillar"><span>${String(i + 1).padStart(2, '0')}</span>${field(`who.pillars.${i}.title`, p.title, 'h3', '')}${field(`who.pillars.${i}.body`, p.body, 'p', '', { rich: true })}</div>`).join('\n')}
  </div>
</section>

<section class="section section-dark" id="projects">
  <div class="wrap">
    <p class="overline" ${t('projects.overline')}>${plain(c.projects.overline)}</p>
    <h2 class="section-title" ${t('projects.title')}>${plain(c.projects.title)}</h2>

    <div data-list="projects.groups">
${c.projects.groups.map((g, i) => projectGroup(g, `projects.groups.${i}`)).join('\n')}
    </div>
  </div>
</section>

<section class="section section-light" id="gallery">
  <div class="wrap">
    <p class="overline dark" ${t('gallery.overline')}>${plain(c.gallery.overline)}</p>
    <h2 class="section-title dark" ${t('gallery.title')}>${plain(c.gallery.title)}</h2>
    <div class="grid-gallery" data-list="gallery.items">
${c.gallery.items.map((g, i) => `      <img src="${esc(g.src)}" alt="${plain(g.alt)}" loading="lazy" data-item="gallery.items.${i}" data-kind="photo" ${t(`gallery.items.${i}.src`)} data-image>`).join('\n')}
    </div>
  </div>
</section>

${newsSection(c)}

<section class="section section-gold" id="give">
  <div class="wrap narrow">
    <p class="overline dark" ${t('give.overline')}>${plain(c.give.overline)}</p>
    <h2 class="section-title dark" ${t('give.title')}>${plain(c.give.title)}</h2>
    <p class="body-lg center" ${t('give.body')} data-rich="1">${rich(c.give.body)}</p>
    <div class="bank">
      <p class="bank-title"><span ${t('give.bankTitle')}>${plain(c.give.bankTitle)}</span> <span ${t('give.bankHint')}>${plain(c.give.bankHint)}</span></p>
      <dl>
${c.give.fields.map((fl, i) => `        <div><dt ${t(`give.fields.${i}.label`)}>${plain(fl.label)}</dt><dd ${fl.copy ? 'data-copy ' : ''}${t(`give.fields.${i}.value`)}>${plain(fl.value)}</dd></div>`).join('\n')}
      </dl>
      <p class="foot-note" ${t('give.footNote')} data-rich="1">${rich(c.give.footNote)}</p>
    </div>
  </div>
</section>

<section class="section section-dark" id="contact">
  <div class="wrap narrow center">
    <p class="overline" ${t('contact.overline')}>${plain(c.contact.overline)}</p>
    <h2 class="section-title" ${t('contact.title')}>${plain(c.contact.title)}</h2>
    <div class="contacts contacts-single">
      <div><p class="c-name" ${t('contact.label')}>${plain(c.contact.label)}</p><a href="mailto:${plain(c.contact.email)}" ${t('contact.email')}>${plain(c.contact.email)}</a></div>
    </div>
    <p class="verse small" ${t('contact.verse')} data-rich="1">${rich(c.contact.verse)}</p>
  </div>
</section>

${footer(c, '')}

${scripts('')}
</body>
</html>
`;
}

/* ── a single post ──────────────────────────────────────────────────────── */

export function renderPost(c, index) {
  const post = c.news.posts[index];
  const base = '../../';
  const path = `news.posts.${index}`;
  const summary = plain(post.summary) || plain(post.title);

  return `<!DOCTYPE html>
<html lang="en">
<head>
${head({ title: `${post.title} — Crossworks`, description: summary, image: post.image, base })}
</head>
<body class="post-page" data-base="${base}">

${header(base)}

<article class="post">
  <div class="post-banner">
    <img src="${base}${esc(post.image)}" alt="${plain(post.alt)}" ${t(`${path}.image`)} data-image>
    <div class="post-banner-inner">
      <p class="overline" ${t(`${path}.date`)}>${plain(post.date)}</p>
      <h1 ${t(`${path}.title`)}>${plain(post.title)}</h1>
    </div>
  </div>

  <div class="wrap narrow post-body">
    <p class="post-lead" ${t(`${path}.summary`)} data-rich="1">${rich(post.summary)}</p>
    <div data-list="${path}.body">
${post.body.map((para, i) => `      <p data-item="${path}.body.${i}" data-kind="para" ${t(`${path}.body.${i}`)} data-rich="1">${rich(para)}</p>`).join('\n')}
    </div>
    <p class="post-back"><a href="${base}#news">← All the letters</a></p>
  </div>
</article>

${footer(c, base)}

${scripts(base)}
</body>
</html>
`;
}

/** Every file the site is made of. */
export function renderAll(c) {
  return [
    { path: 'index.html', html: renderHome(c) },
    ...c.news.posts.map((post, i) => ({ path: postPath(post), html: renderPost(c, i) }))
  ];
}
