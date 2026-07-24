/** Last.fm CDN cover URLs embed size in the path (`/i/u/300x300/…` or `/i/u/64s/…`). */

const LASTFM_SIZE_PATH = /\/i\/u\/(?:\d+x\d+|\d+s)\//;

export function lastfmResizeCoverUrl(url: string, size: '174s' | '64s'): string {
  if (!url || !LASTFM_SIZE_PATH.test(url)) return url;
  return url.replace(/\/i\/u\/(?:\d+x\d+|\d+s)\//, `/i/u/${size}/`);
}

/** Grid tiles — ~175px CSS max; `174s` is a real CDN thumb (not `174x174`, which falls back to full art). */
export function lastfmGridCoverUrl(url: string): string {
  return lastfmResizeCoverUrl(url, '174s');
}

/** Weekly list inline thumbs — 48×48 display; `64s` not `64x64`. */
export function lastfmListThumbUrl(url: string): string {
  return lastfmResizeCoverUrl(url, '64s');
}

/** Touch devices show inline thumbs; hover-capable desktops use the reveal overlay only. */
export function listUsesInlineThumb(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(hover: none)').matches;
}

export function wireListThumbSrc(thumb: HTMLImageElement, fullImageUrl: string): void {
  if (!fullImageUrl || !listUsesInlineThumb()) return;
  thumb.src = lastfmListThumbUrl(fullImageUrl);
  thumb.loading = 'lazy';
  thumb.decoding = 'async';
}
