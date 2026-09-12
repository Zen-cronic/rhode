import test from "node:test";
import assert from "node:assert/strict";
import { recoveryWorkflowEvidence } from "../src/recovery-workflow.ts";

test("ranked candidates produce a bounded decision-packet receipt", () => {
  assert.deepEqual(
    recoveryWorkflowEvidence([
      { eligible: true, reasons: [] },
      {
        eligible: false,
        reasons: [
          "Current HOS evidence is missing or stale.",
          "Current HOS evidence is missing or stale.",
        ],
      },
    ]),
    {
      combinationsScreened: 2,
      feasibleCombinations: 1,
      rejectedCombinations: 1,
      retainedConstraintReasons: 1,
    },
  );
});

test("manual proposals without candidate evidence do not invent a receipt", () => {
  assert.equal(recoveryWorkflowEvidence(), null);
  assert.equal(recoveryWorkflowEvidence([]), null);
});
