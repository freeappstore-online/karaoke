# Karaoke

Browser-local recording + timed-lyrics maker. Free, MIT licensed.

- Live: https://karaoke.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Verify: `pnpm typecheck`, `pnpm test`, `pnpm build`, `fas check`
- Deploy verified changes straight to `main`; no branches or PRs.
- `git push upstream main` triggers the official static deployment workflow.

Read platform-wide **SKILLS.md** before development:
https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
Current platform guide: https://freeappstore.online/skills.md

## App shell

Every screen stays inside SDK `Shell`, with a NAV entry and SDK `PageHeader`.
Use `useToast().show()` for feedback. Do not add a competing header, sidebar,
navbar, dock, or error boundary. No app-specific sign-in is required.

## Karaoke implementation

- `web/src/audio/fingerprint.ts`: local reference matching. Preserve quiet,
  wrong-recording and ambiguity rejection, plus fresh-lock requirements.
- `web/src/audio/useFollow.ts`: microphone lifecycle. Never upload or save mic
  samples. Stop tracks/workers on stop, song/screen changes, page hiding, unmount.
- `web/src/lyrics/model.ts`: actual word or line timing. Do not invent word
  timestamps for standard LRC. Preserve instrumental gaps on export/import.
- `web/src/lyrics/storage.ts`: IndexedDB audio + lyrics, backed up by export.
- `scripts/build-presets.py`: original full three-stanza instrumental hymns and
  syllable-derived word timings, sourced from `scripts/hymns.json`.
- `docs/verification.md`: checks and honest microphone-test limits.

Microphone mode matches the selected reference recording, not arbitrary songs,
cover performances, or a cappella vocals. Uncertainty pauses highlighting.
