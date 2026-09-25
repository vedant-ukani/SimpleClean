import { expect, test } from "@playwright/test";

test("manifest and service worker expose only a public static cache", async ({
  page,
}) => {
  await page.goto("/login");

  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const manifestResponse = await page.request.get(
    manifestHref ?? "/manifest.webmanifest",
  );
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    start_url?: string;
    display?: string;
    theme_color?: string;
    icons?: unknown[];
  };
  expect(manifest).toMatchObject({ start_url: "/", display: "standalone" });
  expect(manifest.theme_color).toBeTruthy();
  expect(manifest.icons?.length ?? 0).toBeGreaterThan(0);

  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator))
      throw new Error("Service workers unavailable");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller !== null),
  ).toBe(true);

  await page.getByLabel("Email").fill("warehouse.browser@example.test");
  await page.getByLabel("Password").fill("warehouse-browser-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  await page.goto("/loads");
  await expect(
    page.getByText("Browser Test Expected Load", { exact: true }),
  ).toBeVisible();
  await page.goto("/machines?query=BROWSER-SERIAL-001");
  await page
    .getByRole("link", {
      name: /Open Machine details for .*serial BROWSER-SERIAL-001/,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Attachments" }),
  ).toBeVisible();
  const machineId = new URL(page.url()).pathname.split("/").at(-1);
  expect(machineId).toBeTruthy();
  const apiStatuses = await page.evaluate(async (id) => {
    const responses = await Promise.all([
      fetch("/api/identity/me", { cache: "no-store" }),
      fetch("/api/inventory/loads", { cache: "no-store" }),
      fetch(`/api/inventory/machines/${id}`, { cache: "no-store" }),
      fetch(`/api/files?machineId=${id}`, { cache: "no-store" }),
    ]);
    return responses.map((response) => response.status);
  }, machineId);
  expect(apiStatuses).toEqual([200, 200, 200, 200]);

  const cachedUrls = await page.evaluate(async () => {
    const result: string[] = [];
    for (const cacheName of await caches.keys()) {
      for (const request of await (await caches.open(cacheName)).keys()) {
        result.push(request.url);
      }
    }
    return result;
  });
  expect(cachedUrls.length).toBeGreaterThan(0);
  for (const cachedUrl of cachedUrls) {
    const path = new URL(cachedUrl).pathname;
    expect(path).not.toMatch(/^\/api(?:\/|$)/);
    expect(path).not.toMatch(
      /^\/(?:admin|loads|machines|locations|scan)(?:\/|$)/,
    );
    expect(path).not.toMatch(/(?:files|imports|reports|qr)/i);
  }

  await page.context().setOffline(true);
  await page.goto("/machines");
  await expect(
    page.getByRole("heading", { name: "You are offline" }),
  ).toBeVisible();
  await expect(
    page.getByText("Operational data is not stored", { exact: false }),
  ).toBeVisible();
});
