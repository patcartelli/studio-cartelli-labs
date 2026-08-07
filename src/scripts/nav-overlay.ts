// src/scripts/nav-overlay.ts
// Mobile full-screen overlay open/close with focus trap.

const toggleButton = document.querySelector('.nav__menu-toggle') as HTMLButtonElement | null;
const overlay = document.getElementById('nav-overlay') as HTMLElement | null;
const closeButton = document.querySelector('.nav__overlay-close') as HTMLButtonElement | null;

function getFocusableElements(): HTMLElement[] {
  if (!overlay) return [];
  return Array.from(overlay.querySelectorAll<HTMLElement>('a, button'));
}

function openOverlay(): void {
  if (!overlay || !toggleButton) return;
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
  toggleButton.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  // Make overlay elements keyboard-accessible when open
  getFocusableElements().forEach(el => el.removeAttribute('tabindex'));
  closeButton?.focus();
}

function closeOverlay(): void {
  if (!overlay || !toggleButton) return;
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  toggleButton.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  // Remove from tab order when hidden so aria-hidden elements are not focusable
  getFocusableElements().forEach(el => el.setAttribute('tabindex', '-1'));
  toggleButton.focus();
}

function isOverlayOpen(): boolean {
  return overlay?.classList.contains('is-open') ?? false;
}

// Toggle button opens overlay
toggleButton?.addEventListener('click', openOverlay);

// Close button closes overlay
closeButton?.addEventListener('click', closeOverlay);

// Escape key closes overlay
document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isOverlayOpen()) {
    closeOverlay();
  }
});

// Focus trap
document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Tab' || !isOverlayOpen()) return;

  const focusable = getFocusableElements();
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey) {
    // Shift+Tab: if on first element, wrap to last
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  } else {
    // Tab: if on last element, wrap to first
    if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
