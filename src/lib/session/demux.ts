// Vendored verbatim from patcartelli/stc-screen-recorder, transform/src/demux.ts.
// See src/lib/session/types.ts for why this directory exists at all.
import * as MP4BoxNS from 'mp4box';

// mp4box ships CJS+ESM; normalize the default-export interop once.
const MP4Box: any = (MP4BoxNS as any).default ?? MP4BoxNS;

export interface DemuxedVideo {
  /** source-frame PTS grid, session-relative integer ns */
  framesNs: number[];
  codec: string;
  codedWidth: number;
  codedHeight: number;
  /** avcC payload for VideoDecoder.configure */
  description: Uint8Array;
  chunks: { type: 'key' | 'delta'; timestampUs: number; data: Uint8Array }[];
}

export function demuxTrack(buf: ArrayBuffer, what: string): Promise<DemuxedVideo> {
  return new Promise((resolve, reject) => {
    const file = MP4Box.createFile();
    let sawReady = false;
    let settled = false;
    const finish = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    const fail = (msg: string) => finish(() => reject(new Error(msg)));

    // Backstop. mp4box signals a malformed file by simply never calling
    // back — no onReady, no onError — so without this the promise never
    // settles and the caller waits forever with no error and no stack.
    const watchdog = setTimeout(
      () => fail(`timed out reading ${what} — the file may be truncated or not an MP4`),
      15_000,
    );

    file.onError = (e: unknown) => {
      clearTimeout(watchdog);
      fail(`mp4box reading ${what}: ${String(e)}`);
    };
    file.onReady = (info: any) => {
      sawReady = true;
      const track = info.videoTracks[0];
      if (!track) {
        clearTimeout(watchdog);
        fail(`no video track in ${what}`);
        return;
      }

      // avcC description: serialize the box, strip the 8-byte box header.
      const trak = file.getTrackById(track.id);
      const entries = trak.mdia.minf.stbl.stsd.entries;
      const avcC = entries.map((e: any) => e.avcC).find(Boolean);
      if (!avcC) {
        clearTimeout(watchdog);
        fail(`no avcC box in ${what}`);
        return;
      }
      const ds = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
      avcC.write(ds);
      const description = new Uint8Array(ds.buffer, 8, ds.position - 8);

      // Presentation time = media time + edit-list offset. AVAssetWriter
      // records the gap between "recording started" and "first frame
      // arrived" as an EMPTY EDIT (media_time -1) and leaves sample CTS
      // starting at zero, so reading the sample table alone reports every
      // frame too early by that gap.
      const movieTimescale = file.moov.mvhd.timescale;
      const editOffsetNs = Math.round(
        (trak.edts?.elst?.entries ?? [])
          .filter((e: any) => e.media_time === -1)
          .reduce((sum: number, e: any) => sum + (e.segment_duration / movieTimescale) * 1_000_000_000, 0),
      );

      const collected: any[] = [];
      file.onSamples = (_id: number, _user: unknown, samples: any[]) => {
        collected.push(...samples);
        if (collected.length < track.nb_samples) return;
        const framesNs = collected.map((s) => {
          const scale = 1_000_000_000 / s.timescale;
          const pts = s.cts * scale + editOffsetNs;
          if (!Number.isInteger(pts)) throw new Error(`non-integer ns PTS: cts=${s.cts} timescale=${s.timescale}`);
          return pts;
        });
        clearTimeout(watchdog);
        finish(() =>
          resolve({
            framesNs,
            codec: track.codec,
            codedWidth: track.track_width,
            codedHeight: track.track_height,
            description,
            chunks: collected.map((s) => ({
              type: s.is_sync ? 'key' : 'delta',
              timestampUs: Math.round((s.cts * (1_000_000_000 / s.timescale) + editOffsetNs) / 1000),
              data: s.data as Uint8Array,
            })),
          }),
        );
      };
      file.setExtractionOptions(track.id, null, { nbSamples: track.nb_samples });
      file.start();
    };
    const ab = buf as ArrayBuffer & { fileStart: number };
    ab.fileStart = 0;
    try {
      file.appendBuffer(ab);
      file.flush();
    } catch (e) {
      clearTimeout(watchdog);
      fail(`could not parse ${what}: ${String(e)}`);
      return;
    }

    // Parsing is synchronous: by this point a valid file has produced
    // onReady. If it has not, there is no usable moov and no callback is
    // coming.
    if (!sawReady) {
      clearTimeout(watchdog);
      fail(`${what} is not a readable MP4 — no track information found`);
    }
  });
}
