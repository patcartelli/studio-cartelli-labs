// src/scripts/email-copy-fallback.ts
// Progressive enhancement for mailto: links — copies the address to the
// clipboard on click as a fallback for users without a configured mail
// client. Does not interfere with the native mailto: navigation.
function initEmailCopyFallback(link: HTMLAnchorElement): void {
  const email = link.dataset.emailCopy;
  const label = link.querySelector<HTMLElement>('[data-cta-label]');
  if (!email || !label) return;

  const originalText = label.textContent ?? '';
  let resetTimer: number | null = null;

  link.addEventListener('click', () => {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(email)
      .then(() => {
        if (resetTimer !== null) window.clearTimeout(resetTimer);
        label.textContent = 'Copied!';
        resetTimer = window.setTimeout(() => {
          label.textContent = originalText;
          resetTimer = null;
        }, 2000);
      })
      .catch(() => {
        // Clipboard write failed (e.g. permissions) — mailto: still fires normally, no fallback needed.
      });
  });
}

document
  .querySelectorAll<HTMLAnchorElement>('[data-email-copy]')
  .forEach(initEmailCopyFallback);
