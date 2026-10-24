# Speaker-to-microphone validation for issue #1

This checklist requires a real iPhone running Safari, an Android phone running Chrome, and a laptop running Chrome. Use a separate speaker or device to play the selected song's associated recording. Browser emulation and the built-in excerpt check do not count as speaker-to-microphone evidence. Do not save or upload microphone audio.

For each device/browser, record the browser and OS versions, speaker distance, room conditions, associated song, time to first confident lock, and position error against the speaker's playback clock. Repeat at a mid-song start and after a seek. Note whether lyrics continue without sustained drift. Record the results for a different recording, silence, and an identical repeated passage; highlighting should stop when position is uncertain. Add temporary noise, then record whether and how quickly the matcher reacquires.

Check that denying microphone permission gives a useful message. After granting permission, verify that the browser's microphone indicator turns off on Stop, song change, screen change, page hiding, and navigation. Repeat after returning from the browser's back/forward cache if available. Use the browser's permission indicator or device privacy panel; do not infer microphone release from the app label alone.

| Device / browser / OS | Distance and conditions | Mid-song lock time | Position error | Drift | Wrong song / silence / repetition | Seek / noise reacquisition | Denial feedback | Release on each exit | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iPhone / Safari | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Android / Chrome | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Laptop / Chrome | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

Only tune matching thresholds after filling this table with measured failures, and rerun wrong-recording, silence, and repeated-passage checks after each change. Close issue #1 only after all three devices pass or the remaining limitations are explicitly accepted.
