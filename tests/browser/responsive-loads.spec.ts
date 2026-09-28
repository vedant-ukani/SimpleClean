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
      const panels = Array.from(grid.querySelectorAll<HTMLElement>(".panel"));
      const panel = panels[0];
      const action = grid.querySelector<HTMLElement>(".inventory-row > a");
      if (panels.length !== 2 || !panel || !action) return null;
      const gridBox = grid.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      return {
        gridLeft: gridBox.left,
        gridRight: gridBox.right,
        panelBoxes: panels.map((item) => {
          const box = item.getBoundingClientRect();
          return { left: box.left, right: box.right };
        }),
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
    for (const panel of geometry!.panelBoxes) {
      expect(panel.left).toBeGreaterThanOrEqual(geometry!.gridLeft - 1);
      expect(panel.right).toBeLessThanOrEqual(geometry!.gridRight + 1);
      expect(panel.right - panel.left).toBeGreaterThanOrEqual(
        geometry!.gridRight - geometry!.gridLeft - 1,
      );
    }
    expect(geometry!.actionLeft).toBeGreaterThanOrEqual(
      geometry!.panelBoxes[0].left,
    );
    expect(geometry!.actionRight).toBeLessThanOrEqual(
      geometry!.panelBoxes[0].right,
    );
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

test("Mobile header keeps account actions on the right and Menu aligned with the brand", async ({
  page,
}) => {
  await signIn(
    page,
    "warehouse.browser@example.test",
    "warehouse-browser-password",
  );

  for (const width of [768, 390, 375]) {
    await page.setViewportSize({ width, height: 800 });
    const geometry = await page.locator(".app-header").evaluate((header) => {
      const box = (selector: string) => {
        const element = header.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      };
      return {
        brand: box(".brand-link--mobile"),
        menu: box(".navigation-region--mobile .navigation-menu-button"),
        identity: box(".account-actions--mobile .account-identity"),
        logout: box(".account-actions--mobile .logout-control button"),
        changePassword: box(".account-actions--mobile > a"),
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });

    const { brand, menu, identity, logout, changePassword } = geometry;
    expect(brand, `Missing mobile brand at ${width}px`).not.toBeNull();
    expect(menu, `Missing Menu button at ${width}px`).not.toBeNull();
    expect(identity, `Missing account identity at ${width}px`).not.toBeNull();
    expect(logout, `Missing Log out button at ${width}px`).not.toBeNull();
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(Math.abs(menu!.left - brand!.left)).toBeLessThanOrEqual(1);
    expect(identity!.left).toBeGreaterThanOrEqual(brand!.right - 1);
    expect(logout!.left).toBeGreaterThanOrEqual(identity!.right - 1);
    expect(logout!.right).toBeLessThanOrEqual(width);
    expect(logout!.top).toBeLessThan(brand!.bottom);
    expect(logout!.bottom).toBeGreaterThan(brand!.top);
    expect(menu!.top).toBeGreaterThanOrEqual(brand!.bottom);
    if (changePassword) {
      expect(changePassword.left).toBeGreaterThanOrEqual(menu!.right - 1);
    }

    await page.getByRole("button", { name: "Menu" }).click();
    const dropdown = await page
      .locator(".navigation-region--mobile .primary-navigation--open")
      .boundingBox();
    expect(dropdown, `Missing open Menu dropdown at ${width}px`).not.toBeNull();
    expect(dropdown!.x).toBeGreaterThanOrEqual(0);
    expect(dropdown!.x + dropdown!.width).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "Close menu" }).click();
  }
});
