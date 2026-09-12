# Fresh hosted presenter workspace

The retained hosted verification carrier is already approved and accepted. A live presentation needs an unconsumed state so the judge can see the consequential sequence happen once.

`scripts/prepare-cloud-presenter-workspace.mjs` uses the existing `roadstar-seed` Cloud Run job and current pinned API image to create one isolated synthetic carrier. It stages an accepted RS-1042 trip, an offered RS-1043 follow-on commitment and one simulator-authored dock delay. It deliberately creates no recommendation or approval. The next visible dispatcher action is **Rank recovery options**; the intended live sequence is recommendation → dispatcher approval → separate D-02 driver acceptance.

The script refuses to replace `data/presenter-workspace.json`. Preserve the pointer and do not rerun preparation against the same workspace. It contains identifiers only and is gitignored. Credentials remain in the existing private mode-0600 file and are never written to evidence.

```bash
node scripts/prepare-cloud-presenter-workspace.mjs
node scripts/verify-cloud-presenter-workspace.mjs
```

The second command is read-only. It opens the hosted Firebase dispatcher and 390px replacement-driver views, asserts that ranking is enabled and D-02 has no trip, records screenshots, confirms zero operational POSTs and verifies the full carrier state is unchanged. Evidence lives in `docs/evidence/presenter-workspace-2026-09-12/`.

For the live presentation, start on the expanded delay, click **Rank recovery options**, review the retained HOS rejection, approve the selected revision, then switch to the D-02 driver identity and accept the offer. Those actions consume this presenter workspace. Create another isolated workspace only by explicitly archiving the prior pointer and rerunning the preparation script.

This is synthetic cloud presentation data. It does not add a hosted simulator service, infer real traffic, measure human task time or establish revenue. The preparation job reuses approved infrastructure and performs no model call.
