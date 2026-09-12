import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const fixture = JSON.parse(await readFile("data/presenter-workspace.json", "utf8"));
assert.equal(fixture.status, "ready_before_recommendation");
const users = JSON.parse(await readFile("data/preview-credentials.json", "utf8"));
const webBase = "https://roadstar-web-739889188415.us-central1.run.app";
const apiBase = "https://roadstar-api-739889188415.us-central1.run.app";
const errors = [];
const posts = [];
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });

async function login(uid, width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${uid}: ${String(error)}`));
  page.on("request", (request) => {
    if (request.url().includes("/api/") && request.method() === "POST") {
      posts.push({ uid, path: new URL(request.url()).pathname });
    }
  });
  const user = users.find((candidate) => candidate.uid === uid);
  assert.ok(user);
  await page.goto(webBase);
  await page.getByLabel("Carrier ID").fill(fixture.carrier);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Open operations →", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  return { context, page };
}

async function state(token) {
  const response = await fetch(`${apiBase}/api/state`, {
    headers: { authorization: `Bearer ${token}`, "x-carrier-id": fixture.carrier },
  });
  assert.equal(response.status, 200);
  return response.json();
}

const productionEnv = Object.fromEntries(
  (await readFile("apps/web/.env.production", "utf8"))
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const dispatcherUser = users.find((candidate) => candidate.uid === "preview-dispatcher");
const auth = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${productionEnv.VITE_FIREBASE_API_KEY}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: dispatcherUser.email,
      password: dispatcherUser.password,
      returnSecureToken: true,
    }),
  },
);
assert.equal(auth.status, 200);
const token = (await auth.json()).idToken;
const before = await state(token);

try {
  const dispatcher = await login("preview-dispatcher", 1440);
  const driver = await login("preview-driver-2", 390);
  try {
    await dispatcher.page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: /^Recovery/ })
      .click();
    await dispatcher.page.getByText(/1 recorded delay/).click();
    const rank = dispatcher.page.getByRole("button", {
      name: "Rank recovery options",
      exact: true,
    });
    await rank.waitFor();
    assert.equal(await rank.isEnabled(), true);
    await dispatcher.page.screenshot({
      path: `${fixture.evidenceDir}/dispatcher-ready.png`,
      fullPage: true,
    });
    await driver.page.getByText("No trips assigned.", { exact: true }).waitFor();
    await driver.page.screenshot({
      path: `${fixture.evidenceDir}/replacement-driver-ready.png`,
      fullPage: true,
    });
    assert.equal(
      await driver.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  } finally {
    await Promise.all([dispatcher.context.close(), driver.context.close()]);
  }
} finally {
  await browser.close();
}

const after = await state(token);
const stable = (value) => {
  const copy = structuredClone(value);
  delete copy.serverTime;
  return copy;
};
assert.deepEqual(stable(after), stable(before));
assert.equal(after.proposals.length, 0);
assert.equal(after.disruptions.length, 1);
assert.equal(
  after.assignments.find((item) => item.id === fixture.currentAssignmentId).status,
  "accepted",
);
assert.equal(
  after.assignments.find((item) => item.id === fixture.atRiskAssignmentId).status,
  "offered",
);
assert.deepEqual(posts, []);
assert.deepEqual(errors, []);
const verification = {
  verifiedAt: new Date().toISOString(),
  carrier: fixture.carrier,
  webBase,
  currentAssignmentId: fixture.currentAssignmentId,
  atRiskAssignmentId: fixture.atRiskAssignmentId,
  delayId: fixture.delayId,
  nextAction: "Rank recovery options",
  expectedLiveSequence: fixture.expectedLiveSequence,
  posts,
  errors,
  checks: [
    "Hosted Firebase dispatcher opens the pre-recommendation recovery state",
    "The staged delay is expanded and Rank recovery options is enabled",
    "Replacement driver D-02 has no trip before dispatcher approval",
    "Read-only browser inspection leaves the complete carrier state unchanged",
    "No operational POST, page error or narrow horizontal overflow occurred",
  ],
  limits:
    "Fresh synthetic presenter workspace. Readiness only; live recommendation, approval, driver acceptance and human rehearsal remain deliberately unconsumed.",
};
await writeFile(
  `${fixture.evidenceDir}/browser-readiness.json`,
  `${JSON.stringify(verification, null, 2)}\n`,
);
console.log(JSON.stringify({ carrier: fixture.carrier, ready: true, posts: posts.length }));
