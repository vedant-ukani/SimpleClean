import { z } from "zod";

export const APPLICATION_ROLES = [
  "owner_admin",
  "warehouse",
  "technician_cleaner",
] as const;

export const PERMISSIONS = [
  "platform.access",
  "identity.self.read",
  "identity.users.read",
  "identity.users.manage",
] as const;

export const ApplicationRoleSchema = z.enum(APPLICATION_ROLES);
export const PermissionSchema = z.enum(PERMISSIONS);

export type ApplicationRole = z.infer<typeof ApplicationRoleSchema>;
export type Permission = z.infer<typeof PermissionSchema>;

export const ROLE_PERMISSION_POLICY = {
  owner_admin: PERMISSIONS,
  warehouse: ["platform.access", "identity.self.read"],
  technician_cleaner: ["platform.access", "identity.self.read"],
} as const satisfies Record<ApplicationRole, readonly Permission[]>;

export function permissionsForRole(input: unknown): readonly Permission[] {
  const role = ApplicationRoleSchema.parse(input);
  return ROLE_PERMISSION_POLICY[role];
}

export function roleHasPermission(
  roleInput: unknown,
  permissionInput: unknown,
): boolean {
  const role = ApplicationRoleSchema.parse(roleInput);
  const permission = PermissionSchema.parse(permissionInput);
  return ROLE_PERMISSION_POLICY[role].some(
    (candidate) => candidate === permission,
  );
}
