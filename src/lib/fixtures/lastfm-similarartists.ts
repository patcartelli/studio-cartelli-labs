// Hand-authored, NOT captured from the live API (STC-339 follow-up).
//
// Same shape/rationale as lastfm-toptags.ts: artist.getSimilar is keyed by
// the artist being queried, so this maps artist name -> raw
// artist.getSimilar response for that artist. Only similarity links to
// OTHER artists in lastfm-topartists.ts's 13-artist set produce a visible
// edge (network.astro discards a similar-artist name that isn't in the
// current top-artists list), so links intentionally stay inside that set
// rather than mimicking a real API response's much longer candidate list.
// `match` is a stringified float 0-1, same as the real API.
// Regenerate by hand if the response SHAPE changes
// (data.similarartists.artist[].{name, match}).
export default {
  'Mogwai': {
    similarartists: {
      artist: [
        { name: 'Russian Circles', match: '0.82' },
        { name: 'Hermanos Gutiérrez', match: '0.35' },
      ],
    },
  },
  'Russian Circles': {
    similarartists: {
      artist: [{ name: 'Mogwai', match: '0.82' }],
    },
  },
  'Apparat': {
    similarartists: {
      artist: [
        { name: 'Plantoid', match: '0.4' },
        { name: 'Radiohead', match: '0.28' },
      ],
    },
  },
  'Arjuna Oakes & Serebii': {
    similarartists: {
      artist: [{ name: 'Jo Passed', match: '0.2' }],
    },
  },
  'Big D And The Kids Table': {
    similarartists: {
      artist: [{ name: 'Rx Bandits', match: '0.78' }],
    },
  },
  'Crosby, Stills & Nash': {
    similarartists: {
      artist: [
        { name: 'David Gilmour', match: '0.22' },
        { name: 'Pink Floyd', match: '0.18' },
      ],
    },
  },
  'David Gilmour': {
    similarartists: {
      artist: [
        { name: 'Pink Floyd', match: '0.95' },
        { name: 'Crosby, Stills & Nash', match: '0.22' },
      ],
    },
  },
  'Hermanos Gutiérrez': {
    similarartists: {
      artist: [{ name: 'Mogwai', match: '0.35' }],
    },
  },
  'Jo Passed': {
    similarartists: {
      artist: [
        { name: 'Plantoid', match: '0.25' },
        { name: 'Arjuna Oakes & Serebii', match: '0.2' },
      ],
    },
  },
  'Pink Floyd': {
    similarartists: {
      artist: [
        { name: 'David Gilmour', match: '0.95' },
        { name: 'Radiohead', match: '0.55' },
        { name: 'Crosby, Stills & Nash', match: '0.18' },
      ],
    },
  },
  'Plantoid': {
    similarartists: {
      artist: [
        { name: 'Apparat', match: '0.4' },
        { name: 'Jo Passed', match: '0.25' },
      ],
    },
  },
  'Radiohead': {
    similarartists: {
      artist: [
        { name: 'Pink Floyd', match: '0.55' },
        { name: 'Apparat', match: '0.28' },
      ],
    },
  },
  'Rx Bandits': {
    similarartists: {
      artist: [{ name: 'Big D And The Kids Table', match: '0.78' }],
    },
  },
} as const;
