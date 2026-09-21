import { describe, expect, it } from "vitest";

import {
  ApplicationRoleSchema,
  PermissionSchema,
  permissionsForRole,
  roleHasPermission,
} from "../src/index.js";

describe("authorization policy", () => {
  it("defines the complete SF-02 policy for every canonical role", () => {
    expect(permissionsForRole("owner_admin")).toEqual([
      "platform.access",
      "identity.self.read",
      "identity.users.read",
      "identity.users.manage",
    ]);
    expect(permissionsForRole("warehouse")).toEqual([
      "platform.access",
      "identity.self.read",
    ]);
    expect(permissionsForRole("technician_cleaner")).toEqual([
      "platform.access",
      "identity.self.read",
    ]);

    expect(roleHasPermission("owner_admin", "identity.users.manage")).toBe(
      true,
    );
    expect(roleHasPermission("warehouse", "identity.users.manage")).toBe(false);
    expect(roleHasPermission("technician_cleaner", "identity.users.read")).toBe(
      false,
    );
  });

  it("rejects unknown roles and permissions at runtime", () => {
    expect(ApplicationRoleSchema.safeParse("admin").success).toBe(false);
    expect(PermissionSchema.safeParse("identity.users.delete").success).toBe(
      false,
    );
    expect(() => permissionsForRole("admin")).toThrow();
    expect(() =>
      roleHasPermission("owner_admin", "future.permission"),
    ).toThrow();
  });
});
