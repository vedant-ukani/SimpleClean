import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoginError } from "../src/app/login/login-form";
import { TeamManagement } from "../src/app/(protected)/admin/users/team-management";
import { canManageUsers, navigationForRole } from "../src/lib/navigation";

describe("role-aware identity UI", () => {
  it("shows team management only to the Owner Admin", () => {
    expect(navigationForRole("owner_admin").map((item) => item.href)).toEqual([
      "/",
      "/admin/users",
      "/admin/files",
      "/loads",
      "/machines",
      "/locations",
    ]);
    expect(navigationForRole("warehouse").map((item) => item.href)).toEqual([
      "/",
      "/loads",
      "/machines",
      "/locations",
    ]);
    expect(
      navigationForRole("technician_cleaner").map((item) => item.href),
    ).toEqual(["/", "/machines", "/locations"]);
    expect(canManageUsers("owner_admin")).toBe(true);
    expect(canManageUsers("warehouse")).toBe(false);
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
