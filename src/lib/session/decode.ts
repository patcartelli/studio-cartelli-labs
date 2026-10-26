// Vendored verbatim from patcartelli/stc-screen-recorder, transform/src/decode.ts.
// See src/lib/session/types.ts for why this directory exists at all.
import type { DemuxedVideo } from './demux.ts';
import { withTimeout, TimeoutError } from './timeout.ts';
import { decoderPreference } from './decoder-preference.ts';

/** One constant, so the bound and the message it prints cannot disagree. */
const FLUSH_MS = 60_000;

/**
 * Decode-all frame cache: every frame is decoded up front into an
 * ImageBitmap and the VideoFrame closed in the output callback (never
 * buffer VideoFrames — a 4K frame is tens of MB).
 *
 * No B-frames (cts===dts in the recorder's own writer) means output order
 * equals submission order, so frame index k of the output IS framesNs[k].
 * A study fixture is short enough that decoding it whole, rather than
 * building the product's scrubbing cache, is the right size for this.
 */
export async function decodeAll(video: DemuxedVideo): Promise<ImageBitmap[]> {
  const bitmapPromises: Promise<ImageBitmap>[] = [];
  let rejectAll: (e: Error) => void;
  const failure = new Promise<never>((_, rej) => {
    rejectAll = rej;
  });

  const decoder = new VideoDecoder({
    output: (frame) => {
      bitmapPromises.push(
        createImageBitmap(frame).then(
          (b) => {
            frame.close();
            return b;
          },
          (e) => {
            frame.close();
            throw e;
          },
        ),
      );
    },
    error: (e) => rejectAll(e),
  });
  decoder.configure({
    codec: video.codec,
    codedWidth: video.codedWidth,
    codedHeight: video.codedHeight,
    description: video.description,
    ...decoderPreference(),
  });
  for (const c of video.chunks) {
    decoder.decode(
      new EncodedVideoChunk({
        type: c.type,
        timestamp: c.timestampUs,
        data: c.data as BufferSource,
      }),
    );
  }
  try {
    await withTimeout(Promise.race([decoder.flush(), failure]), FLUSH_MS, 'decoder flush');
  } catch (e) {
    if (!(e instanceof TimeoutError)) throw e;
    throw new Error(
      `decoder flush did not complete within ${FLUSH_MS}ms — submitted ${video.chunks.length} chunks, ` +
        `emitted ${bitmapPromises.length}, decodeQueueSize=${decoder.decodeQueueSize}, state=${decoder.state}, ` +
        `codec=${video.codec} ${video.codedWidth}x${video.codedHeight}`,
    );
  }
  decoder.close();
  const bitmaps = await withTimeout(Promise.all(bitmapPromises), 60_000, 'decoding frames to bitmaps');
  if (bitmaps.length !== video.chunks.length) {
    throw new Error(`decoded ${bitmaps.length} frames, expected ${video.chunks.length}`);
  }
  return bitmaps;
}
