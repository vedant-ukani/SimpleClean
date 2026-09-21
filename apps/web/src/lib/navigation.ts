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

export function navigationForRole(
  role: ApplicationRole,
): readonly NavigationItem[] {
  const navigation: NavigationItem[] = [{ href: "/", label: "Home" }];
  if (roleHasPermission(role, "identity.users.read")) {
    navigation.push({ href: "/admin/users", label: "Team" });
  }
  return navigation;
}
