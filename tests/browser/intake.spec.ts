import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const syntheticNameplate = (byte: number) => ({
  name: `synthetic-nameplate-${byte}.png`,
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
});

test("warehouse uploads, classifies, and adds three machines in one Intake action", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner.browser@example.test");
  await page.getByLabel("Password").fill("owner-browser-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  const loadName = `Browser Intake ${randomUUID()}`;
  const expectedArrivalAt = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const createdLoad = await page.request.post("/api/inventory/loads", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      displayName: loadName,
      sourceName: "Warehouse-hidden source",
      sourceReference: "Warehouse-hidden reference",
      expectedArrivalAt,
    },
  });
  expect(createdLoad.status()).toBe(201);
  const loadId = ((await createdLoad.json()) as { load: { id: string } }).load
    .id;
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill("warehouse.browser@example.test");
  await page.getByLabel("Password").fill("warehouse-browser-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();

  await page.goto("/loads");
  await expect(
    page.getByRole("heading", { name: "Expected Loads" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("Warehouse-hidden source")).toHaveCount(0);
  await expect(page.getByText("Warehouse-hidden reference")).toHaveCount(0);
  const expectedLoad = page
    .locator("article.inventory-row")
    .filter({ hasText: loadName });
  await expect(expectedLoad).toHaveCount(1);
  await expect(expectedLoad.getByText("Expected today")).toBeVisible();
  const loadHref = `/loads/${loadId}`;
  await expect(
    expectedLoad.getByRole("link", { name: "View Load" }),
  ).toHaveAttribute("href", loadHref);
  await expectedLoad.getByRole("link", { name: "View Load" }).click();
  await page.getByRole("button", { name: "Start Laundrorama intake" }).click();
  await expect(
    page.getByRole("heading", { name: "Machine intake queue" }),
  ).toBeVisible();

  const chooser = page.getByLabel("Choose nameplates");
  await expect(chooser).toBeEnabled();
  await expect(page.getByLabel("Destination location")).toHaveCount(0);
  await expect(page.getByLabel("Capture next nameplate")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Washer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dryer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Other" })).toHaveCount(0);
  await expect(
    page.getByText("Inventory warnings", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /serial match/i })).toHaveCount(
    0,
  );

  await chooser.setInputFiles([
    syntheticNameplate(49),
    syntheticNameplate(50),
    syntheticNameplate(51),
  ]);
  await expect(
    page.getByRole("button", { name: "Upload nameplates" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Staged nameplates")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add Machines to Inventory" }),
  ).toBeDisabled();

  const firstCard = page.locator("article.intake-machine-card").first();
  await expect(firstCard).toBeVisible();
  const cards = page.locator("article.intake-machine-card");
  await expect(cards.nth(1)).toBeVisible();
  await expect(cards).toHaveCount(3);
  await expect(cards.getByRole("status")).toHaveCount(0);
  await expect(page.getByText("Ready for review", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Added to Inventory", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add this Machine to Inventory" }),
  ).toHaveCount(0);

  for (const card of [cards.nth(0), cards.nth(1), cards.nth(2)]) {
    await expect(
      card.getByRole("combobox", { name: "Equipment type" }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      card.getByRole("combobox", { name: "Equipment type" }),
    ).toHaveValue("");
  }

  for (const card of [cards.nth(0), cards.nth(1), cards.nth(2)]) {
    const field = (label: string) =>
      card
        .locator("dl > div")
        .filter({ hasText: new RegExp(`^${label}`) })
        .getByRole("definition");
    await expect(field("Manufacturer")).toHaveText("FAKE");
    await expect(field("Model")).toHaveText(/^FAKE-MODEL-/);
    await expect(field("Serial")).toHaveText(/^FAKE-[0-9a-f]+$/);
    await expect(field("Voltage")).toHaveText("120V");
    await expect(field("Phase")).toHaveText("single_phase");
    await expect(field("Fuel")).toHaveText("electric");
    await expect(card.getByText("Verified specifications")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      card.getByRole("link", { name: /official specifications/ }),
    ).toBeVisible();
    await expect(card.getByRole("button", { name: /approve/i })).toHaveCount(0);
    await expect(card.getByRole("textbox")).toHaveCount(0);
    await expect(card.locator("img.intake-photo-preview")).toBeVisible();
    const cardBox = await card.boundingBox();
    const previewBox = await card
      .locator("img.intake-photo-preview")
      .boundingBox();
    expect(cardBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    expect(previewBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
    expect(previewBox!.x + previewBox!.width).toBeLessThanOrEqual(
      cardBox!.x + cardBox!.width + 1,
    );
  }

  for (const [index, capacity] of [40, 50].entries()) {
    const capacitySelect = cards
      .nth(index)
      .getByLabel("Confirm capacity in pounds");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/capacity") &&
          response.request().method() === "PATCH" &&
          response.ok(),
      ),
      capacitySelect.selectOption(String(capacity)),
    ]);
    const capacityDefinition = cards
      .nth(index)
      .locator("dl > div")
      .filter({ hasText: /^Capacity/ })
      .getByRole("definition");
    await expect(capacityDefinition).toHaveText(`${capacity} lb`);
  }
  await expect(
    cards.nth(2).getByLabel("Confirm capacity in pounds"),
  ).toHaveValue("");

  for (const [index, machineType] of ["washer", "dryer", "other"].entries()) {
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/type") &&
          response.request().method() === "PATCH" &&
          response.ok(),
      ),
      cards
        .nth(index)
        .getByRole("combobox", { name: "Equipment type" })
        .selectOption(machineType),
    ]);
  }
  const finalAction = page.getByRole("button", {
    name: "Add Machines to Inventory",
  });
  await expect(finalAction).toBeEnabled();
  page.once("dialog", (dialog) => void dialog.accept());
  await finalAction.click();
  await expect(
    page.locator("p").filter({ hasText: /Status:\s*committed/ }),
  ).toBeVisible({
    timeout: 10_000,
  });
  const committedMachineHrefs = await page
    .locator('a[href^="/machines/"]')
    .evaluateAll((links) =>
      links
        .map((link) => (link as HTMLAnchorElement).getAttribute("href"))
        .filter((href): href is string => Boolean(href)),
    );
  expect(committedMachineHrefs).toHaveLength(3);
  await expect(page.locator('a[href^="/machines/"]')).toHaveCount(3);
  const committedMachine = await page.request.get(
    `/api/inventory${committedMachineHrefs[0]}`,
  );
  expect(committedMachine.status()).toBe(200);
  const committedDetail = (await committedMachine.json()) as {
    machine: Record<string, unknown>;
    locationHistory?: unknown;
  };
  expect(committedDetail.machine).not.toHaveProperty("currentLocationId");
  expect(committedDetail).not.toHaveProperty("locationHistory");
  await expect(finalAction).toBeDisabled();

  await page.goto("/loads");
  await expect(
    page.getByRole("heading", { name: "Expected Loads" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".expected-load-groups article.inventory-row")
      .filter({ hasText: loadName }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Intake History" }),
  ).toBeVisible();
  await page.getByLabel("Load name").fill(loadName);
  const historyLoad = page
    .locator("article.inventory-row")
    .filter({ hasText: loadName });
  await expect(historyLoad).toHaveCount(1);
  await expect(historyLoad).toContainText("Received:");
  await expect(historyLoad).not.toContainText("Warehouse-hidden source");
  await expect(historyLoad).not.toContainText("Warehouse-hidden reference");
  await historyLoad.getByRole("link", { name: "View Load" }).click();
  await expect(
    page.getByRole("heading", { name: "Intake history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Laundrorama intake" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View Intake" })).toBeVisible();

  const popupPromise = page.context().waitForEvent("page");
  const pdfResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/qr-label-sheet") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Print all QR labels \(3\)/ }).click();
  const [popup, pdfResponse] = await Promise.all([
    popupPromise,
    pdfResponsePromise,
  ]);
  const pdfFrame = popup.locator(
    'iframe[title="Laundrorama QR label sheet PDF"]',
  );
  await expect(pdfFrame).toBeVisible();
  await expect(pdfFrame).toHaveAttribute("src", /^blob:/);
  expect(pdfResponse.ok()).toBe(true);
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");

  await page.getByRole("link", { name: "View Intake" }).click();
  await expect(
    page.locator("p").filter({ hasText: /Status:\s*committed/ }),
  ).toBeVisible();
  const reprintPopupPromise = page.context().waitForEvent("page");
  const reprintResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/qr-label-sheet") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Print all QR labels \(3\)/ }).click();
  const [reprintPopup, reprintResponse] = await Promise.all([
    reprintPopupPromise,
    reprintResponsePromise,
  ]);
  await expect(
    reprintPopup.locator('iframe[title="Laundrorama QR label sheet PDF"]'),
  ).toBeVisible();
  expect(reprintResponse.ok()).toBe(true);
  expect(reprintResponse.headers()["content-type"]).toContain(
    "application/pdf",
  );

  await page.getByRole("link", { name: "View Inventory" }).click();
  await expect(page).toHaveURL(/\/machines$/);
  await expect(
    page.getByRole("heading", { name: "Machines", exact: true }),
  ).toBeVisible();
  for (const href of committedMachineHrefs) {
    await expect(
      page.locator(`a.machines-results-row[href="${href}"]`),
    ).toHaveCount(1);
  }
  await page.goto(committedMachineHrefs[0]!);
  await page.getByText("Technical catalog provenance", { exact: true }).click();
  await expect(
    page.getByText("Automatically published under the official-source policy."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/browser-test-pricing-v1/)).toBeVisible();
  const widthRow = page.getByRole("row", { name: /Width/ });
  await expect(widthRow).toContainText("30 in");
  await expect(widthRow).toContainText("Pinned catalog");
});
