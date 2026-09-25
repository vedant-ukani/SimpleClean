import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
}

test("Owner review of a bearing concern retains inspection history and separate states", async ({
  page,
}, testInfo) => {
  const serial = `PRODUCTION-${testInfo.project.name}`;
  await signIn(
    page,
    "owner.browser@example.test",
    "owner-browser-password",
  );
  await page.goto(`/machines?query=${encodeURIComponent(serial)}`);
  const machineRow = page.getByRole("link", {
    name: new RegExp(`Open Machine details for .*serial ${serial}`),
  });
  await expect(machineRow).toBeVisible();
  await machineRow.click();
  await expect(
    page.getByRole("heading", { name: "Preliminary inspection" }),
  ).toBeVisible();
  const machineUrl = page.url();
  const panel = page.locator(".preliminary-inspection");
  await panel.getByRole("link", { name: "Open initial check" }).click();
  await expect(page.getByRole("heading", { name: "Check the bearing" })).toBeVisible();
  await page.getByRole("button", { name: /Bearing noise or movement detected/ }).click();
  await page.goto(machineUrl);
  await expect(
    panel.getByText(/Current disposition: Owner review/),
  ).toBeVisible();
  await expect(page.getByText("On hand", { exact: true })).toBeVisible();
  await expect(page.getByText("Blocked", { exact: true })).toBeVisible();
  await panel.getByText("Inspection and decision history").click();
  await expect(panel.getByText(/Bearing noise or movement detected during drum check/)).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Record Owner decision" }),
  ).toBeVisible();
  await panel.getByLabel("Final disposition").selectOption("parts_only");
  await panel.getByLabel("Decision reason").fill("Approved for donor parts");
  await panel.getByRole("button", { name: "Record Owner decision" }).click();
  await expect(
    panel.getByText(/Current disposition: Parts only/),
  ).toBeVisible();
  await expect(page.getByText("Scrapped", { exact: true })).toBeVisible();
  await expect(page.getByText("Blocked", { exact: true })).toBeVisible();
  await page.reload();
  await panel.getByText("Inspection and decision history").click();
  await expect(panel.getByText("Approved for donor parts")).toBeVisible();
  await expect(panel.getByText(/Bearing concern requires Owner review/).first()).toBeVisible();
  await expect(
    panel.getByText(/Current disposition: Parts only/),
  ).toBeVisible();
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()
  ).violations.filter(
    (item) => item.impact === "serious" || item.impact === "critical",
  );
  expect(violations).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
