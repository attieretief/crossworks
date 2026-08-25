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
