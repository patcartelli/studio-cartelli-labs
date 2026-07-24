/** Last.fm CDN cover URLs embed pixel size in the path (`/i/u/300x300/…`). */

const LASTFM_SIZE_PATH = /\/i\/u\/\d+x\d+\//;

export function lastfmResizeCoverUrl(url: string, size: '174x174' | '64x64'): string {
  if (!url || !LASTFM_SIZE_PATH.test(url)) return url;
  return url.replace(/\/i\/u\/\d+x\d+\//, `/i/u/${size}/`);
}

/** Grid tiles — ~175px CSS max; 174×174 is enough for 2× DPR. */
export function lastfmGridCoverUrl(url: string): string {
  return lastfmResizeCoverUrl(url, '174x174');
}

/** Weekly list inline thumbs — 48×48 display. */
export function lastfmListThumbUrl(url: string): string {
  return lastfmResizeCoverUrl(url, '64x64');
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
