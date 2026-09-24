import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  AcquisitionLoadListResponseSchema,
  MachineDetailResponseSchema,
  MachineResponseSchema,
} from "@simply-clean/contracts";

test("warehouse inspects a pinned Catalog revision and records actual measurements", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("warehouse.browser@example.test");
  await page.getByLabel("Password").fill("warehouse-browser-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();

  const loadsResponse = await page.request.get("/api/inventory/loads");
  expect(loadsResponse.ok()).toBe(true);
  const { loads } = AcquisitionLoadListResponseSchema.parse(
    await loadsResponse.json(),
  );
  const load = loads.find(
    (candidate) => candidate.sourceReference === "E2E-LOAD-001",
  );
  expect(load).toBeDefined();
  const response = await page.request.post("/api/inventory/machines", {
    headers: {
      "idempotency-key": randomUUID(),
      origin: "http://localhost:3100",
    },
    data: {
      machineType: "washer",
      manufacturer: "Dexter",
      model: "WCVD18KCS-12",
      serial: `CATALOG-BROWSER-${randomUUID()}`,
      sourceLoadId: load!.id,
    },
  });
  expect(response.ok()).toBe(true);
  const { machine } = MachineResponseSchema.parse(await response.json());
  const detailPath = `/api/inventory/machines/${machine.id}`;
  await expect
    .poll(
      async () => {
        const detailResponse = await page.request.get(detailPath);
        expect(detailResponse.ok()).toBe(true);
        return MachineDetailResponseSchema.parse(await detailResponse.json())
          .catalog?.revision?.revisionId;
      },
      { timeout: 15_000 },
    )
    .toBe("dexter-wcvd18kcs-12-r1");

  await page.goto(`/machines/${machine.id}`);
  await expect(
    page.getByText("Pinned revision 1 · dexter-wcvd18kcs-12-r1", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Manufacture year: Unknown", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "T-600 WCVD Coin Washer Parts — No Stop Button",
      exact: true,
    }),
  ).toHaveAttribute(
    "href",
    "https://www.dexter.com/upl/downloads/products/vended/documents/t-600-wcvd-coin-washer-parts-no-stop-button.pdf",
  );
  await expect(page.getByText(/Model: Model applicability list/)).toBeVisible();
  const widthRow = page.getByRole("row", { name: /^Width / });

  await page
    .getByRole("spinbutton", { name: "Actual width (in)", exact: true })
    .fill("31.5");
  await page
    .getByRole("button", { name: "Save actual measurements", exact: true })
    .click();
  await expect(
    page.getByText("Actual measurements saved.", { exact: true }),
  ).toBeVisible();
  await expect(
    widthRow.getByRole("cell", { name: "31.5 in", exact: true }),
  ).toHaveCount(2);
  await expect(
    widthRow.getByRole("cell", { name: "Actual measurement", exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("spinbutton", { name: "Actual width (in)", exact: true }),
  ).toHaveValue("31.5");
  const savedResponse = await page.request.get(detailPath);
  expect(savedResponse.ok()).toBe(true);
  const saved = MachineDetailResponseSchema.parse(await savedResponse.json());
  expect(saved.catalog?.effectiveSpecs.widthIn).toEqual({
    value: 31.5,
    source: "actual",
  });
  expect(saved.catalog?.revision?.revisionId).toBe("dexter-wcvd18kcs-12-r1");
});

test("warehouse browses Catalog from navigation to sourced model detail", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("warehouse.browser@example.test");
  await page.getByLabel("Password").fill("warehouse-browser-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();

  const catalogLink = page.getByRole("link", { name: "Catalog", exact: true });
  if (!(await catalogLink.isVisible())) {
    await page
      .locator(".navigation-region--mobile .navigation-menu-button")
      .click();
  }
  await catalogLink.click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(
    page.getByRole("heading", { name: "Catalog", exact: true }),
  ).toBeVisible();

  await page.getByLabel("Search model or family").fill("WCVD18KCS-12");
  await page.getByLabel("Manufacturer").fill("Dexter");
  await page.getByRole("button", { name: "Search Catalog" }).click();
  await expect(page).toHaveURL(
    /\/catalog\?query=WCVD18KCS-12&manufacturer=Dexter/,
  );
  await expect(page.getByText("WCVD18KCS-12", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View model" }).click();

  await expect(page).toHaveURL(/\/catalog\/dexter-wcvd18kcs-12-r1$/);
  await expect(
    page.getByRole("heading", { name: "WCVD18KCS-12", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Official sources", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "T-600 WCVD Coin Washer Parts — No Stop Button",
      exact: true,
    }),
  ).toHaveAttribute(
    "href",
    "https://www.dexter.com/upl/downloads/products/vended/documents/t-600-wcvd-coin-washer-parts-no-stop-button.pdf",
  );
  await expect(
    page.getByText("Model applicability list", { exact: true }),
  ).toHaveCount(2);
});
