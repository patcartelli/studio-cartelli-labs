// src/scripts/text-reveal-engine.ts
// Cursor-anchored floating preview-image overlay for `.text-row` lists.
// Extracted from the chart page's Weekly-list hover behavior (Phase 19 —
// REVL-03/04/05/06) so the /lab index list view (STC-423) can reuse the same
// mechanism instead of reimplementing it.
//
// Contract for a container passed to initTextRevealEngine:
//   <container>
//     <li class="text-row" data-image="<preview url>">
//       <a class="text-row__link">...</a>
//     </li>
//     ...
//   </container>
//
// Event delegation via rAF + elementFromPoint means rows added after init
// (e.g. "load more") are revealed without any extra wiring.
//
// Reduced-motion: short-circuits — overlay never created, no listeners
// attached. No-hover (touch): short-circuits — callers handle art reveal via
// an inline thumb in markup instead.
export function initTextRevealEngine(sectionSelector: string): void {
  const section = document.querySelector<HTMLElement>(sectionSelector);
  if (!section) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (reduced || !canHover) return;

  const overlay = document.createElement('img');
  overlay.className = 'text-reveal-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.alt = '';
  document.body.appendChild(overlay);

  let lastX = 0;
  let lastY = 0;
  let ticking = false;
  let activeRow: HTMLLIElement | null = null;
  let focusedRow: HTMLLIElement | null = null;
  let currentSrc = '';

  const OVERLAY_SIZE = 320;
  const OVERLAY_OFFSET_X = 24;
  const OVERLAY_OFFSET_Y = -280;
  const EDGE_PADDING = 16;

  function findCursorRow(): HTMLLIElement | null {
    const el = document.elementFromPoint(lastX, lastY) as HTMLElement | null;
    if (!el) return null;
    const row = el.closest('.text-row') as HTMLLIElement | null;
    return row && section?.contains(row) ? row : null;
  }

  function setActive(row: HTMLLIElement | null): void {
    if (row === activeRow) return;
    if (activeRow) activeRow.removeAttribute('data-active');
    activeRow = row;
    if (row) row.setAttribute('data-active', 'true');

    const img = row?.dataset.image ?? '';
    if (img && img !== currentSrc) {
      overlay.src = img;
      currentSrc = img;
    }
    if (row && img) {
      overlay.setAttribute('data-visible', 'true');
    } else {
      overlay.removeAttribute('data-visible');
    }
  }

  function positionOverlay(): void {
    if (!activeRow) return;
    let x: number;
    let y: number;
    if (focusedRow) {
      // Fixed top-right for focus-driven reveal (no cursor to anchor to)
      x = window.innerWidth - OVERLAY_SIZE - 24;
      y = 24;
    } else {
      // Cursor-anchored with right + up offset, clamped to viewport
      const rawX = lastX + OVERLAY_OFFSET_X;
      const rawY = lastY + OVERLAY_OFFSET_Y;
      const maxX = window.innerWidth - OVERLAY_SIZE - EDGE_PADDING;
      const maxY = window.innerHeight - OVERLAY_SIZE - EDGE_PADDING;
      x = Math.max(EDGE_PADDING, Math.min(maxX, rawX));
      y = Math.max(EDGE_PADDING, Math.min(maxY, rawY));
    }
    overlay.style.transform = `translate(${x}px, ${y}px)`;
  }

  function update(): void {
    ticking = false;
    const target = focusedRow ?? findCursorRow();
    setActive(target);
    positionOverlay();
  }

  function schedule(): void {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  function onMouseMove(e: MouseEvent): void {
    lastX = e.clientX;
    lastY = e.clientY;
    schedule();
  }

  function onScroll(): void {
    schedule();
  }

  function onMouseLeave(): void {
    if (focusedRow) return; // keep focus state visible even if cursor leaves
    setActive(null);
  }

  function onFocusIn(e: FocusEvent): void {
    const target = e.target as HTMLElement | null;
    const link = target?.closest('.text-row__link') as HTMLAnchorElement | null;
    if (!link) return;
    const row = link.closest('.text-row') as HTMLLIElement | null;
    if (row && section?.contains(row)) {
      focusedRow = row;
      schedule();
    }
  }

  function onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as HTMLElement | null;
    if (next && next.closest('.text-row__link')) {
      // Focus moving to another link in the list — let focusin handle it
      return;
    }
    focusedRow = null;
    setActive(null);
  }

  section.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true });
  section.addEventListener('mouseleave', onMouseLeave);
  section.addEventListener('focusin', onFocusIn);
  section.addEventListener('focusout', onFocusOut);
}
