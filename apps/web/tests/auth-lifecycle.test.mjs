import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

// Opt-in only: credentials remain in the operator-provided private file.
// These checks change Firebase browser sessions, never operational records.
const url = process.env.ROADSTAR_AUTH_TEST_URL;
const usersFile = process.env.ROADSTAR_AUTH_TEST_USERS;
const enabled = Boolean(url && usersFile);
async function fixture() {
  const users = JSON.parse(await readFile(usersFile, "utf8"));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : {}),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  async function login(role) {
    const user = users.find((candidate) => candidate.role === role);
    assert.ok(user, `A ${role} fixture identity is required.`);
    const page = await context.newPage();
    await page.goto(url);
    try {
      await page
        .getByLabel("Carrier ID", { exact: true })
        .fill(process.env.ROADSTAR_AUTH_TEST_CARRIER || "demo-carrier");
      await page.getByLabel("Email", { exact: true }).fill(user.email);
      await page.getByLabel("Password", { exact: true }).fill(user.password);
      await page.getByRole("button", { name: "Open operations →" }).click();
      await page
        .getByRole("heading", {
          name: role === "dispatcher" ? "Load planning board" : "Your manifest",
        })
        .waitFor();
    } catch {
      throw new Error(
        `Unable to establish the ${role} fixture session; credential details withheld.`,
      );
    }
    return page;
  }
  return { browser, login };
}

for (const action of ["sign-out", "identity-change"]) {
  test(
    `Firebase ${action} clears the previous actor in another tab`,
    { skip: !enabled, timeout: 60000 },
    async () => {
      const { browser, login } = await fixture();
      try {
        const original = await login("dispatcher");
        if (action === "sign-out") {
          const other = await login("dispatcher");
          await other
            .getByRole("button", { name: "Sign out", exact: true })
            .click();
        } else {
          await login("driver");
        }
        await original.bringToFront();
        await original
          .getByRole("heading", { name: "Sign in to Rhode" })
          .waitFor({ timeout: 10000 });
        assert.equal(
          await original
            .getByRole("heading", { name: "Load planning board" })
            .count(),
          0,
        );
        assert.equal(
          await original
            .getByRole("button", { name: "Evidence & billing", exact: false })
            .count(),
          0,
        );
        assert.equal(await original.getByRole("dialog").count(), 0);
      } finally {
        await browser.close();
      }
    },
  );
}
