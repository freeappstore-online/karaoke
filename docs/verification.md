# Verification

## Automated gates

- TypeScript production build.
- Signal tests with actual generated hymn audio: arbitrary mid-song starts, low-gain/noisy/filtered excerpts, wrong recording, silence, noise, short evidence, and identical repeated passages.
- Lyric tests: preset structure, instrumental gaps, word LRC round trip including end timestamps, standard/repeated LRC, complete/incomplete and invalid tap timings.
- Official `fas check` compliance, including compressed initial bundle size.

## Browser checks

Use the app through the browser: playback and word advancement; seeking to a lyric; slower speed; matcher excerpt check; timing editor; local save/reload; export/import; responsive navigation and lyric wrapping; dark/light theme. Do not claim real microphone capture verification unless tested with a deliberately supplied recording in a controlled environment.

The built-in “Test a mid-song excerpt” runs the same matching worker against a five-second crop of the selected recording. It does not activate the microphone and is labelled accordingly.

## Initial release evidence — 2026-10-23

- 17 signal/lyric tests passed; all three full hymn recordings have a mid-song match test.
- Production build and official current CLI compliance checks passed. Initial JS is under 90 KB gzip.
- In Chrome, observed audio playback, lyric-line advancement, pause, and a successful mid-song excerpt match through the actual Web Worker.
- Verified live manifest, AudioWorklet, and all three full WAV files against local bytes; live hosting permits same-origin microphone access.
- FreeAppStore CI, compliance, and static deployment passed for the initial release.
- Browser access recovered. Verified phone layout at 390px, then calibrated the browser's 150% display scaling and checked actual CSS viewport widths of 320, 768 and 1280px with no document overflow. The 320px Shell menu opens and navigates correctly.
- Verified the tap editor with a two-word practice song, local save/reload, cleanup, enhanced-LRC hymn copying, and route/title updates after saving.
- Found that the static host ignores byte ranges for WAVs (`200` full body, media seekable range `0..0`). The player now fetches a local Blob before enabling playback/seeking. Verified selection of the 12.5-second lyric resumes actual audio from 12.8 seconds with a `0..70` seekable range.
- “Edit a copy” reuses the selected recording and exact enhanced LRC, so hymn/custom-song timing can be revised without another file upload.
- File-package browser round-trip checks remain open: this Chrome extension has local file URL access disabled, and its download observer timed out. No extension permissions were changed. These are verification limits, not claimed passes.
- Physical speaker-to-microphone tests remain tracked in [issue #1](https://github.com/freeappstore-online/karaoke/issues/1). No private ambient audio was captured for testing.

## Six-hymn library — 2026-10-24

- Added original welcome, practical-care, and evening hymns; all have three stanzas and syllable-derived word timing.
- All six full recordings pass actual-audio mid-song matching and lyric validation (20 signal/lyric cases; 35 app tests total after integrating the latest recording/editor work). Original three WAVs remain byte-identical.
- Added single-stanza practice recordings and ABC scores for the three new hymns; scores are included in the offline precache.
- Formatting, typecheck, production build, and current CLI 0.4.42 compliance passed. The browser-tab recorder’s screen permission is now declared in the manifest.
- Local Chrome playback advanced through the welcome hymn and its interlude; line seeking and 0.75× playback worked, with one visible active word and earlier words marked sung. All twelve lines are present with stanza gaps.
- At an actual 320px CSS viewport, the expanded song list and About page have no horizontal document overflow, and the Shell menu opens and navigates. Current CLI 0.4.42 compliance passed.
- Human-recorded singing and physical speaker/microphone tests remain outstanding, as described above.

The Church-side course, rehearsal guide, source synchronization, and publication
checks are tracked in [PWS issue #90](https://github.com/prowebstore-online/platform/issues/90).
