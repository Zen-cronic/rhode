import test from "node:test";
import assert from "node:assert/strict";
import { validateRouteEvidence } from "../src/route-evidence.ts";
const evidence = {
  fingerprint: "unit-test-only",
  loadId: "test-load",
  truckId: "test-truck",
  coordinates: [
    [-79.8, 43.5],
    [-79.7, 43.6],
  ],
  drivingMinutes: 10,
  deadheadMinutes: 0,
  profile: {
    height: 4.1,
    width: 2.6,
    length: 23,
    weight: 40,
    axle_load: 9,
    hazmat: false,
    evidence: "synthetic-scenario",
  },
  dataset: "unit-test-dataset",
  routing_evidence: "valhalla-truck",
  warning: "Unit-test fixture only",
};
test("retains the exact server geometry and vehicle evidence", () => {
  const result = validateRouteEvidence(evidence);
  assert.equal(result, evidence);
  assert.equal(result.coordinates, evidence.coordinates);
});
test("refuses absent geometry rather than constructing a fallback", () => {
  for (const coordinates of [
    undefined,
    [],
    [[0, 0]],
    [
      [0, 91],
      [1, 0],
    ],
    [
      [181, 0],
      [1, 0],
    ],
    [
      [0, 0],
      [Number.NaN, 0],
    ],
  ])
    assert.throws(
      () => validateRouteEvidence({ ...evidence, coordinates }),
      /No route has been drawn/,
    );
});
test("refuses non-truck routing or missing vehicle evidence", () => {
  for (const mutation of [
    { routing_evidence: "car-route" },
    { profile: undefined },
    { profile: { ...evidence.profile, height: 0 } },
    { profile: { ...evidence.profile, evidence: "unverified" } },
    { dataset: "" },
    { drivingMinutes: -1 },
  ])
    assert.throws(
      () => validateRouteEvidence({ ...evidence, ...mutation }),
      /No route has been drawn/,
    );
});
