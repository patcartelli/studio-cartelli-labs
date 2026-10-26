// Fails the build when src/data/lab-demos.ts and public/ disagree.
//
// The point of the check: `published` is flipped by hand, in a different
// commit from the one that copies the video in (the recorder's Share to site
// button writes the file; a person edits the flag). Nothing else would notice
// a flag flipped one commit early, and the symptom on the live site is a
// broken player above the piece it was meant to introduce.
//
// It also compares the declared width/height against the MP4's own track
// header, because those numbers reserve the box: if they are wrong the page
// shifts when the video loads, which no test that only checks existence sees.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC_DIR = 'public';

// astro.config.mjs sets base:'/lab', so `public/videos/network.mp4` is served
// at `/lab/videos/network.mp4`. Entries in lab-demos.ts hold the final URL
// (what the page writes into `src`), so strip the base to find the file.
const BASE = '/lab';

/** The file in public/ that a site-absolute URL resolves to. */
function publicPath(url) {
  const rel = url === BASE || url.startsWith(`${BASE}/`) ? url.slice(BASE.length) : url;
  return join(PUBLIC_DIR, rel);
}

/**
 * Width and height from an MP4's video track header, or null when the file
 * cannot be walked. Null is NOT a pass — the caller reports it.
 *
 * Deliberately a box walk rather than a dependency: the one number needed is
 * in `moov/trak/tkhd` and spawning ffprobe would make the build need ffmpeg.
 */
function mp4Dimensions(path) {
  let buf;
  try {
    buf = readFileSync(path);
  } catch {
    return null;
  }
  let best = null;

  const walk = (start, end) => {
    let off = start;
    // 8 is the minimum box: 4-byte size + 4-byte type. Anything less is
    // trailing garbage, not a box.
    while (off + 8 <= end) {
      let size = buf.readUInt32BE(off);
      const type = buf.toString('latin1', off + 4, off + 8);
      let head = 8;
      if (size === 1) {
        if (off + 16 > end) return;
        // 64-bit size. Node has no readUInt64BE; the high word is zero for
        // any file that fits in memory, so read it and refuse if it is not.
        if (buf.readUInt32BE(off + 8) !== 0) return;
        size = buf.readUInt32BE(off + 12);
        head = 16;
      } else if (size === 0) {
        size = end - off; // "to end of file"
      }
      if (size < head || off + size > end) return;

      if (type === 'moov' || type === 'trak') {
        walk(off + head, off + size);
      } else if (type === 'tkhd') {
        const p = off + head;
        const version = buf[p];
        const at = p + 4 + (version === 1 ? 32 : 20) + 16 + 36;
        if (at + 8 <= off + size) {
          // 16.16 fixed point.
          const w = buf.readUInt32BE(at) / 65536;
          const h = buf.readUInt32BE(at + 4) / 65536;
          // An audio track's tkhd carries 0x0; the video track is the widest.
          if (w > 0 && h > 0 && (!best || w > best.width)) {
            best = { width: Math.round(w), height: Math.round(h) };
          }
        }
      }
      off += size;
    }
  };

  walk(0, buf.length);
  return best;
}

const { labDemos } = await import('../src/data/lab-demos.ts');

let failed = false;
const fail = (msg) => {
  console.error(`lab-demos: ${msg}`);
  failed = true;
};

for (const [slug, demo] of Object.entries(labDemos)) {
  if (!demo.published) {
    // An unpublished entry is the normal state before a recording session.
    // Its file may or may not be there yet, and neither is wrong.
    console.log(`lab-demos: ${slug} is not published — skipped`);
    continue;
  }

  for (const key of ['src', 'poster']) {
    const rel = demo[key];
    if (!rel) continue;
    if (!rel.startsWith('/')) {
      fail(`${slug}.${key} must be a site-absolute path, got "${rel}"`);
      continue;
    }
    const path = publicPath(rel);
    if (!existsSync(path)) {
      fail(`${slug} is published but ${key} is missing: ${path}`);
    } else if (statSync(path).size === 0) {
      fail(`${slug}.${key} is an empty file: ${path}`);
    }
  }

  for (const key of ['width', 'height']) {
    const v = demo[key];
    if (!Number.isInteger(v) || v <= 0) {
      fail(`${slug}.${key} must be a positive integer, got ${v}`);
    } else if (v % 2 !== 0) {
      // H.264 chroma subsampling cannot express an odd dimension; an odd
      // number here means the number was typed rather than measured.
      fail(`${slug}.${key} is odd (${v}) — an H.264 export cannot be that size`);
    }
  }

  const path = publicPath(demo.src);
  if (existsSync(path)) {
    const actual = mp4Dimensions(path);
    if (!actual) {
      fail(`${slug}: could not read a video track header from ${path}`);
    } else if (actual.width !== demo.width || actual.height !== demo.height) {
      fail(
        `${slug} declares ${demo.width}x${demo.height} but ${path} is ` +
          `${actual.width}x${actual.height} — the page would reserve the wrong box`,
      );
    } else {
      console.log(`lab-demos: ${slug} ok — ${actual.width}x${actual.height}`);
    }
  }
}

if (failed) process.exit(1);
