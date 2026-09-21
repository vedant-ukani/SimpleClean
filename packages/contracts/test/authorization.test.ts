import { describe, expect, it } from "vitest";

import {
  ApplicationRoleSchema,
  PermissionSchema,
  permissionsForRole,
  roleHasPermission,
} from "../src/index.js";

describe("authorization policy", () => {
  it("defines the complete foundation policy for every canonical role", () => {
    expect(permissionsForRole("owner_admin")).toEqual([
      "platform.access",
      "identity.self.read",
      "identity.users.read",
      "identity.users.manage",
      "inventory.loads.read",
      "inventory.loads.manage",
      "inventory.machines.read",
      "inventory.machines.manage",
      "inventory.machines.verify",
      "inventory.machines.relocate",
      "inventory.locations.read",
      "inventory.locations.manage",
      "files.read",
      "files.write",
      "files.manage",
    ]);
    expect(permissionsForRole("warehouse")).toEqual([
      "platform.access",
      "identity.self.read",
      "inventory.loads.read",
      "inventory.machines.read",
      "inventory.machines.manage",
      "inventory.machines.verify",
      "inventory.machines.relocate",
      "inventory.locations.read",
      "files.read",
      "files.write",
    ]);
    expect(permissionsForRole("technician_cleaner")).toEqual([
      "platform.access",
      "identity.self.read",
      "inventory.machines.read",
      "inventory.locations.read",
      "files.read",
      "files.write",
    ]);

    expect(roleHasPermission("owner_admin", "identity.users.manage")).toBe(
      true,
    );
    expect(roleHasPermission("warehouse", "identity.users.manage")).toBe(false);
    expect(roleHasPermission("technician_cleaner", "identity.users.read")).toBe(
      false,
    );
    expect(roleHasPermission("warehouse", "inventory.machines.verify")).toBe(
      true,
    );
    expect(roleHasPermission("warehouse", "inventory.loads.manage")).toBe(
      false,
    );
    expect(
      roleHasPermission("technician_cleaner", "inventory.machines.manage"),
    ).toBe(false);
    expect(roleHasPermission("warehouse", "files.manage")).toBe(false);
    expect(roleHasPermission("technician_cleaner", "files.write")).toBe(true);
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
