# Packaged matched Highway 401 replay

This evidence verifies the read-only 3D comparison bundled with the RoadStar web preview. The archive contains two complete deterministic simulator recordings generated from the same assignment, seed, route, clock, stops, waits, and speed profile. The comparison changes only the Highway 401 slowdown intervention.

## Verified behavior

- The compiled web bundle authenticates against the local synthetic fixture and opens the Recovery view.
- The replay assembles 2,401 API-acknowledged observations for the baseline and 2,401 for the slowdown through the same page validator used by the simulator-backed replay.
- The shared cursor uses the last observation at or before the selected scenario time without interpolation.
- At `T+40:00`, the display reports a `+27.657 km` baseline progress advantage and a modeled slowdown finish delta of `+00:26:46`.
- The 3D view renders at desktop width and the 390 px layout has no document overflow.
- Once loaded, the completed recording remains inspectable after the browser goes offline.
- The browser made one request for the packaged archive, no simulator presentation requests, and no operational API writes.

## Artifacts

- `compiled-local-verification.json`: machine-readable verification receipt.
- `compiled-local-desktop.png`: desktop Recovery view at intervention end.
- `compiled-local-narrow.png`: narrow replay panel at intervention end.
- `hosted-verification.json`: verification receipt for web revision `roadstar-web-00064-vuj`.
- `hosted-desktop.png` and `hosted-narrow.png`: authenticated Cloud Run rendering at intervention end.
- Packaged archive: `apps/web/public/demo/matched-401-replay.json`, 2,393,729 bytes, SHA-256 `aded08bfbaef7af1aa47dbd55468f7053ac26b42eb2c1e52f3fe94aaf6e264ae`.

## Claim boundary

The replay is synthetic, deterministic, and read-only. Its controls change only the historical view cursor. This evidence does not claim hosted simulator mutation, live traffic, certified GPS or ELD data, authoritative billing timestamps, physical-GPU testing, or 131-vehicle rendering performance.
