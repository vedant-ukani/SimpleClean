import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
}
async function signOut(page: Page) {
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
}
async function fallback(page: Page, serial: string) {
  await page.goto(`/machines?query=${encodeURIComponent(serial)}`);
  await page
    .getByRole("link", {
      name: new RegExp(`Open Machine details for .*serial ${serial}`),
    })
    .click();
  return (
    (
      await page.locator(".qr-label-current .fallback-code").textContent()
    )?.trim() ?? ""
  );
}
async function checkPage(page: Page) {
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    ),
  ).toEqual([]);
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
}

test("Owner specialties and QR-started Washer/Dryer tests produce separate clean and repair handoffs", async ({
  page,
}, testInfo) => {
  const washerSerial = `INITIAL-WASHER-${testInfo.project.name}`;
  const secondWasherSerial = `TEST-WASHER-${testInfo.project.name}`;
  const dryerSerial = `TEST-DRYER-${testInfo.project.name}`;
  const exceptionSerial = `INITIAL-EXCEPTION-${testInfo.project.name}`;
  await signIn(page, "owner.browser@example.test", "owner-browser-password");
  await expect(
    page
      .getByRole("region", { name: "Start work" })
      .getByRole("link", { name: /^Production Work/ }),
  ).toBeVisible();
  await page.goto("/work");
  await expect(
    page.getByRole("heading", { name: "Production Work" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Initial checks" }),
  ).toHaveCount(0);
  await page.goto("/admin/users");
  const washerSpecialty = page.getByRole("combobox", {
    name: "Production assignment for Browser Washer Tech",
  });
  if ((await washerSpecialty.inputValue()) !== "washer") {
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().includes("/production/specialties/") &&
        response.status() === 200,
    );
    await washerSpecialty.selectOption("washer");
    await saved;
    await expect(
      page.getByText("Production assignment updated."),
    ).toBeVisible();
  }
  await expect(washerSpecialty).toHaveValue("washer");
  const dryerSpecialty = page.getByRole("combobox", {
    name: "Production assignment for Browser Dryer Tech",
  });
  if ((await dryerSpecialty.inputValue()) !== "dryer") {
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().includes("/production/specialties/") &&
        response.status() === 200,
    );
    await dryerSpecialty.selectOption("dryer");
    await saved;
    await expect(
      page.getByText("Production assignment updated."),
    ).toBeVisible();
  }
  await expect(dryerSpecialty).toHaveValue("dryer");
  const washerCode = await fallback(page, washerSerial);
  const dryerCode = await fallback(page, dryerSerial);
  const exceptionCode = await fallback(page, exceptionSerial);
  expect(washerCode).toHaveLength(16);
  expect(dryerCode).toHaveLength(16);
  expect(exceptionCode).toHaveLength(16);
  await signOut(page);

  await signIn(page, "washer.browser@example.test", "washer-browser-password");
  await expect(
    page
      .getByRole("region", { name: "Start work" })
      .getByRole("link", { name: /^My Work/ }),
  ).toBeVisible();
  await page.goto("/work");
  await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Initial checks" })
      .getByText(washerSerial),
  ).toBeVisible();
  await page.goto("/scan");
  await page.getByLabel("Enter fallback code").fill(washerCode);
  await page.getByRole("button", { name: "Look up Machine" }).click();
  await expect(page).toHaveURL(/\/work\/initial-check\/[0-9a-f-]+$/);
  await expect(page.getByText(washerSerial)).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page
    .getByRole("button", { name: /Smooth — no bearing concern/ })
    .click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("button", { name: "Start Session" }),
  ).toBeVisible();
  await checkPage(page);
  const workUrl = page.url();
  await page.goto("/work");
  await expect(
    page
      .getByRole("region", { name: "Available Tests" })
      .getByText(secondWasherSerial),
  ).toBeVisible();
  await page
    .locator(".work-card")
    .filter({ hasText: washerSerial })
    .getByRole("checkbox", { name: "Add to group" })
    .check();
  await page
    .locator(".work-card")
    .filter({ hasText: secondWasherSerial })
    .getByRole("checkbox", { name: "Add to group" })
    .check();
  await page
    .getByRole("button", { name: "Start Session with 2 Machines" })
    .click();
  await expect(page).toHaveURL(/\/work\/session\/[0-9a-f-]+$/);
  const sessionUrl = page.url();
  const firstCard = page
    .locator(".session-machine")
    .filter({ hasText: washerSerial });
  const secondCard = page
    .locator(".session-machine")
    .filter({ hasText: secondWasherSerial });
  await firstCard.getByRole("button", { name: "Running cycle" }).click();
  await secondCard.getByRole("button", { name: "Waiting" }).click();
  await page.reload();
  await expect(
    firstCard.getByRole("button", { name: "Running cycle" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    secondCard.getByRole("button", { name: "Waiting" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/scan");
  await page.getByLabel("Enter fallback code").fill(washerCode);
  await page.getByRole("button", { name: "Look up Machine" }).click();
  await expect(page).toHaveURL(
    /\/work\/session\/[0-9a-f-]+\?machine=[0-9a-f-]+$/,
  );
  await expect(
    page
      .locator(".session-machine--highlight")
      .filter({ hasText: washerSerial }),
  ).toBeVisible();
  await page
    .locator(".session-machine")
    .filter({ hasText: washerSerial })
    .getByRole("link", { name: "Open individual Test" })
    .click();
  await expect(page.getByText("Step 1 of 14")).toBeVisible();
  await page.getByRole("button", { name: "Pass" }).click();
  await expect(page.getByText("Step 2 of 14")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Step 2 of 14")).toBeVisible();
  for (let step = 2; step <= 14; step += 1) {
    await page
      .getByRole("button", { name: step === 13 ? "N/A" : "Pass" })
      .click();
    if (step < 14)
      await expect(page.getByText(`Step ${step + 1} of 14`)).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Finish Test" }),
  ).toBeDisabled();
  await page.getByLabel("Private Machine video").setInputFiles({
    name: "operation.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from([
      0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0,
    ]),
  });
  await page.getByRole("button", { name: "Finish Test" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready for cleaning" }),
  ).toBeVisible();
  await expect(page.getByText("awaiting clean", { exact: true })).toBeVisible();
  await checkPage(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ready for cleaning" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open private test video" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View Machine record" }).click();
  await expect(page.getByText("operation.mp4")).toBeVisible();
  await page.goto(sessionUrl);
  await expect(
    page
      .locator(".session-machine")
      .filter({ hasText: washerSerial })
      .getByText("completed", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finish Session" }).click();
  await expect(
    page.getByRole("heading", { name: "Completed Session" }),
  ).toBeVisible();
  await expect(page.getByText(/Allocated time:/)).toHaveCount(2);
  await signOut(page);

  await signIn(page, "dryer.browser@example.test", "dryer-browser-password");
  await page.goto("/scan");
  await page.getByLabel("Enter fallback code").fill(dryerCode);
  await page.getByRole("button", { name: "Look up Machine" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]+$/);
  await expect(page.getByText(dryerSerial)).toBeVisible();
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page).toHaveURL(
    /\/work\/session\/[0-9a-f-]+\?machine=[0-9a-f-]+$/,
  );
  await page.getByRole("link", { name: "Open individual Test" }).click();
  await expect(page.getByText("Step 1 of 15")).toBeVisible();
  await page.getByRole("button", { name: "Fail" }).click();
  for (let step = 2; step <= 15; step += 1) {
    await expect(page.getByText(`Step ${step} of 15`)).toBeVisible();
    await page.getByRole("button", { name: "Pass" }).click();
  }
  await page.getByRole("button", { name: "Finish Test" }).click();
  await expect(
    page.getByRole("heading", { name: "Repair required" }),
  ).toBeVisible();
  await checkPage(page);
  await page.goto(workUrl);
  await expect(
    page.getByRole("heading", { name: "Test Work Order" }),
  ).not.toBeVisible();
  await page.goto("/scan");
  await page.getByLabel("Enter fallback code").fill(exceptionCode);
  await page.getByRole("button", { name: "Look up Machine" }).click();
  await expect(page).toHaveURL(/\/work\/initial-check\/[0-9a-f-]+$/);
  await page
    .getByRole("button", { name: /Bearing noise or movement detected/ })
    .click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(
    page
      .getByRole("region", { name: "Initial checks" })
      .getByText(exceptionSerial),
  ).toHaveCount(0);
  await signOut(page);

  await signIn(
    page,
    "technician.browser@example.test",
    "technician-browser-password",
  );
  await page.goto("/work");
  await expect(
    page.getByText("Cleaner / no testing assignment.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Initial checks" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Start Session/ })).toHaveCount(
    0,
  );
  await page.goto("/scan");
  await page.getByLabel("Enter fallback code").fill(dryerCode);
  await page.getByRole("button", { name: "Look up Machine" }).click();
  await expect(
    page.getByRole("link", { name: "Open Machine details" }),
  ).toBeVisible();
});
