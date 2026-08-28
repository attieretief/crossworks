/* The shape of content.json, and the only gate between an editor's browser and
   what gets committed. `clean()` rebuilds the document field by field: anything
   not described here is dropped, so a tampered-with request cannot invent paths,
   inject markup or grow the file without bound. */

import { plain, rich, slug } from './sanitize.mjs';

const LIMITS = {
  short: 200, medium: 600, long: 2200,
  pillars: 6, groups: 12, items: 12, gallery: 60, posts: 60, paragraphs: 80
};

const PATH_OK = /^img\/[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/;
const NO_TRAVERSAL = s => !s.includes('..') && !s.includes('//');

const str = (v, max) => plain(v).slice(0, max);
const html = (v, max) => rich(v).slice(0, max);

function asset(v, fallback) {
  const s = String(v ?? '').trim();
  return PATH_OK.test(s) && NO_TRAVERSAL(s) ? s : fallback;
}

const list = (v, max, fn) => (Array.isArray(v) ? v : []).slice(0, max).map(fn);

const id = (v, prefix, i) => {
  const s = String(v ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
  return s || `${prefix}-${i}`;
};

/** Two posts must never resolve to the same URL, or one file overwrites the other. */
function uniqueSlugs(posts) {
  const seen = new Set();
  for (const post of posts) {
    let candidate = post.slug;
    for (let n = 2; seen.has(candidate); n++) candidate = `${post.slug}-${n}`;
    post.slug = candidate;
    seen.add(candidate);
  }
  return posts;
}

export function clean(input) {
  const c = input && typeof input === 'object' ? input : {};
  const src = key => (c[key] && typeof c[key] === 'object' ? c[key] : {});
  const meta = src('meta'), hero = src('hero'), who = src('who'), projects = src('projects');
  const gallery = src('gallery'), news = src('news'), give = src('give');
  const contact = src('contact'), footer = src('footer');

  return {
    meta: {
      title: str(meta.title, LIMITS.short) || 'Crossworks',
      description: str(meta.description, LIMITS.medium),
      ogDescription: str(meta.ogDescription, LIMITS.medium)
    },
    hero: {
      image: asset(hero.image, 'img/hero.jpg'),
      alt: str(hero.alt, LIMITS.short),
      overline: str(hero.overline, LIMITS.short),
      title: html(hero.title, LIMITS.short),
      lead: html(hero.lead, LIMITS.long),
      verse: html(hero.verse, LIMITS.medium),
      primaryCta: str(hero.primaryCta, 40),
      secondaryCta: str(hero.secondaryCta, 40)
    },
    who: {
      overline: str(who.overline, LIMITS.short),
      title: html(who.title, LIMITS.short),
      body: html(who.body, LIMITS.long),
      pillars: list(who.pillars, LIMITS.pillars, (p, i) => ({
        id: id(p?.id, 'p', i),
        title: str(p?.title, LIMITS.short),
        body: html(p?.body, LIMITS.medium)
      }))
    },
    projects: {
      overline: str(projects.overline, LIMITS.short),
      title: str(projects.title, LIMITS.short),
      groups: list(projects.groups, LIMITS.groups, (g, gi) => ({
        id: id(g?.id, 'g', gi),
        country: str(g?.country, LIMITS.short),
        items: list(g?.items, LIMITS.items, (p, pi) => ({
          id: id(p?.id, 'pr', pi),
          title: str(p?.title, LIMITS.short),
          image: asset(p?.image, 'img/hero.jpg'),
          alt: str(p?.alt, LIMITS.short),
          body: html(p?.body, LIMITS.long),
          funding: str(p?.funding, 60),
          wide: p?.wide === true
        }))
      }))
    },
    gallery: {
      overline: str(gallery.overline, LIMITS.short),
      title: str(gallery.title, LIMITS.short),
      items: list(gallery.items, LIMITS.gallery, (g, i) => ({
        id: id(g?.id, 'gal', i),
        src: asset(g?.src, 'img/hero.jpg'),
        alt: str(g?.alt, LIMITS.short)
      }))
    },
    news: {
      overline: str(news.overline, LIMITS.short),
      title: str(news.title, LIMITS.short),
      blurb: html(news.blurb, LIMITS.long),
      emptyNote: str(news.emptyNote, LIMITS.short),
      posts: uniqueSlugs(list(news.posts, LIMITS.posts, (n, i) => {
        const title = str(n?.title, LIMITS.short) || 'Untitled';
        return {
          id: id(n?.id, 'nl', i),
          slug: slug(n?.slug || title, `post-${i + 1}`),
          date: str(n?.date, 60),
          title,
          summary: html(n?.summary, LIMITS.long),
          image: asset(n?.image, 'img/hero.jpg'),
          alt: str(n?.alt, LIMITS.short),
          body: list(n?.body, LIMITS.paragraphs, para => html(para, LIMITS.long)).filter(Boolean)
        };
      }))
    },
    give: {
      overline: str(give.overline, LIMITS.short),
      title: str(give.title, LIMITS.short),
      body: html(give.body, LIMITS.long),
      bankTitle: str(give.bankTitle, LIMITS.short),
      bankHint: str(give.bankHint, LIMITS.short),
      fields: list(give.fields, 10, (f, i) => ({
        id: id(f?.id, 'bk', i),
        label: str(f?.label, 60),
        value: str(f?.value, 80),
        copy: f?.copy !== false
      })),
      footNote: html(give.footNote, LIMITS.medium)
    },
    contact: {
      overline: str(contact.overline, LIMITS.short),
      title: str(contact.title, LIMITS.short),
      label: str(contact.label, 60),
      email: str(contact.email, 120),
      verse: html(contact.verse, LIMITS.medium)
    },
    footer: { line: str(footer.line, LIMITS.medium) }
  };
}

/** Every asset path the cleaned document actually points at. */
export function referencedAssets(c) {
  return new Set([
    c.hero.image,
    ...c.projects.groups.flatMap(g => g.items.map(p => p.image)),
    ...c.gallery.items.map(g => g.src),
    ...c.news.posts.map(n => n.image)
  ].filter(Boolean));
}
