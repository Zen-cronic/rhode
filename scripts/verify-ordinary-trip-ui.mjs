import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import pg from "pg";

const fixture = JSON.parse(
  await readFile("data/route-egress-fixture.json", "utf8"),
);
const receipt = JSON.parse(
  await readFile(
    "docs/evidence/route-egress-2026-09-12/verification.json",
    "utf8",
  ),
);
const output = "docs/evidence/ordinary-trip-2026-09-12";
const webBase = "http://127.0.0.1:5185";
const apiBase = "http://127.0.0.1:4010";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const db = new pg.Pool({
  connectionString:
    "postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar",
});
const pageErrors = [];
await mkdir(output, { recursive: true });

async function login(identity, width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) =>
    pageErrors.push(`${identity}: ${String(error)}`),
  );
  await page.goto(webBase);
  await page.getByLabel("Carrier ID").fill(fixture.carrier);
  await page.getByLabel("Identity").selectOption(identity);
  await page.getByRole("button", { name: "Open operations →", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  return { context, page };
}

async function apiState() {
  const response = await fetch(`${apiBase}/api/state`, {
    headers: {
      authorization: "Bearer demo-dispatcher",
      "x-carrier-id": fixture.carrier,
    },
  });
  assert.equal(response.status, 200);
  return response.json();
}

try {
  const dispatcher = await login("demo-dispatcher", 1440);
  const driver = await login("demo-driver-1", 390);
  try {
    const tripCard = driver.page
      .locator("article.trip-card")
      .filter({ has: driver.page.getByRole("heading", { name: /RS-1042/ }) });
    await tripCard.getByText("accepted", { exact: true }).waitFor();
    assert.match(
      await tripCard.innerText(),
      /London local yard · synthetic location → London distribution dock · demo location/,
    );
    assert.match(await tripCard.innerText(), /Truck T-101 · Trailer V-101/);
    await tripCard.screenshot({ path: `${output}/driver-accepted-manifest.png` });
    assert.equal(
      await driver.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );

    await dispatcher.page
      .getByRole("button", { name: "Tracking", exact: true })
      .click();
    await dispatcher.page
      .getByLabel("Mileage report scope")
      .selectOption(`assignment:${fixture.assignmentId}`);
    const mileage = dispatcher.page.getByRole("region", { name: "Mileage report" });
    await mileage.getByText(/Reported odometer increments:/).waitFor();
    const mileageText = await mileage.innerText();
    assert.match(mileageText, /7801 retained samples/);
    assert.match(mileageText, /Reported odometer increments: 4\.4\d km/);
    await mileage.screenshot({ path: `${output}/dispatcher-mileage.png` });
    await dispatcher.page
      .getByLabel("Tracked assignment")
      .selectOption(fixture.assignmentId);
    await dispatcher.page.getByText(/loaded samples · .*applied coordinates/).waitFor();
    const trackingPanel = dispatcher.page.locator("section.tracking-panel");
    const trackingText = await trackingPanel.innerText();
    assert.match(trackingText, /500 loaded samples · 500 applied coordinates/);
    assert.match(trackingText, /Reported odometer distance/);
    const map = dispatcher.page.getByLabel(
      "Google map of recorded applied telemetry samples",
    );
    await map.waitFor();
    await dispatcher.page
      .getByText("Loading breadcrumb map…", { exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(await trackingPanel.getByRole("alert").count(), 0);
    await dispatcher.page.locator(".tracking-map").screenshot({
      path: `${output}/dispatcher-route-trace.png`,
    });

    await dispatcher.page
      .getByRole("button", { name: "Evidence & billing", exact: true })
      .click();
    const billing = dispatcher.page.locator("section.billing-panel");
    await billing.getByText("RS-1042 · london-dock", { exact: true }).waitFor();
    await billing.getByText("121 minutes observed · 1 billable minutes", { exact: true }).waitFor();
    await billing.getByText("$1.67", { exact: true }).waitFor();
    await billing.screenshot({ path: `${output}/dispatcher-visit-and-draft.png` });

    const state = await apiState();
    const assignment = state.assignments.find(
      (item) => item.id === fixture.assignmentId,
    );
    const visit = state.visits.find((item) => item.id === receipt.visit.id);
    const invoice = state.invoices.find((item) => item.id === receipt.invoice.id);
    assert.equal(assignment.status, "accepted");
    assert.equal(assignment.loadId, "RS-1042");
    assert.equal(
      new Date(visit.departure).toISOString(),
      new Date(receipt.visit.departure).toISOString(),
    );
    assert.equal(invoice.body.amountCents, 167);
    assert.equal(invoice.body.billableMinutes, 1);
    assert.deepEqual(invoice.body.evidence, [
      receipt.visit.arrivalEvent,
      receipt.visit.departureEvent,
    ]);

    const telemetry = (
      await db.query(
        `SELECT count(*)::int AS samples,
          count(DISTINCT id)::int AS unique_samples,
          min((body->>'speedKph')::numeric)::float8 AS min_speed_kph,
          max((body->>'speedKph')::numeric)::float8 AS max_speed_kph,
          min((body->>'odometerKm')::numeric)::float8 AS start_odometer_km,
          max((body->>'odometerKm')::numeric)::float8 AS end_odometer_km
        FROM telemetry
        WHERE carrier_id=$1 AND assignment_id=$2`,
        [fixture.carrier, fixture.assignmentId],
      )
    ).rows[0];
    assert.deepEqual(
      { samples: telemetry.samples, uniqueSamples: telemetry.unique_samples },
      { samples: receipt.eventCount, uniqueSamples: receipt.eventCount },
    );
    assert.ok(telemetry.max_speed_kph > 0);
    assert.equal(pageErrors.length, 0);

    const verification = {
      verifiedAt: new Date().toISOString(),
      carrier: fixture.carrier,
      assignmentId: fixture.assignmentId,
      runId: fixture.runId,
      loadId: assignment.loadId,
      driverId: assignment.driverId,
      assignmentStatus: assignment.status,
      route: receipt.route,
      telemetry: {
        samples: telemetry.samples,
        uniqueSamples: telemetry.unique_samples,
        minSpeedKph: telemetry.min_speed_kph,
        maxSpeedKph: telemetry.max_speed_kph,
        startOdometerKm: telemetry.start_odometer_km,
        endOdometerKm: telemetry.end_odometer_km,
      },
      visit: receipt.visit,
      invoice: {
        id: invoice.id,
        status: invoice.status,
        amountCents: invoice.body.amountCents,
        currency: invoice.body.currency,
        dwellMinutes: invoice.body.dwellMinutes,
        billableMinutes: invoice.body.billableMinutes,
        evidence: invoice.body.evidence,
      },
      pageErrors,
      checks: [
        "The same accepted assignment appears in the 390px driver manifest and dispatcher state",
        "Dispatcher tracking shows retained mileage plus a Google Maps breadcrumb trail with recorded speed and odometer samples",
        "The same assignment has one completed London visit linked to exact arrival and departure source observations",
        "The evidence ledger shows the resulting one-minute CAD 1.67 detention draft after the 120-minute allowance",
        "All 7,801 acknowledged telemetry IDs exist exactly once in PostgreSQL",
        "Both browser contexts completed without page errors and the narrow driver view has no horizontal overflow",
      ],
      limits:
        "Local built responsive web, API and PostgreSQL over a retained synthetic London route. Google Maps renders the recorded breadcrumb page; Valhalla routing and deterministic replay were verified by the linked route-egress receipt. The accepted assignment and completed facility visit are distinct from stop-completion. This is responsive driver evidence, not native-device verification, certified ELD proof, an exact physical boundary crossing or an approved invoice.",
    };
    await writeFile(
      `${output}/verification.json`,
      `${JSON.stringify(verification, null, 2)}\n`,
    );
    console.log(
      JSON.stringify({
        assignmentId: verification.assignmentId,
        samples: verification.telemetry.samples,
        visit: verification.visit.id,
        detentionCents: verification.invoice.amountCents,
      }),
    );
  } finally {
    await Promise.all([dispatcher.context.close(), driver.context.close()]);
  }
} finally {
  await Promise.all([browser.close(), db.end()]);
}
