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

try {
  const carrier = `competing-approvals-${randomUUID()}`;
  await store.seed(carrier);
  const dispatcher = await store.membership("demo-dispatcher", carrier);
  const first: any = await store.propose(dispatcher, command(), {
    loadId: "RS-1042",
    driverId: "D-01",
    truckId: "T-101",
    trailerId: "V-101",
    reason: "First dispatcher is reviewing the shared truck.",
  });
  const second: any = await store.propose(dispatcher, command(), {
    loadId: "RS-1044",
    driverId: "D-02",
    truckId: "T-101",
    trailerId: "R-101",
    reason: "Second dispatcher is reviewing the same shared truck.",
  });
  const fixture = {
    createdAt: new Date().toISOString(),
    carrier,
    sharedResourceId: "T-101",
    proposals: [
      { id: first.id, loadId: "RS-1042", revision: first.revision },
      { id: second.id, loadId: "RS-1044", revision: second.revision },
    ],
    scope:
      "Two eligible pending proposals for overlapping loads share T-101. No reservation exists until a dispatcher approves one proposal.",
  };
  await mkdir("docs/evidence/competing-approvals-2026-09-12", {
    recursive: true,
  });
  await writeFile(
    "data/competing-approvals-fixture.json",
    `${JSON.stringify(fixture, null, 2)}\n`,
  );
  console.log(JSON.stringify({ carrier, proposals: fixture.proposals.length }));
} finally {
  await db.end();
}
