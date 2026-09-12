# Offline presentation kit

`scripts/prepare-offline-demo-kit.mjs` creates a credential-free fallback at `../submission/roadstar/offline-demo-kit/`. It copies the verified four-minute film, captions, PDF, editable deck, live presentation plan, video run-of-show, current scenario acceptance map, hosted recovery evidence, matched 3D Highway 401 comparison report/captures and project README.

The script checks the four public artifacts against `current-artifact-verification.json`, verifies every copy byte-for-byte and writes `SHA256SUMS.txt`, `manifest.json` and a `START-HERE.md` handoff. It does not include preview credentials, Firebase configuration, customer workbooks, simulator checkpoints or stored source documents.

Run from the product root:

```bash
node scripts/prepare-offline-demo-kit.mjs
```

After copying the generated folder to another device, run the platform's SHA-256 checker against `SHA256SUMS.txt` and play the complete MP4 once with audio. Venue playback, human listening, judge access and portal acceptance remain separate checks.
