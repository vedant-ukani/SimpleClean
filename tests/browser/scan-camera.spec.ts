import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("warehouse.browser@example.test");
  await page.getByLabel("Password").fill("warehouse-browser-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
}

test("scans a real active printed label through the camera and protected resolver", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/machines");
  await page.getByLabel("Search Machines").fill("BROWSER-SERIAL-001");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("link", {
      name: /Open Machine details for .*serial BROWSER-SERIAL-001/,
    })
    .click();
  await expect(page).toHaveURL(/\/machines\/[^/]+$/);
  const machineId = new URL(page.url()).pathname.split("/").at(-1);
  expect(machineId).toBeTruthy();

  await page.goto("/scan");
  await expect(
    page.getByRole("button", { name: "Scan QR code" }),
  ).toBeVisible();
  await expect(page.getByLabel("Enter fallback code")).toBeVisible();
  await page.evaluate(async (id) => {
    const labelsResponse = await fetch(
      `/api/inventory/machines/${id}/qr-labels`,
      {
        credentials: "same-origin",
        cache: "no-store",
      },
    );
    if (!labelsResponse.ok) throw new Error("Seeded labels unavailable");
    const labels = (await labelsResponse.json()) as {
      labels: { id: string; state: string }[];
    };
    const active = labels.labels.find((label) => label.state === "active");
    if (!active) throw new Error("Seeded active label unavailable");
    const printResponse = await fetch(
      `/api/inventory/qr-labels/${active.id}/print`,
      {
        credentials: "same-origin",
        cache: "no-store",
      },
    );
    if (!printResponse.ok)
      throw new Error("Seeded printable label unavailable");
    const svg = new DOMParser().parseFromString(
      await printResponse.text(),
      "image/svg+xml",
    );
    const embeddedQr = svg.querySelector("image")?.getAttribute("href");
    if (!embeddedQr) throw new Error("Printed QR image unavailable");

    const cameraFrame = document.createElement("canvas");
    cameraFrame.width = 640;
    cameraFrame.height = 480;
    const context = cameraFrame.getContext("2d");
    if (!context) throw new Error("Synthetic camera canvas unavailable");
    const qrImage = new Image();
    qrImage.src = embeddedQr;
    await qrImage.decode();
    context.fillStyle = "white";
    context.fillRect(0, 0, 640, 480);
    context.drawImage(qrImage, 170, 90, 300, 300);
    const stream = cameraFrame.captureStream(10);
    (
      window as unknown as { scannerTestStream: MediaStream }
    ).scannerTestStream = stream;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => stream,
    });
  }, machineId);

  await page.getByRole("button", { name: "Scan QR code" }).click();
  await expect(page.getByText("Machine found", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Speed Queen SC30" }),
  ).toBeVisible();
  await expect(page.getByText("BROWSER-SERIAL-001")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Machine details" }),
  ).toHaveAttribute("href", `/machines/${machineId}`);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { scannerTestStream: MediaStream }
      ).scannerTestStream
        .getTracks()
        .every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});

test("views and prints an individual Machine label without downloading it", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/machines");
  await page.getByLabel("Search Machines").fill("BROWSER-SERIAL-001");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("link", {
      name: /Open Machine details for .*serial BROWSER-SERIAL-001/,
    })
    .click();
  await expect(page).toHaveURL(/\/machines\/[^/]+$/);

  await page.evaluate(() => {
    const revoked: string[] = [];
    (window as unknown as { viewerRevoked: string[] }).viewerRevoked = revoked;
    const original = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
      original(url);
    };
  });
  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  await page.getByRole("button", { name: "View / Print" }).click();
  const preview = page.getByTitle("Printable Machine QR label preview");
  await expect(preview).toBeVisible();
  await expect(preview.contentFrame().locator("svg")).toBeVisible();
  const url = await preview.getAttribute("src");
  expect(url).toMatch(/^blob:/);
  expect(downloads).toBe(0);

  await preview.evaluate((element) => {
    const frame = element as HTMLIFrameElement;
    (window as unknown as { viewerPrints: number }).viewerPrints = 0;
    if (!frame.contentWindow)
      throw new Error("Printable preview has no window");
    frame.contentWindow.print = () => {
      (window as unknown as { viewerPrints: number }).viewerPrints += 1;
    };
  });
  await page.getByRole("button", { name: "Print label" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { viewerPrints: number }).viewerPrints,
    ),
  ).toBe(1);
  expect(downloads).toBe(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { viewerRevoked: string[] }).viewerRevoked,
    ),
  ).toContain(url);
});
