/* The single source of the page's markup. `build.mjs` runs it locally; the
   Worker runs the same function when an editor saves, so index.html on GitHub
   Pages is always plain static HTML — no client-side rendering, no JS needed to
   read the site. */

import { esc, plain, rich } from './sanitize.mjs';

/* data-edit marks a field the floating editor can change; data-rich allows the
   small inline tag set (<br>, <strong>, <em>, <a>) instead of plain text. */
const t = path => `data-edit="${esc(path)}"`;

function field(path, value, tag, cls, { rich: isRich = false } = {}) {
  const attrs = [cls ? `class="${esc(cls)}"` : '', t(path), isRich ? 'data-rich="1"' : '']
    .filter(Boolean).join(' ');
  return `<${tag} ${attrs}>${isRich ? rich(value) : plain(value)}</${tag}>`;
}

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

function newsletterSection(n) {
  const issues = (n.issues || []).map((issue, i) => `        <li data-item="newsletter.issues.${i}" data-kind="issue">
          <a href="${esc(issue.file)}" ${issue.file.endsWith('.pdf') ? 'target="_blank" rel="noopener"' : ''}>
            <span class="issue-date" data-edit="newsletter.issues.${i}.date">${plain(issue.date)}</span>
            <span class="issue-title" data-edit="newsletter.issues.${i}.title">${plain(issue.title)}</span>
          </a>
        </li>`).join('\n');

  return `<section class="section section-light" id="newsletter">
  <div class="wrap narrow">
    <p class="overline dark" ${t('newsletter.overline')}>${plain(n.overline)}</p>
    <h2 class="section-title dark center" ${t('newsletter.title')}>${plain(n.title)}</h2>
    <p class="body-lg center" ${t('newsletter.blurb')} data-rich="1">${rich(n.blurb)}</p>

    <form class="signup" id="signup" novalidate>
      <label class="sr-only" for="signup-name">Your name</label>
      <input id="signup-name" name="name" type="text" autocomplete="name" placeholder="Your name" required>
      <label class="sr-only" for="signup-email">Your email</label>
      <input id="signup-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
      <div class="hp" aria-hidden="true"><label>Leave this empty<input name="company" tabindex="-1" autocomplete="off"></label></div>
      <button class="btn btn-gold" type="submit" ${t('newsletter.buttonLabel')}>${plain(n.buttonLabel)}</button>
      <p class="signup-note" role="status" data-success="${plain(n.successMessage)}"></p>
    </form>

    <div class="issues${(n.issues || []).length ? '' : ' is-empty'}">
      <p class="issues-title" ${t('newsletter.archiveTitle')}>${plain(n.archiveTitle)}</p>
      <ul data-list="newsletter.issues">
${issues}
      </ul>
    </div>
  </div>
</section>`;
}

export function render(c) {
  const year = '2026';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${plain(c.meta.title)}</title>
<meta name="description" content="${plain(c.meta.description)}">
<meta property="og:title" content="Crossworks">
<meta property="og:description" content="${plain(c.meta.ogDescription)}">
<meta property="og:image" content="${esc(c.hero.image)}">
<meta property="og:type" content="website">
<link rel="icon" href="img/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
</head>
<body>

<header class="site-header" id="top">
  <a class="brand" href="#top">
    <img src="img/logo.png" alt="Crossworks logo" width="46" height="46">
    <span class="brand-name">Crossworks</span>
  </a>
  <nav class="nav">
    <a href="#who">Who we are</a>
    <a href="#projects">Projects</a>
    <a href="#gallery">Gallery</a>
    <a href="#newsletter">Newsletter</a>
    <a href="#contact">Contact</a>
    <a class="btn btn-outline btn-sm" href="#give">Donate</a>
  </nav>
  <button class="nav-toggle" aria-label="Menu" aria-expanded="false">☰</button>
</header>

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

${newsletterSection(c.newsletter)}

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

<footer class="site-footer">
  <div class="wrap footer-inner">
    <img src="img/logo.png" alt="" width="40" height="40">
    <p ${t('footer.line')}>${plain(c.footer.line)}</p>
    <p class="copy">© <span id="year">${year}</span> Crossworks</p>
  </div>
</footer>

<div class="toast" id="toast">Copied</div>
<script src="js/config.js"></script>
<script src="js/site.js"></script>
</body>
</html>
`;
}
