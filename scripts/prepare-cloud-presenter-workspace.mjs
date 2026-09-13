import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

const project = "roadstar-2026-kzh";
const region = "us-central1";
const apiBase = "https://roadstar-api-739889188415.us-central1.run.app";
const carrier = `presenter-recovery-${randomUUID()}`;
const pointer = "data/presenter-workspace.json";
const evidenceDir = "docs/evidence/presenter-workspace-2026-09-12";
try {
  await access(pointer);
  throw new Error(
    "A presenter workspace pointer already exists. Preserve it; do not replace a live-demo workspace implicitly.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const image = execFileSync(
  "gcloud",
  [
    "run",
    "services",
    "describe",
    "roadstar-api",
    `--project=${project}`,
    `--region=${region}`,
    "--format=value(spec.template.spec.containers[0].image)",
  ],
  { encoding: "utf8" },
).trim();
assert.match(image, /\/roadstar\/api@sha256:/);

const seedCode = `import {pool,migrate} from './services/api/src/db.ts';import {Store} from './services/api/src/store.ts';const db=pool();try{await migrate(db);const store=new Store(db),carrier=${JSON.stringify(carrier)};if((await db.query('SELECT 1 FROM carriers WHERE id=$1',[carrier])).rowCount)throw Error('Carrier exists');await store.seed(carrier);for(const[old,uid]of[['demo-dispatcher','preview-dispatcher'],['demo-driver-1','preview-driver-1'],['demo-driver-2','preview-driver-2'],['demo-simulator','preview-simulator']])await db.query('UPDATE memberships SET uid=$1 WHERE carrier_id=$2 AND uid=$3',[uid,carrier,old]);console.log(JSON.stringify({carrier,source:'isolated synthetic presenter fixture'}));}finally{await db.end();}`;

await mkdir(evidenceDir, { recursive: true });
await mkdir("data", { recursive: true });
await writeFile(
  pointer,
  `${JSON.stringify(
    {
      carrier,
      status: "preparing",
      evidenceDir,
      image,
      requestedAt: new Date().toISOString(),
      source: "isolated synthetic presenter fixture",
    },
    null,
    2,
  )}\n`,
);
execFileSync(
  "gcloud",
  [
    "run",
    "jobs",
    "update",
    "roadstar-seed",
    `--project=${project}`,
    `--region=${region}`,
    `--image=${image}`,
    "--quiet",
  ],
  { stdio: "inherit" },
);
execFileSync(
  "gcloud",
  [
    "run",
    "jobs",
    "execute",
    "roadstar-seed",
    `--project=${project}`,
    `--region=${region}`,
    `--args=^~^--input-type=module~-e~${seedCode}`,
    "--wait",
    "--quiet",
  ],
  { stdio: "inherit" },
);

const users = JSON.parse(await readFile("data/preview-credentials.json", "utf8"));
const productionEnv = Object.fromEntries(
  (await readFile("apps/web/.env.production", "utf8"))
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const tokens = {};
for (const uid of ["preview-dispatcher", "preview-driver-1", "preview-simulator"]) {
  const user = users.find((candidate) => candidate.uid === uid);
  assert.ok(user, `Missing private preview identity ${uid}`);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${productionEnv.VITE_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        returnSecureToken: true,
      }),
    },
  );
  assert.equal(response.status, 200, `Firebase sign-in failed for ${uid}`);
  tokens[uid] = (await response.json()).idToken;
}

async function api(path, body, expectedVersion = 1, uid = "preview-dispatcher") {
  const response = await fetch(`${apiBase}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${tokens[uid]}`,
      "x-carrier-id": carrier,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
      "if-match": String(expectedVersion),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}

const current = await api("dispatch", {
  loadId: "RS-1042",
  driverId: "D-01",
  truckId: "T-101",
  trailerId: "V-101",
});
const accepted = await api(
  "respond",
  { assignmentId: current.id, action: "accept" },
  1,
  "preview-driver-1",
);
const atRisk = await api("dispatch", {
  loadId: "RS-1043",
  driverId: "D-01",
  truckId: "T-101",
  trailerId: "V-101",
});
const delay = await api(
  "delay",
  {
    assignmentId: current.id,
    expectedEnd: "2026-09-13T17:00:00Z",
    observedAt: "2026-09-13T15:30:00Z",
    reason: "Synthetic dock departure delay staged for the Rhode presentation",
  },
  accepted.version,
  "preview-simulator",
);
assert.ok(delay.impactedLoads.some((item) => item.id === atRisk.id));
const state = await api("state");
assert.equal(state.proposals.length, 0);
assert.equal(state.assignments.find((item) => item.id === current.id).status, "accepted");
assert.equal(state.assignments.find((item) => item.id === atRisk.id).status, "offered");
assert.equal(state.disruptions.length, 1);

const preparedAt = new Date().toISOString();
const fixture = {
  carrier,
  status: "ready_before_recommendation",
  preparedAt,
  evidenceDir,
  image,
  currentAssignmentId: current.id,
  atRiskAssignmentId: atRisk.id,
  delayId: delay.id,
  expectedLiveSequence: ["recommend", "approve", "respond"],
  source: "isolated synthetic presenter fixture",
};
await writeFile(pointer, `${JSON.stringify(fixture, null, 2)}\n`);
await writeFile(
  `${evidenceDir}/preparation.json`,
  `${JSON.stringify(
    {
      preparedAt,
      carrier,
      image,
      current: { id: current.id, loadId: current.loadId, status: accepted.status },
      atRisk: { id: atRisk.id, loadId: atRisk.loadId, status: atRisk.status },
      delay: {
        id: delay.id,
        assignmentId: delay.assignmentId,
        expectedEnd: delay.expectedEnd,
        affectedAssignmentId: atRisk.id,
      },
      final: {
        proposals: state.proposals.length,
        disruptions: state.disruptions.length,
        currentStatus: state.assignments.find((item) => item.id === current.id).status,
        atRiskStatus: state.assignments.find((item) => item.id === atRisk.id).status,
      },
      checks: [
        "A fresh isolated synthetic carrier was seeded through the existing Cloud Run job",
        "RS-1042 is accepted by D-01 before the staged delay",
        "RS-1043 is an offered follow-on commitment affected by the delay",
        "No recovery proposal or approval exists; the next presenter action is Rank recovery options",
        "The live sequence remains dispatcher recommendation, dispatcher approval and separate driver response",
      ],
      limits:
        "Prepared cloud data only. No live-demo actions, human rehearsal, simulator Cloud Run service, real traffic, revenue or physical-device claim.",
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify({ carrier, status: fixture.status, atRiskLoad: atRisk.loadId }));
