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

test("Warehouse inspection and Owner parts disposition retain private evidence and separate states", async ({
  page,
}, testInfo) => {
  const serial = `PRODUCTION-${testInfo.project.name}`;
  await signIn(
    page,
    "warehouse.browser@example.test",
    "warehouse-browser-password",
  );
  await page.goto(`/machines?query=${encodeURIComponent(serial)}`);
  await expect(
    page.getByText(`Serial: ${serial}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View Machine" }).click();
  await expect(
    page.getByRole("heading", { name: "Preliminary inspection" }),
  ).toBeVisible();
  const machineUrl = page.url();
  const panel = page.locator(".preliminary-inspection");
  await page.getByLabel("Purpose").selectOption("preliminary_inspection");
  await page.getByLabel("Private file").setInputFiles({
    name: "bearing.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await page.getByRole("button", { name: "Upload attachment" }).click();
  await expect(
    panel.getByRole("checkbox", { name: "bearing.jpg" }),
  ).toBeVisible();
  await panel.getByLabel("Condition observed").fill("Drum turns by hand");
  await panel.getByLabel("Bearing assessment").selectOption("concern_observed");
  await panel.getByLabel("Bearing notes").fill("Audible bearing noise");
  await panel.getByLabel("Missing parts").fill("Coin box key");
  await panel.getByLabel("Damage").fill("Dented side");
  await panel
    .getByLabel("Recommendation", { exact: true })
    .selectOption("parts_only");
  await panel
    .getByLabel("Reason for recommendation")
    .fill("Owner economic review needed");
  await panel.getByRole("checkbox", { name: "bearing.jpg" }).check();
  await panel.getByRole("button", { name: "Record inspection" }).click();
  await expect(
    panel.getByText(/Current disposition: Owner review/),
  ).toBeVisible();
  await expect(page.getByText("On hand", { exact: true })).toBeVisible();
  await expect(page.getByText("Blocked", { exact: true })).toBeVisible();
  await expect(panel.getByText("Drum turns by hand")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "bearing.jpg" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Record Owner decision" }),
  ).toHaveCount(0);

  const menu = page.getByRole("button", { name: "Menu" });
  if (
    (await menu.isVisible()) &&
    !(await page
      .getByRole("button", { name: "Switch user / sign out" })
      .isVisible())
  )
    await menu.click();
  await page.getByRole("button", { name: "Switch user / sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Staff sign in" }),
  ).toBeVisible();
  await signIn(page, "owner.browser@example.test", "owner-browser-password");
  await page.goto(machineUrl);
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
  await expect(panel.getByText("Approved for donor parts")).toBeVisible();
  await expect(
    panel.getByText("Owner economic review needed").first(),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "bearing.jpg" }),
  ).toBeVisible();
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
