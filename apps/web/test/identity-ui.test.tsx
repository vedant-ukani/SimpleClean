import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoginError } from "../src/app/login/login-form";
import { TeamManagement } from "../src/app/(protected)/admin/users/team-management";
import {
  canManageQrLabels,
  canManageUsers,
  dashboardForRole,
  navigationForRole,
} from "../src/lib/navigation";
import { isCurrentPath } from "../src/app/(protected)/active-navigation";

describe("role-aware identity UI", () => {
  it("shows team management only to the Owner Admin", () => {
    expect(navigationForRole("owner_admin").map((item) => item.href)).toEqual([
      "/",
      "/admin/users",
      "/admin/files",
      "/admin/operations",
      "/admin/imports",
      "/loads",
      "/machines",
      "/scan",
      "/locations",
    ]);
    expect(navigationForRole("warehouse").map((item) => item.href)).toEqual([
      "/",
      "/loads",
      "/machines",
      "/scan",
      "/locations",
    ]);
    expect(
      navigationForRole("technician_cleaner").map((item) => item.href),
    ).toEqual(["/", "/machines", "/scan", "/locations"]);
    expect(canManageUsers("owner_admin")).toBe(true);
    expect(canManageUsers("warehouse")).toBe(false);
    expect(canManageQrLabels("owner_admin")).toBe(true);
    expect(canManageQrLabels("warehouse")).toBe(true);
    expect(canManageQrLabels("technician_cleaner")).toBe(false);
  });

  it("derives role dashboards from permitted foundation destinations", () => {
    expect(dashboardForRole("owner_admin").map((item) => item.label)).toEqual([
      "Imports",
      "Loads",
      "Machines",
      "Team",
      "Operations",
      "Foundation review",
    ]);
    expect(dashboardForRole("warehouse").map((item) => item.label)).toEqual([
      "Expected Loads",
      "Machine Search",
      "Scan",
      "Locations",
    ]);
    expect(
      dashboardForRole("technician_cleaner").map((item) => item.label),
    ).toEqual(["Machine Search", "Scan"]);
  });

  it("marks only the current navigation destination", () => {
    expect(isCurrentPath("/", "/")).toBe(true);
    expect(isCurrentPath("/machines/record-1", "/machines")).toBe(true);
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
