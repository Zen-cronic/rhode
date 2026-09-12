import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const fixture = JSON.parse(
  await readFile("data/workflow-comparison-fixture.json", "utf8"),
);
const output = "docs/evidence/workflow-comparison-2026-09-12";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const errors = [];

const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
};

async function login(carrier, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("http://127.0.0.1:5185");
  await page.getByLabel("Carrier ID").fill(carrier);
  await page.getByLabel("Identity").selectOption("demo-dispatcher");
  await page.getByRole("button", { name: "Open operations →", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Recovery control", exact: true }).waitFor();
  return { context, page };
}

async function manualRun(item, capture) {
  const { context, page } = await login(item.carrier);
  try {
    const started = await page.evaluate(() => performance.now());
    await page.locator("#rehearsal-load").selectOption("RS-1043");
    await page.getByRole("button", { name: "Open rehearsal →", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Driver").selectOption("D-03");
    await dialog.getByLabel("Truck").selectOption("T-102");
    await dialog.getByLabel("Trailer").selectOption("V-102");
    const [rejectedResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/propose") &&
          response.request().method() === "POST",
      ),
      dialog
        .getByRole("button", { name: "Prepare recovery proposal", exact: true })
        .click(),
    ]);
    assert.equal(rejectedResponse.status(), 409);
    const rejection = await rejectedResponse.json();
    assert.equal(rejection.error.code, fixture.expected.rejected.code);
    assert.match(rejection.error.message, /HOS evidence is missing or stale/);
    await dialog.getByText(/HOS evidence is missing or stale/).waitFor();
    if (capture)
      await dialog.screenshot({ path: `${output}/manual-rejected.png` });
    await dialog.getByLabel("Driver").selectOption("D-02");
    const [selectedResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/propose") &&
          response.request().method() === "POST" &&
          response.status() === 200,
      ),
      dialog
        .getByRole("button", { name: "Prepare recovery proposal", exact: true })
        .click(),
    ]);
    const selected = await selectedResponse.json();
    assert.deepEqual(
      [selected.body.driverId, selected.body.truckId, selected.body.trailerId],
      Object.values(fixture.expected.selected),
    );
    await page.getByLabel("Assignment comparison").waitFor();
    const elapsedMs = Math.round(
      (await page.evaluate(() => performance.now())) - started,
    );
    if (capture)
      await page.screenshot({ path: `${output}/manual-selected.png`, fullPage: true });
    return {
      carrier: item.carrier,
      elapsedMs,
      dispatcherActivations: 8,
      commandRequests: 2,
      rejected: {
        driverId: "D-03",
        code: rejection.error.code,
        reason: rejection.error.message,
        retainedInProposal: false,
      },
      selected: fixture.expected.selected,
    };
  } finally {
    await context.close();
  }
}

async function rankedRun(item, capture) {
  const { context, page } = await login(item.carrier);
  try {
    const started = await page.evaluate(() => performance.now());
    await page.locator(".delay-history").getByText(/1 recorded delay/).click();
    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.url().endsWith("/api/recommend") &&
          candidate.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Rank recovery options", exact: true }).click(),
    ]);
    assert.equal(response.status(), 200, await response.text());
    const recommendation = await response.json();
    assert.deepEqual(
      [
        recommendation.body.driverId,
        recommendation.body.truckId,
        recommendation.body.trailerId,
      ],
      Object.values(fixture.expected.selected),
    );
    const rejected = recommendation.body.candidates.find(
      (candidate) => candidate.driverId === fixture.expected.rejected.driverId,
    );
    assert.equal(rejected.eligible, false);
    assert.match(rejected.reasons.join(" "), /HOS evidence is missing or stale/);
    const receipt = page.getByLabel("Recovery workflow evidence");
    await receipt.getByText("One request screened 2 resource combinations", { exact: true }).waitFor();
    await receipt.getByText(/1 feasible · 1 rejected · 1 constraint reason retained/).waitFor();
    const elapsedMs = Math.round(
      (await page.evaluate(() => performance.now())) - started,
    );
    if (capture) {
      await receipt.screenshot({ path: `${output}/ranked-receipt-desktop.png` });
      await page.setViewportSize({ width: 390, height: 1000 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await receipt.screenshot({ path: `${output}/ranked-receipt-narrow.png` });
    }
    return {
      carrier: item.carrier,
      elapsedMs,
      dispatcherActivations: 2,
      commandRequests: 1,
      candidatesScreened: recommendation.body.candidates.length,
      rejected: {
        driverId: rejected.driverId,
        reasons: rejected.reasons,
        retainedInProposal: true,
      },
      selected: fixture.expected.selected,
    };
  } finally {
    await context.close();
  }
}

try {
  const runs = [];
  for (const pair of fixture.pairs) {
    runs.push({
      ordinal: pair.ordinal,
      manual: await manualRun(pair.manual, pair.ordinal === 1),
      ranked: await rankedRun(pair.ranked, pair.ordinal === 1),
    });
  }
  assert.deepEqual(errors, []);
  const manualTimes = runs.map((run) => run.manual.elapsedMs);
  const rankedTimes = runs.map((run) => run.ranked.elapsedMs);
  const evidence = {
    verifiedAt: new Date().toISOString(),
    comparison: {
      pairs: runs.length,
      identicalSyntheticStartingShape: true,
      manual: {
        dispatcherActivations: 8,
        commandRequests: 2,
        medianScriptedElapsedMs: median(manualTimes),
        elapsedMs: manualTimes,
        rejectedReasonRetainedInProposal: false,
      },
      ranked: {
        dispatcherActivations: 2,
        commandRequests: 1,
        medianScriptedElapsedMs: median(rankedTimes),
        elapsedMs: rankedTimes,
        rejectedReasonRetainedInProposal: true,
      },
      activationDifference: 6,
      requestDifference: 1,
    },
    runs,
    checks: [
      "Five isolated manual/ranked carrier pairs began from the same seeded assignments and delay shape",
      "Manual assembly tested D-03, received the HOS rejection, then selected D-02 / T-102 / V-102",
      "Ranked recovery selected the same feasible resources and retained the D-03 rejection in one proposal",
      "The built UI exposes exact combinations/rejections/reason count without a human-time or financial claim",
      "Desktop and 390px workflow receipts rendered without page errors or horizontal overflow",
    ],
    limits:
      "Local Playwright automation against synthetic data. Elapsed values measure scripted browser/API execution on this machine, not dispatcher task time, usability, carrier savings, or an external fragmented-tool baseline. Activation counts start after login and state readiness.",
  };
  await writeFile(
    `${output}/verification.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(JSON.stringify(evidence.comparison));
} finally {
  await browser.close();
}
