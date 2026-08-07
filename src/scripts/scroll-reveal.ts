// src/scripts/scroll-reveal.ts
// Scroll-triggered fade-up for [data-reveal] elements.
// Hidden state lives in CSS (under .js [data-reveal]) so it's painted on
// the first frame; this script only flips on .is-visible when the element
// scrolls into view.

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');

if (prefersReducedMotion) {
  elements.forEach(el => el.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  elements.forEach(el => observer.observe(el));
}
