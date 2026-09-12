import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import pg from "pg";

const fixture = JSON.parse(
  await readFile("data/competing-approvals-fixture.json", "utf8"),
);
const output = "docs/evidence/competing-approvals-2026-09-12";
const webBase = "http://127.0.0.1:5185";
const apiBase = "http://127.0.0.1:4010";
const pageErrors = [];
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const db = new pg.Pool({
  connectionString:
    "postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar",
});

async function login(label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(`${label}: ${String(error)}`));
  await page.goto(webBase);
  await page.getByLabel("Carrier ID").fill(fixture.carrier);
  await page.getByLabel("Identity").selectOption("demo-dispatcher");
  await page.getByRole("button", { name: "Open operations →", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Recovery control", exact: true }).waitFor();
  return { context, page };
}

function proposalCard(page, loadId) {
  return page
    .locator("article.recovery-card")
    .filter({ has: page.getByRole("heading", { name: loadId, exact: true }) });
}

async function openApproval(page, loadId) {
  const card = proposalCard(page, loadId);
  await card.getByText("pending", { exact: true }).waitFor();
  await card.getByRole("button", { name: "Review & approve →", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Approve the recovery?" });
  await dialog.getByText(loadId, { exact: false }).waitFor();
  return dialog;
}

try {
  const left = await login("dispatcher A");
  const right = await login("dispatcher B");
  try {
    const leftProposal = fixture.proposals[0];
    const rightProposal = fixture.proposals[1];
    const leftDialog = await openApproval(left.page, leftProposal.loadId);
    const rightDialog = await openApproval(right.page, rightProposal.loadId);
    await Promise.all([
      leftDialog.screenshot({ path: `${output}/dispatcher-a-ready.png` }),
      rightDialog.screenshot({ path: `${output}/dispatcher-b-ready.png` }),
    ]);

    const leftResponse = left.page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/approve") &&
        response.request().method() === "POST",
    );
    const rightResponse = right.page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/approve") &&
        response.request().method() === "POST",
    );
    await Promise.all([
      leftDialog.getByRole("button", { name: "Approve revision 1", exact: true }).click(),
      rightDialog.getByRole("button", { name: "Approve revision 1", exact: true }).click(),
    ]);
    const responses = await Promise.all([leftResponse, rightResponse]);
    const outcomes = await Promise.all(
      responses.map(async (response, index) => ({
        side: index === 0 ? "dispatcher A" : "dispatcher B",
        loadId: fixture.proposals[index].loadId,
        status: response.status(),
        body: await response.json(),
      })),
    );
    assert.deepEqual(
      outcomes.map((outcome) => outcome.status).sort((a, b) => a - b),
      [200, 409],
    );
    const winner = outcomes.find((outcome) => outcome.status === 200);
    const loser = outcomes.find((outcome) => outcome.status === 409);
    assert.ok(winner);
    assert.ok(loser);
    assert.equal(loser.body.error.code, "INELIGIBLE");
    assert.match(loser.body.error.message, /Resource reserved by RS-104[24]\./);

    const winningPage = winner.side === "dispatcher A" ? left.page : right.page;
    const losingPage = loser.side === "dispatcher A" ? left.page : right.page;
    const losingDialog = loser.side === "dispatcher A" ? leftDialog : rightDialog;
    await losingDialog.getByRole("alert").waitFor();
    await losingDialog.screenshot({ path: `${output}/losing-conflict.png` });
    const history = winningPage.locator("details.recovery-history");
    await history.waitFor();
    await history.locator(":scope > summary").click();
    await proposalCard(winningPage, winner.loadId)
      .getByText("approved", { exact: true })
      .waitFor();
    await winningPage.screenshot({ path: `${output}/winning-assignment.png`, fullPage: true });

    const stateResponse = await fetch(`${apiBase}/api/state`, {
      headers: {
        authorization: "Bearer demo-dispatcher",
        "x-carrier-id": fixture.carrier,
      },
    });
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    const assignments = state.assignments.filter((assignment) =>
      ["RS-1042", "RS-1044"].includes(assignment.loadId),
    );
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].loadId, winner.loadId);
    assert.equal(assignments[0].truckId, fixture.sharedResourceId);
    const counts = (
      await db.query(
        `SELECT
          (SELECT count(*)::int FROM approvals WHERE carrier_id=$1) AS approvals,
          (SELECT count(*)::int FROM reservations WHERE carrier_id=$1 AND active) AS active_reservations,
          (SELECT count(*)::int FROM proposals WHERE carrier_id=$1 AND status='approved') AS approved_proposals,
          (SELECT count(*)::int FROM proposals WHERE carrier_id=$1 AND status='pending') AS pending_proposals`,
        [fixture.carrier],
      )
    ).rows[0];
    assert.deepEqual(counts, {
      approvals: 1,
      active_reservations: 3,
      approved_proposals: 1,
      pending_proposals: 1,
    });
    assert.deepEqual(pageErrors, []);
    const evidence = {
      verifiedAt: new Date().toISOString(),
      carrier: fixture.carrier,
      sharedResourceId: fixture.sharedResourceId,
      attemptedLoads: fixture.proposals.map((proposal) => proposal.loadId),
      winner: { side: winner.side, loadId: winner.loadId, status: winner.status },
      loser: {
        side: loser.side,
        loadId: loser.loadId,
        status: loser.status,
        code: loser.body.error.code,
        message: loser.body.error.message,
      },
      final: {
        assignments: assignments.map((assignment) => ({
          id: assignment.id,
          loadId: assignment.loadId,
          driverId: assignment.driverId,
          truckId: assignment.truckId,
          trailerId: assignment.trailerId,
          status: assignment.status,
        })),
        approvalCount: counts.approvals,
        activeReservationCount: counts.active_reservations,
        approvedProposalCount: counts.approved_proposals,
        pendingProposalCount: counts.pending_proposals,
      },
      checks: [
        "Two independent dispatcher browser contexts opened different eligible pending proposals before either approval",
        "Both approval commands were issued together for overlapping loads sharing T-101",
        "Exactly one command succeeded and one returned a visible 409 INELIGIBLE reservation conflict",
        "Final state contains one assignment, one approval and one approved proposal",
        "The losing proposal remains pending with its original evidence; no conflicting assignment was created",
        "Both browser contexts completed without page errors",
      ],
      limits:
        "Local built web, API and PostgreSQL with synthetic loads. Browser processes share one machine and this is a controlled concurrency demonstration, not a distributed contention load test.",
    };
    await writeFile(
      `${output}/verification.json`,
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(
      JSON.stringify({
        winner: evidence.winner,
        loser: { loadId: evidence.loser.loadId, code: evidence.loser.code },
        assignments: evidence.final.assignments.length,
        approvals: evidence.final.approvalCount,
      }),
    );
  } finally {
    await Promise.all([left.context.close(), right.context.close()]);
  }
} finally {
  await Promise.all([browser.close(), db.end()]);
}
