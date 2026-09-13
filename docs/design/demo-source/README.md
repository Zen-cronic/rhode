# RoadStar film sources

The film uses the Precision transport identity: Manrope and IBM Plex Mono, graphite, ivory and signal orange. `motion.html` contains deterministic typography and explanatory route animations. Original studio artwork is illustrative; geographic route evidence appears only in actual app footage.

`render-motion.mjs` requires an existing Playwright installation, Chrome and ffmpeg. It writes five 1920×1080, 24fps H.264 motion segments to `ROADSTAR_MOTION_OUTPUT` (default `/tmp/roadstar-motion`). Set `ROADSTAR_MOTION_SCENE=problem` to render only one named scene. No additional paid model provider is required.

`assemble.py` combines the five motion segments, authenticated synthetic workflow clips, an Android emulator recording and the existing narration WAVs. It writes a four-minute H.264/AAC movie and source/timing receipts, then normalizes audio to -16 LUFS with a -1.5 dBTP target. The motion segments must be under `<ROADSTAR_RENDER_WORK>/film`. Set `ROADSTAR_RENDER_WORK`, `ROADSTAR_CAPTURE`, `ROADSTAR_NATIVE_CLIP` and `ROADSTAR_SUBMISSION` as needed. The submission directory supplies `private-build/audio/<scene>.wav`. Licensed fonts and the ten scene descriptions are included here.

Capture inputs are full app viewports after authentication, with no altered UI values. `01-dock-delay.mp4`, `02-recovery-approval.mp4`, `04-document-source.mp4`, `05-billing-evidence.mp4` and `07-planning-record.mp4` use separate authorized synthetic fixtures. Native footage is labeled emulator. Authentication recordings, credentials and customer source rows are excluded from source and public exports.

The ten segment durations remain unchanged, so the existing narration and sentence-level captions can be reused. Captions are approximately aligned within each beat; human listening and live presentation rehearsal remain final operator checks. Physical background-location and native iOS verification are explicitly disclosed as pending.

`scripts/verify-demo-audio.mjs` provides the retained signal-level gate for the promoted film. It checks codec/channel/duration, integrated loudness, loudness range, true peak and long silence, then records film, caption and AAC packet hashes under `docs/evidence/demo-audio-qc-2026-09-13/`. It cannot assess pronunciation, pacing, semantics or subjective quality.

`scripts/assemble-current-demo.mjs` is the bounded September12 visual-alignment pass. It preserves the accepted four-minute film and audio, replacing only0:36–1:34 with verified dock3D, corridor replay, ranked recovery, bounded organizer-value, rejected-candidate and approval captures. The value frame uses the public receipt's declared CAD assumption and displayed variable deadhead cost; it does not claim measured revenue, savings or profit. The script writes a candidate under `/tmp`; promote only after inspecting the representative frames and running `scripts/verify-current-demo.mjs`.

The refined native composition uses the verified 26.30-second, 1080×2400 recording. `native_shots` in `assemble.py` records four source intervals and complete-card crops (Today, settled map, queue, Today); it omits the scroll transition and preserves every displayed value and map attribution. A replacement recording requires remeasuring these bounds and intervals. `native-composition.json` records the source and edits. Set `ROADSTAR_ONLY_SCENE=driver` for a focused render before full assembly.

Native detail crops receive a consistent 12-pixel ivory frame before placement on the film canvas. The frame does not alter or mask application content.
