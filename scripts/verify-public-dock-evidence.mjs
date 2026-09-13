import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const webBase = process.env.WEB_BASE ?? 'http://127.0.0.1:5187';
const label = webBase.startsWith('https://') ? 'hosted' : 'compiled-local';
const output = 'docs/evidence/public-dock-evidence-2026-09-12';
const replayHash = 'abc688b8652682b33cbcf0b813c4ad285b8c3132a779cead246ecb4eb63007d2';

await mkdir(output, {recursive: true});
const requests = [];
const writes = [];
const errors = [];
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({viewport: {width: 1440, height: 1050}});
const page = await context.newPage();

page.on('pageerror', (error) => errors.push(String(error)));
page.on('request', (request) => {
  const entry = {method: request.method(), url: request.url()};
  requests.push(entry);
  if (!['GET', 'HEAD'].includes(entry.method)) writes.push(entry);
});

try {
  await page.goto(`${webBase}/?view=dock-evidence`);
  await page.getByRole('heading', {name: /The dock wait that changed the next move/}).waitFor();
  assert.equal(await page.locator('input[type="email"], input[type="password"]').count(), 0);
  await page.locator('.dock-proof-scene-wrap canvas, .dock-proof-diagram').first().waitFor({timeout: 30000});

  const milestone = async (name, expected) => {
    await page.getByRole('button', {name}).click();
    await page.getByText(expected, {exact: false}).first().waitFor();
  };
  await milestone(/Arrival 08:30 ET/, 'First retained yard observation');
  await milestone(/120-min boundary 10:30 ET/, 'Free dwell allowance ends');
  await milestone(/Exit 11:15:09 ET/, 'Last retained yard observation');
  await milestone(/Automatic draft POST-EXIT/, 'A CAD $75 draft is prepared');
  await milestone(/Recovery consequence 11:20 ET/, 'The next assignment changes');

  await page.getByText('Full replay fingerprint', {exact: true}).click();
  await page.getByText(replayHash, {exact: true}).waitFor();

  const body = await page.locator('body').textContent() ?? '';
  for (const expected of [
    '165 minutes in.',
    '45 minutes billable.',
    'CAD $75 detention draft',
    'D-01 / REJECTED',
    '40 min on-duty',
    'D-02 / SEPARATE ASSIGNMENT',
    '138.9 km',
    '13h',
    '14h',
    '16h',
    replayHash,
    'without naming a currency',
    'Modeled range · planning scenario only',
  ]) assert.ok(body.includes(expected), `Missing expected evidence: ${expected}`);

  const costInput = page.getByRole('spinbutton', {name: /EDITABLE VARIABLE COST/i});
  await costInput.fill('2.00');
  await page.getByText('$277.80', {exact: false}).waitFor();
  await page.getByText('$722.20–$6,722.20', {exact: false}).waitFor();
  await costInput.fill('1.25');
  await page.getByText('$173.63', {exact: false}).waitFor();

  await page.screenshot({path: `${output}/${label}-desktop.png`, fullPage: true});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  await page.setViewportSize({width: 390, height: 960});
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({path: `${output}/${label}-narrow.png`, fullPage: true});

  await page.getByRole('button', {name: 'Use diagram'}).click();
  await page.getByRole('img', {name: /Schematic facility diagram/}).waitFor();
  await page.screenshot({path: `${output}/${label}-diagram.png`, fullPage: false});

  await context.setOffline(true);
  await page.getByRole('button', {name: /Arrival 08:30 ET/}).click();
  await page.getByRole('heading', {name: 'First retained yard observation', exact: true}).waitFor();
  await page.getByRole('button', {name: /Recovery consequence 11:20 ET/}).click();
  await page.getByRole('heading', {name: 'The next assignment changes', exact: true}).waitFor();
  await context.setOffline(false);

  const apiRequests = requests.filter((request) => request.url.includes('/api/'));
  assert.deepEqual(apiRequests, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);

  const proof = {
    verifiedAt: new Date().toISOString(),
    webBase,
    url: `${webBase}/?view=dock-evidence`,
    label,
    fixture: {
      load: 'RS-1042',
      facility: 'london-local-yard',
      arrival: '2026-09-13T12:30:00Z',
      exit: '2026-09-13T15:15:09Z',
      observedDwellMinutes: 165,
      freeMinutes: 120,
      billableMinutes: 45,
      draftCad: 75,
      replaySha256: replayHash,
    },
    valueScenario: {
      organizerBriefRange: '$1,000–$7,000; currency unspecified',
      modeledCurrency: 'CAD',
      defaultVariableCostCadPerKm: 1.25,
      addedDeadheadKm: 138.9,
      defaultAddedDeadheadCostCad: 173.63,
      exclusions: ['labor and equipment cost', 'margin', 'recovery win probability', 'collection', 'uncollected detention draft'],
    },
    requests: {total: requests.length, operationalApi: apiRequests.length},
    writes,
    errors,
    checks: [
      'Public synthetic receipt opens without identity inputs',
      'Five dock-to-recovery milestones render and remain interactive offline after load',
      'Observed 165-minute dwell, 120-minute allowance, 45 billable minutes and CAD $75 draft remain distinct from approval',
      'D-01 rejection exposes 40 on-duty minutes and D-02 as a separate recovery assignment',
      'Supported 13h, 14h and 16h planning gates are shown without an ELD certification claim',
      'Editable deadhead-cost scenario recalculates and discloses source currency ambiguity and material exclusions',
      '3D scene has an operator-selectable diagram fallback',
      'Desktop and 390px views render without horizontal overflow',
      'No operational API request or write occurs',
    ],
    limits: 'Read-only retained synthetic fixture. Observations are not certified geofence crossing times. No operational carrier data, live traffic, live telematics, billing authority, ELD certification, surveyed facility geometry or measured commercial value.',
  };
  await writeFile(`${output}/${label}-verification.json`, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify({
    label,
    url: proof.url,
    milestones: 5,
    apiRequests: apiRequests.length,
    writes: writes.length,
    errors: errors.length,
  }));
} finally {
  await browser.close();
}
