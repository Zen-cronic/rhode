# RoadStar film sources

The film uses the Precision transport identity: Manrope and IBM Plex Mono, graphite, ivory and signal orange. `motion.html` contains deterministic typography and explanatory route animations. Original studio artwork is illustrative; geographic route evidence appears only in actual app footage.

`render-motion.mjs` requires an existing Playwright installation, Chrome and ffmpeg. It writes five 1920×1080, 24fps H.264 motion segments to `ROADSTAR_MOTION_OUTPUT` (default `/tmp/roadstar-motion`). No additional paid model provider is required.

`assemble.py` combines the five motion segments, authenticated synthetic workflow clips, an Android emulator recording and the existing narration WAVs. It writes a four-minute H.264/AAC movie and source/timing receipts, then normalizes audio to -16 LUFS with a -1.5 dBTP target. The motion segments must be under `<ROADSTAR_RENDER_WORK>/film`. Set `ROADSTAR_RENDER_WORK`, `ROADSTAR_CAPTURE`, `ROADSTAR_NATIVE_CLIP` and `ROADSTAR_SUBMISSION` as needed. The submission directory supplies `private-build/audio/<scene>.wav`. Licensed fonts and the ten scene descriptions are included here.

Capture inputs are full app viewports after authentication, with no altered UI values. `01-dock-delay.mp4`, `02-recovery-approval.mp4`, `04-document-source.mp4`, `05-billing-evidence.mp4` and `07-planning-record.mp4` use separate authorized synthetic fixtures. Native footage is labeled emulator. Authentication recordings, credentials and customer source rows are excluded from source and public exports.

The ten segment durations remain unchanged, so the existing narration and sentence-level captions can be reused. Captions are approximately aligned within each beat; human listening and live presentation rehearsal remain final operator checks. Physical background-location and native iOS verification are explicitly disclosed as pending.
