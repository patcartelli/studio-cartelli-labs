// src/scripts/motion.ts
// Site-wide motion: scroll-reveal and parallax.
// Imported once in BaseLayout so every page gets these behaviors.
// Each script safely no-ops if its target elements aren't on the page.
//
// The main repo also loads hover-preview.ts here, but that's a
// homepage-only feature (LabCard's hover-preview wiring only activates
// when a `previewSlug` prop is passed, which only the main site's
// homepage does — /lab/index.astro in this repo never sets it) — left
// out of this fork to avoid pulling in dead code (labs-split Phase 1).

import './scroll-reveal.ts';
import './parallax.ts';
