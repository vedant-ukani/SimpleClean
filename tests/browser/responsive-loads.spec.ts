import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  await page.goto("/loads");
  await expect(
    page.getByRole("heading", { name: "Acquisition Loads" }),
  ).toBeVisible();
}

test("Warehouse Load actions stay inside their full-width card at laptop, tablet, and mobile sizes", async ({
  page,
}) => {
  await signIn(
    page,
    "warehouse.browser@example.test",
    "warehouse-browser-password",
  );

  for (const width of [1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const geometry = await page.locator(".management-grid").evaluate((grid) => {
      const panel = grid.querySelector<HTMLElement>(".panel");
      const action = grid.querySelector<HTMLElement>(".inventory-row > a");
      if (!panel || !action) return null;
      const gridBox = grid.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      return {
        gridLeft: gridBox.left,
        gridRight: gridBox.right,
        panelLeft: panelBox.left,
        panelRight: panelBox.right,
        actionLeft: actionBox.left,
        actionRight: actionBox.right,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(
      geometry,
      `Missing Load card or View Load action at ${width}px`,
    ).not.toBeNull();
    expect(geometry!.panelLeft).toBeGreaterThanOrEqual(geometry!.gridLeft - 1);
    expect(geometry!.panelRight).toBeLessThanOrEqual(geometry!.gridRight + 1);
    expect(geometry!.panelRight - geometry!.panelLeft).toBeGreaterThanOrEqual(
      geometry!.gridRight - geometry!.gridLeft - 1,
    );
    expect(geometry!.actionLeft).toBeGreaterThanOrEqual(geometry!.panelLeft);
    expect(geometry!.actionRight).toBeLessThanOrEqual(geometry!.panelRight);
    expect(geometry!.documentWidth).toBeLessThanOrEqual(
      geometry!.viewportWidth,
    );
  }
});

test("Owner Load panels stack at tablet widths and share a row on laptops", async ({
  page,
}) => {
  await signIn(page, "owner.browser@example.test", "owner-browser-password");

  for (const width of [1280, 1024, 768]) {
    await page.setViewportSize({ width, height: 800 });
    const panels = await page
      .locator(".management-grid > .panel")
      .evaluateAll((items) =>
        items.map((item) => {
          const box = item.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
          };
        }),
      );
    expect(panels).toHaveLength(2);
    if (width > 1200) {
      expect(panels[1].left).toBeGreaterThanOrEqual(panels[0].right);
    } else {
      expect(panels[1].top).toBeGreaterThanOrEqual(panels[0].bottom);
    }
  }
});
