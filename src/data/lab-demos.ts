// Recorded walkthroughs embedded above the live piece on a /lab experiment
// page. One entry per lab slug; a slug with no entry renders no video.
//
// The video files are produced by the screen recorder (patcartelli/
// stc-screen-recorder) and land in `public/videos/<slug>.mp4`, which this
// Worker serves at `/lab/videos/<slug>.mp4` (astro.config.mjs sets
// base:'/lab'). They are named from a stable slug so re-recording the demo
// replaces the file and never edits this page.
//
// STC-209: this file, LabVideo.astro and the video moved here from the private
// studio-cartelli repo, where they were built after the split and never
// reached production. The recorder's Share to site button still writes into
// that repo's `public/lab/videos/`; point it here before the next recording.
//
// `published` is the switch, and it is separate from the entry existing on
// purpose: the metadata below is written and reviewed before the recording
// session, and the file arrives afterwards. `npm run check:demos` refuses a
// build where `published` is true and the file is not in `public/`, so the
// flag cannot be flipped ahead of the video.
export interface LabDemo {
  /** Public path of the MP4, served from `public/`. */
  src: string;
  /**
   * Poster frame, shown before playback and to a viewer who prefers reduced
   * motion. Optional — without one the browser paints the first decoded
   * frame, which is black until the video loads.
   */
  poster?: string;
  /** The export's real pixel dimensions. Reserves the box so nothing shifts. */
  width: number;
  height: number;
  /** Read aloud by a screen reader in place of the video. */
  label: string;
  /** Shown under the video. Says what the viewer is looking at. */
  caption: string;
  /** False until the file is actually in `public/`. See the note above. */
  published: boolean;
}

export const labDemos: Record<string, LabDemo> = {
  network: {
    src: '/lab/videos/network.mp4',
    // 2x the widest the .container ever gets (1280px max-width less 24px
    // padding either side = 1232 CSS px of content), so the video is crisp on
    // a retina display and never upscaled. Must match the real export — the
    // check script compares these against the file.
    width: 2232,
    height: 2160,
    label:
      'Screen recording: searching the artist network for Radiohead, following a link into Genghis Tron, and dragging a node to show the graph settle.',
    caption:
      'A 50-second pass through the piece below, recorded with a screen recorder I built. Silent.',
    published: true,
  },
};
