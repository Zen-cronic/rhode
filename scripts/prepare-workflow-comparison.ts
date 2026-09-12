import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pool } from "../services/api/src/db.ts";
import { Store } from "../services/api/src/store.ts";

const db = pool(
  "postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar",
);
const store = new Store(db);
const command = (expectedVersion = 1) => ({
  key: randomUUID(),
  expectedVersion,
});

async function prepare(kind: "manual" | "ranked", ordinal: number) {
  const carrier = `workflow-${kind}-${ordinal}-${randomUUID()}`;
  await store.seed(carrier);
  const dispatcher = await store.membership("demo-dispatcher", carrier);
  const driver = await store.membership("demo-driver-1", carrier);
  const simulator = await store.membership("demo-simulator", carrier);
  const resources = {
    loadId: "RS-1042",
    driverId: "D-01",
    truckId: "T-101",
    trailerId: "V-101",
  };
  const current: any = await store.dispatch(
    dispatcher,
    command(),
    resources,
  );
  await store.respond(driver, command(), {
    assignmentId: current.id,
    action: "accept",
  });
  const affected: any = await store.dispatch(dispatcher, command(), {
    ...resources,
    loadId: "RS-1043",
  });
  const delay: any = await store.delay(simulator, command(2), {
    assignmentId: current.id,
    expectedEnd: "2026-09-13T17:00:00Z",
    observedAt: "2026-09-13T15:30:00Z",
    reason: `Synthetic dock delay for ${kind} workflow comparison`,
  });
  if (!delay.impactedLoads.some((item: any) => item.id === affected.id))
    throw new Error("Prepared delay did not expose the affected assignment");
  return {
    carrier,
    currentAssignmentId: current.id,
    affectedAssignmentId: affected.id,
  };
}

try {
  const pairs = [];
  for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
    pairs.push({
      ordinal,
      manual: await prepare("manual", ordinal),
      ranked: await prepare("ranked", ordinal),
    });
  }
  const fixture = {
    createdAt: new Date().toISOString(),
    pairs,
    expected: {
      rejected: { driverId: "D-03", code: "INELIGIBLE" },
      selected: {
        driverId: "D-02",
        truckId: "T-102",
        trailerId: "V-102",
      },
    },
    scope:
      "Five isolated identical synthetic pairs. Browser automation begins after login/state readiness. Elapsed timings are local scripted observations, not human task-time measurements.",
  };
  await mkdir("docs/evidence/workflow-comparison-2026-09-12", {
    recursive: true,
  });
  await writeFile(
    "data/workflow-comparison-fixture.json",
    `${JSON.stringify(fixture, null, 2)}\n`,
  );
  console.log(JSON.stringify({ pairs: pairs.length }));
} finally {
  await db.end();
}
