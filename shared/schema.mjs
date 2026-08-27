/* The shape of content.json, and the only gate between an editor's browser and
   what gets committed. `clean()` rebuilds the document field by field: anything
   not described here is dropped, so a tampered-with request cannot invent paths,
   inject markup or grow the file without bound. */

import { plain, rich } from './sanitize.mjs';

const LIMITS = {
  short: 200, medium: 600, long: 2200,
  pillars: 6, groups: 12, items: 12, gallery: 60, issues: 40
};

const PATH_OK = /^(img|newsletters)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/;
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

export function clean(input) {
  const c = input && typeof input === 'object' ? input : {};
  const src = key => (c[key] && typeof c[key] === 'object' ? c[key] : {});
  const meta = src('meta'), hero = src('hero'), who = src('who'), projects = src('projects');
  const gallery = src('gallery'), newsletter = src('newsletter'), give = src('give');
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
    newsletter: {
      overline: str(newsletter.overline, LIMITS.short),
      title: str(newsletter.title, LIMITS.short),
      blurb: html(newsletter.blurb, LIMITS.long),
      buttonLabel: str(newsletter.buttonLabel, 40) || 'Sign me up',
      successMessage: str(newsletter.successMessage, LIMITS.short) || 'Thank you.',
      archiveTitle: str(newsletter.archiveTitle, LIMITS.short) || 'Past issues',
      issues: list(newsletter.issues, LIMITS.issues, (n, i) => ({
        id: id(n?.id, 'nl', i),
        date: str(n?.date, 60),
        title: str(n?.title, LIMITS.short),
        file: asset(n?.file, '')
      })).filter(n => n.file)
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
    ...c.newsletter.issues.map(n => n.file)
  ].filter(Boolean));
}
