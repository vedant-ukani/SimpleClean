import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

const accounts = {
  owner: {
    name: "Browser Owner",
    email: "owner.browser@example.test",
    password: "owner-browser-password",
  },
  warehouse: {
    name: "Browser Warehouse",
    email: "warehouse.browser@example.test",
    password: "warehouse-browser-password",
  },
  technician: {
    name: "Browser Technician",
    email: "technician.browser@example.test",
    password: "technician-browser-password",
  },
} as const;

async function signIn(
  page: Page,
  account: (typeof accounts)[keyof typeof accounts],
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) {
    await menu.click();
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.right > innerWidth + 1 ||
          box.left < -1 ||
          element.scrollWidth > element.clientWidth + 1
        );
      })
      .slice(0, 5)
      .map((element) => ({
        clientWidth: element.clientWidth,
        className: element.className,
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        scrollWidth: element.scrollWidth,
        tag: element.tagName,
        text: element.textContent?.trim().slice(0, 80),
      })),
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(
    metrics.clientWidth,
  );
}

async function expectViewportSizedSidebar(page: Page) {
  if ((await page.evaluate(() => window.innerWidth)) <= 900) {
    return;
  }

  const sidebar = page.locator(".app-sidebar");
  await expect(sidebar).toBeVisible();
  const metrics = await sidebar.evaluate((element) => {
    const { height, width } = element.getBoundingClientRect();
    return { height, viewportHeight: window.innerHeight, width };
  });
  expect(metrics.width).toBe(256);
  expect(metrics.height).toBe(metrics.viewportHeight);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations
    .filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    )
    .map((violation) => ({
      help: violation.help,
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    }));
  expect(blocking).toEqual([]);
}

