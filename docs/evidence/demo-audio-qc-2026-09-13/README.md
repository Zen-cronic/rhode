# Demo audio quality verification

`scripts/verify-demo-audio.mjs` checks the promoted four-minute film directly. It requires one complete AAC-LC mono48kHz stream, −18 to−14LUFS integrated loudness, at most8LU of loudness range, a true peak no higher than−1dBFS and no silence interval of0.8seconds or longer below−45dBFS.

The current master passes at−16.0LUFS integrated,2.5LU range and−1.4dBFS true peak with zero reported silence intervals. Its accepted audio packet and caption hashes are recorded in `verification.json` alongside the film hash.

This signal-level test catches clipping, dead air, stream loss and material loudness drift. It cannot judge pronunciation, meaning, pacing or subjective quality, so one human end-to-end listen with captions remains a submission gate.
