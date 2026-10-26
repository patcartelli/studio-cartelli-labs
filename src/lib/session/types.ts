// Vendored from patcartelli/stc-screen-recorder, transform/src/types.ts —
// trimmed to the shapes session.ts actually needs (Anchors, SessionEvent,
// Session). STC-319's own scope note says to try session.ts +
// seeking-frame-source.ts directly rather than writing a second loader; the
// canonical source lives in that repo and this file exists only because a
// separate site repo cannot `import` across a GitHub boundary. Keep it a
// literal copy of the fields below — do not add fields this site does not
// read, and re-sync by hand if the upstream shapes change.

/** Mirrors schema/events-1.schema.json and events-2.schema.json. All times are session-relative integer ns. */
export interface MoveEvent {
  t: number;
  kind: 'move';
  x: number;
  y: number;
}
export interface ButtonEvent {
  t: number;
  kind: 'down' | 'up';
  x: number;
  y: number;
  button: number;
}
export type CursorShape = 'arrow' | 'ibeam' | 'crosshair' | 'pointingHand';
export interface CursorShapeEvent {
  t: number;
  kind: 'cursor';
  shape: CursorShape;
}
export type SessionEvent = MoveEvent | ButtonEvent | CursorShapeEvent;

/** Mirrors the optional `camera` block in schema/anchors-2.schema.json. */
export interface CameraTrack {
  present: boolean;
  device: string;
  width: number;
  height: number;
  firstFramePtsNs: number;
  lastFramePtsNs: number;
  frameIntervalNs: number;
}

/** Mirrors schema/anchors-1.schema.json and schema/anchors-2.schema.json. */
export interface Anchors {
  version: 1 | 2;
  timebase: { numer: number; denom: number };
  t0Ns: string;
  display: {
    id: number;
    pointWidth: number;
    pointHeight: number;
    pixelWidth: number;
    pixelHeight: number;
    backingScale: number;
    originX: number;
    originY: number;
  };
  capture: { width: number; height: number; codec: 'h264' };
  camera?: CameraTrack;
  files: { display: string; camera?: string };
  stop?: { t: number; reason: string };
}

/**
 * Everything the study reads. Mirrors the upstream `Session` (transform/src/
 * types.ts) minus nothing — this study wants the same frame grid and event
 * list `render()` sees, since the whole point is finding out what looks like
 * "the" change against the same timeline the recorder already has.
 */
export interface Session {
  anchors: Anchors;
  events: SessionEvent[];
  frames: number[];
  cameraFrames?: number[];
}
