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
- The browser connection stopped responding before phone-layout, editor persistence, package round-trip, and full end-to-end UI checks could finish. These are outstanding checks, not claimed passes.
- Physical speaker-to-microphone tests remain tracked in [issue #1](https://github.com/freeappstore-online/karaoke/issues/1). No private ambient audio was captured for testing.
