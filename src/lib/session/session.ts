// Vendored (trimmed) from patcartelli/stc-screen-recorder, transform/src/session.ts.
// See src/lib/session/types.ts for why this directory exists at all. The
// camera-track handling and the schema-version gate are kept intact — a
// study fixture is still a real anchors.json/events.json pair and should be
// refused the same way the recorder itself would refuse a malformed one,
// rather than this file quietly accepting something upstream would not.
import { demuxTrack, type DemuxedVideo } from './demux.ts';
import type { Anchors, Session, SessionEvent } from './types.ts';

export class SessionLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionLoadError';
  }
}

export interface SessionInput {
  anchors: Anchors;
  events: { version: number; events: SessionEvent[] };
  displayMp4: ArrayBuffer;
  cameraMp4?: ArrayBuffer;
}

export interface LoadedSession extends Session {
  video: DemuxedVideo;
  cameraVideo?: DemuxedVideo;
}

/**
 * How far the offset recovered from the file may differ from the offset the
 * helper measured. The file stores it as an empty edit quantised to the
 * movie timescale (90 kHz), and AVAssetWriter truncates rather than rounds,
 * so a full tick of disagreement is normal.
 */
const OFFSET_TOLERANCE_NS = 50_000;

function checkFrameOffset(what: string, measuredNs: number | undefined, demuxedFirstNs: number): void {
  if (typeof measuredNs !== 'number') return;
  const drift = Math.abs(demuxedFirstNs - measuredNs);
  if (drift > OFFSET_TOLERANCE_NS) {
    throw new SessionLoadError(
      `${what} frame-time offset disagreement: helper measured ${measuredNs} ns, file yields ` +
        `${demuxedFirstNs} ns (${(drift / 1e6).toFixed(1)} ms apart). Render would desync by that amount.`,
    );
  }
}

export async function loadSession(input: SessionInput): Promise<LoadedSession> {
  const { anchors, events } = input;

  if (anchors?.version !== 1 && anchors?.version !== 2) {
    throw new SessionLoadError(`anchors.json version ${anchors?.version} is not supported (expected 1 or 2)`);
  }
  if (events?.version !== 1 && events?.version !== 2) {
    throw new SessionLoadError(`events.json version ${events?.version} is not supported (expected 1 or 2)`);
  }

  const claimsCamera = anchors.camera?.present === true;
  if (claimsCamera && !input.cameraMp4) {
    throw new SessionLoadError(
      'anchors.camera.present is true but no camera.mp4 was supplied for this take. Refusing to silently drop the PiP.',
    );
  }
  if (input.cameraMp4 && !claimsCamera) {
    throw new SessionLoadError(
      'a camera.mp4 was supplied but anchors.camera.present is not true — the anchors and the file disagree about whether this take has a camera track.',
    );
  }

  const video = await demuxTrack(input.displayMp4, 'display.mp4');
  if (video.framesNs.length === 0) {
    throw new SessionLoadError('display.mp4 contains no frames');
  }
  checkFrameOffset('display.mp4', (anchors.capture as { firstFrameNs?: number }).firstFrameNs, video.framesNs[0]!);

  let cameraVideo: DemuxedVideo | undefined;
  if (claimsCamera && input.cameraMp4) {
    cameraVideo = await demuxTrack(input.cameraMp4, 'camera.mp4');
    if (cameraVideo.framesNs.length === 0) {
      throw new SessionLoadError('camera.mp4 contains no frames');
    }
    checkFrameOffset('camera.mp4', anchors.camera!.firstFramePtsNs, cameraVideo.framesNs[0]!);
  }

  return {
    anchors,
    events: [...events.events].sort((a, b) => a.t - b.t),
    frames: video.framesNs,
    cameraFrames: cameraVideo?.framesNs,
    video,
    cameraVideo,
  };
}
