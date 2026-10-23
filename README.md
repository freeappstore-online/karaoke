# Karaoke

A free, browser-local sing-along maker on FreeAppStore.

- Pair an audio recording with lyrics; tap word beginnings or import standard/enhanced LRC.
- Sing with audio-clock highlighting, line seeking, speed controls, a timing offset, and fullscreen lyrics.
- Match nearby playback of the **associated recording** through the microphone, including mid-song starts. Uncertain, silent, and wrong-track input does not advance highlighting.
- Edit a copy of any included or saved song.
- Save recordings and timings in IndexedDB. Export/import a `.karaoke.json` package containing both; export LRC separately.
- Three original Church of Elon hymns include all three stanzas and instrumental backing tracks.

## Develop and verify

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
fas check
```

`python3 scripts/build-presets.py` regenerates the original WAVs and word timing from `scripts/hymns.json`. No sung or cloned voices are used.

## Matching limits

The microphone matcher compares gain-normalized spectral patterns over a rolling 3.5–5 second window against the selected recording. Reference analysis and matching run in a Web Worker; an AudioWorklet captures mono microphone samples and emits silence to the output. Audio never leaves the browser. Microphone tracks and processing stop on Stop, song/screen changes, page hiding, and unmount.

This is not a universal song recognizer, speech transcription, or forced lyric alignment. Covers, a cappella singing, altered arrangements, substantial speed changes, excessive noise, and identical repeated sections can fail or remain ambiguous. Highlighting requires a recent confident match; stale locks expire after 1.6 seconds. Tests cover mid-song offsets, quieter/noisy/filtered playback, wrong songs, silence, noise, and indistinguishable repetitions. Actual speaker/microphone conditions vary.

Standard LRC has line timing only. Enhanced LRC and the tap editor provide word timing. The app never labels interpolated word timing as measured alignment.

## Storage and privacy

No app-specific account, upload service, paid API, or server storage. Local storage may be evicted; export packages for backup. Microphone audio is transient, never saved. The standard FreeAppStore SDK/shell and platform analytics loader remain in the template; no app-specific analytics are added.

## Delivery

MIT licensed. Provision through `fas publish`; push verified changes directly to `main`. GitHub Actions builds and publishes static assets through the official platform pipeline. See [docs/verification.md](docs/verification.md).
