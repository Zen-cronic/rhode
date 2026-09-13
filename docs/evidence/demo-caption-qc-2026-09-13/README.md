# Demo caption quality verification

The promoted sidecar captions preserve every spoken word while formatting long sentences into deterministic cues. Each cue uses at most two lines, each line is at most 42 characters, reading speed stays at or below 22 visible characters per second, timestamps never overlap, and no gap exceeds 250 milliseconds. The last cue ends within 250 milliseconds of the four-minute film. The 22-character bound reflects the accepted narration's densest sentences without shifting captions outside their spoken intervals.

`scripts/format-demo-captions.mjs` accepts only the narrated sidecar with SHA-256 `f39241c893c0818500e4c498338bbf53002fe75b708a47c856ccfca605e7fedb`. It records the source and formatted hashes, cue counts, and equal normalized-text hashes in `formatting.json`. `scripts/verify-demo-captions.mjs` then checks the resulting SRT against the exact film duration and writes the independent structural receipt to `verification.json`.

The visual contact sheet renders five representative caption moments over the actual film. This structural and sampled visual check cannot prove word-level audio alignment, correct pronunciation, or every player-specific rendering. Human playback with captions remains required before submission.
