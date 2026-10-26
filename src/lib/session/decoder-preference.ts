// Vendored (simplified) from patcartelli/stc-screen-recorder,
// transform/src/decoder-preference.ts. Upstream this exists so CI's
// paravirtualized video hardware can be told to skip a first-touch wedge
// (STC-259); this site's viewers hit real hardware, and nothing here calls
// `setDecoderPreference`, so `decoderPreference()` always spreads to `{}` —
// Chromium's own default. Kept as a named seam rather than inlining `{}` at
// the call site so decode.ts stays a faithful copy of the upstream file.

export type DecoderPreference = 'prefer-hardware' | 'prefer-software' | 'no-preference';

let preference: DecoderPreference | undefined;

export function setDecoderPreference(p: DecoderPreference | undefined): void {
  preference = p;
}

export function decoderPreference(): { hardwareAcceleration?: DecoderPreference } {
  return preference ? { hardwareAcceleration: preference } : {};
}
