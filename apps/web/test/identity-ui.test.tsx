import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LoginError, LoginForm } from "../src/app/login/login-form";
import { TeamManagement } from "../src/app/(protected)/admin/users/team-management";
import {
  canManageQrLabels,
  canManageUsers,
  dashboardForRole,
  navigationForRole,
} from "../src/lib/navigation";
import { isCurrentPath } from "../src/app/(protected)/active-navigation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe("role-aware identity UI", () => {
  it("shows team management only to the Owner Admin", () => {
    const ownerNavigation = navigationForRole("owner_admin");
    expect(ownerNavigation.map((item) => item.href)).toEqual([
      "/",
      "/admin/users",
      "/loads",
      "/machines",
      "/scan",
      "/work",
      "/catalog",
    ]);
    expect(ownerNavigation.map((item) => item.icon)).toEqual([
      "home",
      "users",
      "loads",
      "machines",
      "scan",
      "work",
      "catalog",
    ]);
    expect(ownerNavigation.map((item) => item.category)).toEqual([
      "workspace",
      "management",
      "workspace",
      "workspace",
      "workspace",
      "workspace",
      "workspace",
    ]);
    expect(ownerNavigation.find((item) => item.href === "/work")?.label).toBe(
      "Production Work",
    );
    expect(
      navigationForRole("technician_cleaner").find(
        (item) => item.href === "/work",
      )?.label,
    ).toBe("My Work");
    expect(navigationForRole("warehouse").map((item) => item.href)).toEqual([
      "/",
      "/loads",
      "/machines",
      "/scan",
    ]);
    expect(
      navigationForRole("technician_cleaner").map((item) => item.href),
    ).toEqual(["/", "/machines", "/scan", "/work"]);
    expect(canManageUsers("owner_admin")).toBe(true);
    expect(canManageUsers("warehouse")).toBe(false);
    expect(canManageQrLabels("owner_admin")).toBe(true);
    expect(canManageQrLabels("warehouse")).toBe(true);
    expect(canManageQrLabels("technician_cleaner")).toBe(false);
  });

  it("derives role dashboards from permitted foundation destinations", () => {
    const ownerDashboard = dashboardForRole("owner_admin");
    expect(ownerDashboard.map((item) => item.label)).toEqual([
      "Loads",
      "Machines",
      "Team",
      "Production Work",
    ]);
    expect(ownerDashboard.every((item) => item.icon && item.category)).toBe(
      true,
    );
    expect(dashboardForRole("warehouse").map((item) => item.label)).toEqual([
      "Expected Loads",
      "Machine Search",
      "Scan",
    ]);
    expect(
      dashboardForRole("technician_cleaner").map((item) => item.label),
    ).toEqual(["My Work", "Machine Search", "Scan"]);
  });

  it("marks only the current navigation destination", () => {
    expect(isCurrentPath("/", "/")).toBe(true);
    expect(isCurrentPath("/machines/record-1", "/machines")).toBe(true);
    expect(isCurrentPath("/catalog/revision-1", "/catalog")).toBe(true);
    expect(isCurrentPath("/machines", "/")).toBe(false);
    expect(isCurrentPath("/machine-tools", "/machines")).toBe(false);
  });

  it("renders login failures as an accessible alert", () => {
    const markup = renderToStaticMarkup(
      <LoginError message="Email or password was not accepted." />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Email or password was not accepted.");
  });

  it("uses POST for the native login fallback", () => {
    const markup = renderToStaticMarkup(<LoginForm />);
    expect(markup).toMatch(/<form[^>]*method="post"/);
  });

  it("renders the Owner Admin team-management surface", () => {
    const timestamp = new Date().toISOString();
    const markup = renderToStaticMarkup(
      <TeamManagement
        initialUsers={[
          {
            id: "owner-1",
            name: "Pilot Owner",
            email: "owner@example.test",
            role: "owner_admin",
            active: true,
            version: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ]}
      />,
    );
    expect(markup).toContain("Create pilot user");
    expect(markup).toContain("Team");
    expect(markup).toContain("Pilot Owner");
  });
});