test("warehouse follows the real load, machine, file, and scan boundaries", async ({
  page,
}) => {
  await signIn(page, accounts.warehouse);
  await expectViewportSizedSidebar(page);
  await expectNoSeriousAccessibilityViolations(page);

  const warehouseDashboard = page.getByRole("region", { name: "Start work" });
  for (const card of ["Expected Loads", "Machine Search", "Scan"]) {
    await expect(
      warehouseDashboard.getByRole("link", {
        name: new RegExp(`^${card}`),
      }),
    ).toBeVisible();
  }
  await expect(
    page.getByText("Not enabled yet", { exact: true }),
  ).toBeVisible();

  const primary = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(
    primary.getByRole("link", { name: "Loads", exact: true }),
  ).toBeVisible();
  await expect(
    primary.getByRole("link", { name: "Machines", exact: true }),
  ).toBeVisible();
  await expect(
    primary.getByRole("link", { name: "Scan", exact: true }),
  ).toBeVisible();
  await expect(
    primary.getByRole("link", { name: "Team", exact: true }),
  ).toHaveCount(0);
  await expect(
    primary.getByRole("link", { name: "Imports", exact: true }),
  ).toHaveCount(0);
  for (const removedDestination of [
    "File review",
    "Operations",
    "Imports",
    "Locations",
  ]) {
    await expect(
      primary.getByRole("link", { name: removedDestination, exact: true }),
    ).toHaveCount(0);
  }

  await page.getByRole("link", { name: "Loads", exact: true }).click();
  const loadsMenu = page.getByRole("button", { name: "Menu" });
  if (await loadsMenu.isVisible()) {
    await loadsMenu.click();
  }
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Loads", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Acquisition Loads" }),
  ).toBeVisible();
  await expect(
    page.getByText("Browser Test Expected Load", { exact: true }),
  ).toBeVisible();
  await expectViewportSizedSidebar(page);
  await page
    .locator(".expected-load-groups article.inventory-row")
    .filter({ hasText: "Browser Test Expected Load" })
    .getByRole("link", { name: "View Load" })
    .click();
  await expect(page.getByText("E2E-LOAD-001", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Machines", exact: true }).click();
  await expectViewportSizedSidebar(page);
  await expect(
    page.getByRole("heading", { name: "Create provisional Machine" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create Machine" }),
  ).toHaveCount(0);
  await page.getByLabel("Search Machines").fill("BROWSER-SERIAL-001");
  await expect(
    page.getByPlaceholder("ID, manufacturer, model, serial, or load"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("region", { name: "1 Machine" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 Machine" })).toHaveClass(
    "sr-only",
  );
  const machineRow = page.getByRole("link", {
    name: /Open Machine details for .*serial BROWSER-SERIAL-001/,
  });
  await expect(machineRow).toBeVisible();
  await expect(machineRow).toContainText("BROWSER-SERIAL-001");
  await expect(machineRow).toContainText("SC30");
  await expect(machineRow).not.toContainText("Location");
  await expect(machineRow).toContainText("Washer");
  if ((await page.evaluate(() => window.innerWidth)) > 900) {
    const header = page.locator(".machines-results-header");
    await expect(header).toBeVisible();
    for (const label of [
      "Machine",
      "Serial",
      "Model Number",
      "Type / Capacity",
    ]) {
      await expect(header).toContainText(label);
    }
  }
  await expect(page.getByRole("link", { name: "View Machine" })).toHaveCount(0);
  await expect(
    page.getByText("Identity confirmed", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Identity needs confirmation"),
  ).toHaveCount(0);
  await machineRow.click();
  await expect(
    page.getByText("Identity confirmed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Attachments" }),
  ).toBeVisible();
  await expect(page.getByText("Location", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Relocate Machine" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Location history" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("No attachments yet.", { exact: true }),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  const fallbackCode = (
    await page.locator(".fallback-code").first().textContent()
  )?.trim();
  expect(fallbackCode).toBeTruthy();
  const scanMenu = page.getByRole("button", { name: "Menu" });
  if (await scanMenu.isVisible()) {
    await scanMenu.click();
  }
  await page.getByRole("link", { name: "Scan", exact: true }).click();
  await page.getByLabel("Enter fallback code").fill("INVALID-CODE");
  await page.getByRole("button", { name: "Look up Machine" }).click();
  await expect(
    page.getByText("This label is not valid or is no longer active.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("Enter fallback code").fill(fallbackCode ?? "");
  await page.getByRole("button", { name: "Look up Machine" }).click();
  await expect(page.getByText("Machine found", { exact: true })).toBeVisible();
  await expect(page.getByText("Location", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Open Machine details" }).click();
  await expectNoHorizontalOverflow(page);
});

test("technician can read equipment and files but cannot cross management boundaries", async ({
  page,
}) => {
  await signIn(page, accounts.technician);
  await expectNoSeriousAccessibilityViolations(page);
  const technicianDashboard = page.getByRole("region", { name: "Start work" });
  await expect(
    technicianDashboard.getByRole("link", { name: /^Machine Search/ }),
  ).toBeVisible();
  await expect(
    technicianDashboard.getByRole("link", { name: /^Scan/ }),
  ).toBeVisible();
  await expect(
    technicianDashboard.getByRole("link", { name: /^My Work/ }),
  ).toBeVisible();
  await expect(
    technicianDashboard.getByRole("link", { name: /^Expected Loads/ }),
  ).toHaveCount(0);
  await expect(
    technicianDashboard.getByRole("link", { name: /^Locations/ }),
  ).toHaveCount(0);
  const primary = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(
    primary.getByRole("link", { name: "Machines", exact: true }),
  ).toBeVisible();
  await expect(
    primary.getByRole("link", { name: "Scan", exact: true }),
  ).toBeVisible();
  await expect(
    primary.getByRole("link", { name: "Loads", exact: true }),
  ).toHaveCount(0);
  await expect(
    primary.getByRole("link", { name: "Imports", exact: true }),
  ).toHaveCount(0);
  for (const removedDestination of [
    "File review",
    "Operations",
    "Imports",
    "Locations",
  ]) {
    await expect(
      primary.getByRole("link", { name: removedDestination, exact: true }),
    ).toHaveCount(0);
  }

  const forbidden = await page.request.get("/api/inventory/loads");
  expect(forbidden.status()).toBe(403);
  const removedLocations = await page.request.get("/api/inventory/locations");
  expect(removedLocations.status()).toBe(404);

  await page.goto("/machines?query=BROWSER-SERIAL-001");
  await expect(
    page.getByRole("heading", { name: "Create provisional Machine" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create Machine" }),
  ).toHaveCount(0);
  await page
    .getByRole("link", {
      name: /Open Machine details for .*serial BROWSER-SERIAL-001/,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Attachments" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Record identity evidence" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Relocate Machine" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reissue" })).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page);
  await expectNoHorizontalOverflow(page);
});

test("owner sees the retained staff surface and sign-out removes protected access", async ({
  page,
}) => {
  await signIn(page, accounts.owner);
  await expectNoSeriousAccessibilityViolations(page);
  const ownerDashboard = page.getByRole("region", { name: "Start work" });
  for (const card of ["Loads", "Machines", "Team"]) {
    await expect(
      ownerDashboard.getByRole("link", { name: new RegExp(`^${card}`) }),
    ).toBeVisible();
  }
  await expect(
    page.getByText("Pilot placeholder", { exact: true }),
  ).toHaveCount(0);
  const primary = page.getByRole("navigation", { name: "Primary navigation" });
  for (const destination of ["Team", "Loads", "Machines", "Scan"]) {
    await expect(
      primary.getByRole("link", { name: destination, exact: true }),
    ).toBeVisible();
  }

  for (const removedDestination of [
    "File review",
    "Operations",
    "Imports",
    "Locations",
  ]) {
    await expect(
      primary.getByRole("link", { name: removedDestination, exact: true }),
    ).toHaveCount(0);
  }
  await page.goto("/machines?query=BROWSER-SERIAL-001");
  await expect(
    page.getByRole("heading", { name: "Create provisional Machine" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create Machine" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: /Open Machine details for .*serial BROWSER-SERIAL-001/,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch user / sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Staff sign in" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByText(accounts.owner.name, { exact: true }),
  ).toHaveCount(0);
});

test("retired workspaces have no bookmarked web routes", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The canonical route-state boundary only needs one browser journey.",
  );
  await signIn(page, accounts.owner);
  for (const path of [
    "/admin/files",
    "/admin/operations",
    "/admin/imports",
    "/admin/imports/00000000-0000-4000-8000-000000000000",
    "/locations",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("shell keeps landmarks, keyboard focus, touch targets, and narrow layouts usable", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.warehouse);
  await expect(page.getByRole("banner")).toBeVisible();
  const initialMenu = page.getByRole("button", { name: "Menu" });
  if (await initialMenu.isVisible()) {
    await initialMenu.click();
  }
  const primaryNavigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  if (!(await primaryNavigation.isVisible())) {
    await page.getByRole("button", { name: /menu/i }).click();
  }
  await expect(primaryNavigation).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();

  const loadResponse = await page.request.get("/api/inventory/loads");
  expect(loadResponse.status()).toBe(200);
  const load = (await loadResponse.json()) as { loads: { id: string }[] };
  const loadId = load.loads[0]?.id;
  expect(loadId).toBeTruthy();
  const machineResponse = await page.request.post("/api/inventory/machines", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      machineType: "other",
      sourceLoadId: loadId,
      manufacturer: "Sync Test",
      model: "Before",
      serial: `SHELL-SYNC-${randomUUID()}`,
    },
  });
  expect(machineResponse.status()).toBe(201);
  const syncMachine = (await machineResponse.json()) as {
    machine: { id: string };
  };
  await page.goto(`/machines/${syncMachine.machine.id}`);
  await expect(
    page.getByRole("heading", { name: "Sync Test Before" }),
  ).toBeVisible();

  await page.context().setOffline(true);
  await expect(page.locator(".offline-banner")).toContainText(
    "Private records are not stored on this device",
  );

  const updaterContext = await browser.newContext({
    baseURL: "http://localhost:3100",
  });
  try {
    const updater = await updaterContext.newPage();
    await signIn(updater, accounts.warehouse);
    await updater.goto(`/machines/${syncMachine.machine.id}`);
    await updater.getByLabel("Model", { exact: true }).fill("After");
    await updater
      .getByRole("button", { name: "Save machine identity" })
      .click();
    await expect(
      updater.getByRole("status").filter({ hasText: "Machine identity saved" }),
    ).toBeVisible();
  } finally {
    await updaterContext.close();
  }

  await expect(
    page.getByRole("heading", { name: "Sync Test Before" }),
  ).toBeVisible();
  const reconnectRefresh = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.origin === "http://localhost:3100" && url.searchParams.has("_rsc")
    );
  });
  await page.context().setOffline(false);
  await reconnectRefresh;
  await expect(
    page.getByRole("heading", { name: "Sync Test After" }),
  ).toBeVisible();
  await expect(
    page.getByText("Private records are not stored on this device"),
  ).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "loading-skeleton";
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const result = {
      requested: matchMedia("(prefers-reduced-motion: reduce)").matches,
      durationSeconds: Number.parseFloat(style.animationDuration),
      iterations: style.animationIterationCount,
    };
    probe.remove();
    return result;
  });
  expect(reducedMotion.requested).toBe(true);
  expect(reducedMotion.durationSeconds).toBeLessThanOrEqual(0.000_01);
  expect(reducedMotion.iterations).toBe("1");

  await page.reload();
  await expect(
    page
      .getByText(accounts.warehouse.name, { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();

  await page.setViewportSize({ width: 320, height: 800 });
  await expectNoHorizontalOverflow(page);
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await menu.click();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
  const signOutBox = await page
    .getByRole("button", { name: "Switch user / sign out" })
    .boundingBox();
  expect(signOutBox?.height ?? 0).toBeGreaterThanOrEqual(44);
});
