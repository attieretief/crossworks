document.getElementById('year').textContent = new Date().getFullYear();

const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.nav');
toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
});
nav.addEventListener('click', e => {
  if (e.target.tagName === 'A') nav.classList.remove('open');
});

const toast = document.getElementById('toast');
document.querySelectorAll('[data-copy]').forEach(el => {
  el.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el.textContent.trim());
      toast.textContent = 'Copied: ' + el.textContent.trim();
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1600);
    } catch (_) {}
  });
});

/* ── motion ─────────────────────────────────────────────────────────────── */
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* header condenses once you leave the hero */
const header = document.querySelector('.site-header');
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 60);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* reveal on scroll — staggered per group, no markup changes needed */
if (!reduced && 'IntersectionObserver' in window) {
  const groups = [
    '.section .overline', '.section h2', '.section .body-lg',
    '.pillar', '.country', '.card', '.grid-gallery img',
    '.bank', '.contacts > div', '.verse.small'
  ];
  const seen = new Set();
  groups.forEach(sel => document.querySelectorAll(sel).forEach(el => {
    if (seen.has(el) || el.closest('.hero')) return;
    seen.add(el);
    el.setAttribute('data-reveal', '');
  }));

  let fired = false;
  const io = new IntersectionObserver((entries, obs) => {
    fired = true;
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const peers = [...el.parentElement.children].filter(n => n.hasAttribute('data-reveal'));
      const step = Math.min(peers.indexOf(el), 5);
      el.style.transitionDelay = (step * 0.13) + 's';
      el.classList.add('in');
      el.addEventListener('transitionend', () => el.classList.add('done'), { once: true });
      obs.unobserve(el);
    });
  }, { rootMargin: '0px 0px -14% 0px', threshold: 0.05 });

  seen.forEach(el => io.observe(el));

  /* fail-safe: if the observer never runs, show everything rather than hide the page */
  setTimeout(() => {
    if (fired) return;
    io.disconnect();
    seen.forEach(el => el.classList.add('in'));
  }, 2500);
}

/* ── editor ─────────────────────────────────────────────────────────────── */
/* Loaded on demand only: ?edit in the URL, or Ctrl/Cmd + Shift + E. Visitors
   never download a byte of it. */
(() => {
  let loading = false;
  const openEditor = () => {
    if (loading) return;
    loading = true;
    const base = window.CROSSWORKS_BASE || '';
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = base + 'css/editor.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = base + 'js/editor.js';
    js.type = 'module';
    document.body.appendChild(js);
  };

  if (/[?&]edit\b/.test(location.search) || location.hash === '#edit') openEditor();
  addEventListener('keydown', e => {
    if (e.shiftKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      openEditor();
    }
  });
})();
