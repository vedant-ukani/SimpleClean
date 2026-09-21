import {
  roleHasPermission,
  type ApplicationRole,
} from "@simply-clean/contracts";

export interface NavigationItem {
  href: string;
  label: string;
}

export function canManageUsers(role: ApplicationRole): boolean {
  return roleHasPermission(role, "identity.users.manage");
}

export function canManageLoads(role: ApplicationRole): boolean {
  return roleHasPermission(role, "inventory.loads.manage");
}

export function canManageLocations(role: ApplicationRole): boolean {
  return roleHasPermission(role, "inventory.locations.manage");
}

export function canManageMachines(role: ApplicationRole): boolean {
  return roleHasPermission(role, "inventory.machines.manage");
}

export function canManageFiles(role: ApplicationRole): boolean {
  return roleHasPermission(role, "files.manage");
}

export function canReviewOperations(role: ApplicationRole): boolean {
  return roleHasPermission(role, "operations.audit.read");
}

export function navigationForRole(
  role: ApplicationRole,
): readonly NavigationItem[] {
  const navigation: NavigationItem[] = [{ href: "/", label: "Home" }];
  if (roleHasPermission(role, "identity.users.read")) {
    navigation.push({ href: "/admin/users", label: "Team" });
  }
  if (roleHasPermission(role, "files.manage")) {
    navigation.push({ href: "/admin/files", label: "File review" });
  }
  if (roleHasPermission(role, "operations.audit.read")) {
    navigation.push({ href: "/admin/operations", label: "Operations" });
  }
  if (roleHasPermission(role, "inventory.loads.read")) {
    navigation.push({ href: "/loads", label: "Loads" });
  }
  if (roleHasPermission(role, "inventory.machines.read")) {
    navigation.push({ href: "/machines", label: "Machines" });
  }
  if (roleHasPermission(role, "inventory.locations.read")) {
    navigation.push({ href: "/locations", label: "Locations" });
  }
  return navigation;
}
