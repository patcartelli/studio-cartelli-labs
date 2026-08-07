// src/scripts/parallax.ts
// Parallax on all featured cards — translates the inner wrapper (image + title together)

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const cards = document.querySelectorAll<HTMLElement>('[data-parallax-card]');

  cards.forEach((card) => {
    const inner = card.querySelector<HTMLElement>('[data-parallax-image]');
    if (!inner) return;

    // Find the parent RevealWrapper (if any) so we can wait for reveal to finish
    const revealParent = card.closest<HTMLElement>('[data-reveal]');

    const initialRect = card.getBoundingClientRect();
    let isVisible = initialRect.top < window.innerHeight && initialRect.bottom > 0;
    let ticking = false;

    const observer = new IntersectionObserver(
      (entries) => { isVisible = entries[0].isIntersecting; },
      { threshold: 0 }
    );
    observer.observe(card);

    const MAX_OFFSET = 30; // Cap parallax shift in px

    const update = () => {
      ticking = false;
      if (!isVisible) return;

      // Skip parallax while scroll-reveal entrance is still animating
      if (revealParent && !revealParent.classList.contains('is-visible')) return;

      const rect = card.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const cardCenter = rect.top + rect.height / 2;
      const raw = (cardCenter - viewportCenter) * 0.05;
      const offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, raw));

      inner.style.transform = `translateY(${offset}px)`;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });

    update();
  });
}
