# Verification

## Automated gates

- TypeScript production build.
- Signal tests with actual generated hymn audio: arbitrary mid-song starts, low-gain/noisy/filtered excerpts, wrong recording, silence, noise, short evidence, and identical repeated passages.
- Lyric tests: preset structure, instrumental gaps, word LRC round trip including end timestamps, standard/repeated LRC, complete/incomplete and invalid tap timings.
- Official `fas check` compliance, including compressed initial bundle size.

## Browser checks

Use the app through the browser: playback and word advancement; seeking to a lyric; slower speed; matcher excerpt check; timing editor; local save/reload; export/import; responsive navigation and lyric wrapping; dark/light theme. Do not claim real microphone capture verification unless tested with a deliberately supplied recording in a controlled environment.

The built-in “Test a mid-song excerpt” runs the same matching worker against a five-second crop of the selected recording. It does not activate the microphone and is labelled accordingly.
