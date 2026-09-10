// Hand-authored, NOT captured from the live API (STC-339 follow-up).
//
// Unlike lastfm-topartists.ts etc., artist.getTopTags is keyed by the artist
// being queried, so a single flat payload can't stand in for it -- this is a
// map from artist name (exactly as it appears in lastfm-topartists.ts) to
// the raw artist.getTopTags response for that artist. See getFixturePayload
// in lastfm-fixture.ts for how the artist name is looked up.
//
// Content is genuinely researched (each artist's real, well-known genre
// tags) but not literally captured from a live call the way the other
// fixtures are -- there's no per-artist API credential story that would let
// this repo re-capture 13 individual artist.getTopTags responses the way
// the whole-chart payloads were captured. Regenerate by hand if the response
// SHAPE changes (data.toptags.tag[].{name, count}); the specific tags/counts
// don't need to match Last.fm exactly, only the shape and general plausibility.
export default {
  'Mogwai': {
    toptags: {
      tag: [
        { name: 'post-rock', count: 100 },
        { name: 'instrumental', count: 80 },
        { name: 'post rock', count: 60 },
        { name: 'scottish', count: 40 },
        { name: 'ambient', count: 20 },
      ],
    },
  },
  'Russian Circles': {
    toptags: {
      tag: [
        { name: 'post-rock', count: 100 },
        { name: 'instrumental', count: 70 },
        { name: 'post-metal', count: 50 },
        { name: 'math rock', count: 30 },
        { name: 'chicago', count: 10 },
      ],
    },
  },
  'Apparat': {
    toptags: {
      tag: [
        { name: 'electronic', count: 100 },
        { name: 'idm', count: 60 },
        { name: 'ambient', count: 40 },
        { name: 'german', count: 20 },
        { name: 'techno', count: 15 },
      ],
    },
  },
  'Arjuna Oakes & Serebii': {
    toptags: {
      tag: [
        { name: 'indie', count: 20 },
        { name: 'folk', count: 15 },
        { name: 'singer-songwriter', count: 10 },
        { name: 'acoustic', count: 5 },
      ],
    },
  },
  'Big D And The Kids Table': {
    toptags: {
      tag: [
        { name: 'ska punk', count: 100 },
        { name: 'ska', count: 80 },
        { name: 'third wave ska', count: 40 },
        { name: 'punk', count: 30 },
        { name: 'hardcore', count: 10 },
      ],
    },
  },
  'Crosby, Stills & Nash': {
    toptags: {
      tag: [
        { name: 'folk rock', count: 100 },
        { name: 'classic rock', count: 90 },
        { name: '60s', count: 50 },
        { name: 'folk', count: 40 },
        { name: 'singer-songwriter', count: 20 },
      ],
    },
  },
  'David Gilmour': {
    toptags: {
      tag: [
        { name: 'progressive rock', count: 90 },
        { name: 'classic rock', count: 80 },
        { name: 'guitar', count: 50 },
        { name: 'rock', count: 30 },
        { name: 'pink floyd', count: 20 },
      ],
    },
  },
  'Hermanos Gutiérrez': {
    toptags: {
      tag: [
        { name: 'instrumental', count: 60 },
        { name: 'guitar', count: 50 },
        { name: 'desert rock', count: 30 },
        { name: 'ambient', count: 15 },
        { name: 'cinematic', count: 10 },
      ],
    },
  },
  'Jo Passed': {
    toptags: {
      tag: [
        { name: 'indie rock', count: 30 },
        { name: 'lo-fi', count: 20 },
        { name: 'experimental', count: 15 },
        { name: 'canadian', count: 10 },
        { name: 'art rock', count: 5 },
      ],
    },
  },
  'Pink Floyd': {
    toptags: {
      tag: [
        { name: 'progressive rock', count: 100 },
        { name: 'classic rock', count: 95 },
        { name: 'psychedelic rock', count: 70 },
        { name: 'rock', count: 50 },
        { name: '70s', count: 30 },
      ],
    },
  },
  'Plantoid': {
    toptags: {
      tag: [
        { name: 'electronic', count: 25 },
        { name: 'ambient', count: 20 },
        { name: 'experimental', count: 15 },
        { name: 'idm', count: 10 },
      ],
    },
  },
  'Radiohead': {
    toptags: {
      tag: [
        { name: 'alternative rock', count: 100 },
        { name: 'rock', count: 90 },
        { name: 'electronic', count: 40 },
        { name: 'indie', count: 30 },
        { name: '90s', count: 25 },
      ],
    },
  },
  'Rx Bandits': {
    toptags: {
      tag: [
        { name: 'ska punk', count: 90 },
        { name: 'reggae', count: 40 },
        { name: 'progressive rock', count: 30 },
        { name: 'ska', count: 20 },
        { name: 'punk', count: 15 },
      ],
    },
  },
} as const;
