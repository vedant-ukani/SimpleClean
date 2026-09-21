import {
  roleHasPermission,
  type ApplicationRole,
} from "@simply-clean/contracts";

export interface NavigationItem {
  href: string;
  label: string;
}

export interface DashboardItem extends NavigationItem {
  description: string;
}

export const ROLE_LABELS: Record<ApplicationRole, string> = {
  owner_admin: "Owner Admin",
  warehouse: "Warehouse",
  technician_cleaner: "Technician / Cleaner",
};

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

export function canManageQrLabels(role: ApplicationRole): boolean {
  return roleHasPermission(role, "inventory.qr_labels.manage");
}

export function canManageFiles(role: ApplicationRole): boolean {
  return roleHasPermission(role, "files.manage");
}

export function canReviewOperations(role: ApplicationRole): boolean {
  return roleHasPermission(role, "operations.audit.read");
}

export function canManageImports(role: ApplicationRole): boolean {
  return roleHasPermission(role, "imports.manage");
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
  if (roleHasPermission(role, "imports.read")) {
    navigation.push({ href: "/admin/imports", label: "Imports" });
  }
  if (roleHasPermission(role, "inventory.loads.read")) {
    navigation.push({ href: "/loads", label: "Loads" });
  }
  if (roleHasPermission(role, "inventory.machines.read")) {
    navigation.push({ href: "/machines", label: "Machines" });
    navigation.push({ href: "/scan", label: "Scan" });
  }
  if (roleHasPermission(role, "inventory.locations.read")) {
    navigation.push({ href: "/locations", label: "Locations" });
  }
  return navigation;
}

export function dashboardForRole(
  role: ApplicationRole,
): readonly DashboardItem[] {
  if (role === "owner_admin") {
    return [
      {
        href: "/admin/imports",
        label: "Imports",
        description: "Review and commit inventory spreadsheet staging runs.",
      },
      {
        href: "/loads",
        label: "Loads",
        description: "Review expected and received acquisition loads.",
      },
      {
        href: "/machines",
        label: "Machines",
        description: "Search serialized equipment and identity evidence.",
      },
      {
        href: "/admin/users",
        label: "Team",
        description: "Manage individual staff access and roles.",
      },
      {
        href: "/admin/operations",
        label: "Operations",
        description: "Review audit history and background-job health.",
      },
      {
        href: "/admin/files",
        label: "Foundation review",
        description: "Review incomplete private file uploads.",
      },
    ].filter((item) =>
      navigationForRole(role).some((allowed) => allowed.href === item.href),
    );
  }

  if (role === "warehouse") {
    return [
      {
        href: "/loads",
        label: "Expected Loads",
        description: "Open incoming Loads that have not been received yet.",
      },
      {
        href: "/machines",
        label: "Machine Search",
        description: "Find a Machine by ID or recorded equipment facts.",
      },
      {
        href: "/scan",
        label: "Scan",
        description: "Resolve a printed QR label or fallback code.",
      },
      {
        href: "/locations",
        label: "Locations",
        description: "Find the named positions used for equipment.",
      },
    ].filter((item) =>
      navigationForRole(role).some((allowed) => allowed.href === item.href),
    );
  }

  return [
    {
      href: "/machines",
      label: "Machine Search",
      description: "Find equipment and view its permitted record and files.",
    },
    {
      href: "/scan",
      label: "Scan",
      description: "Resolve a printed QR label or fallback code.",
    },
  ].filter((item) =>
    navigationForRole(role).some((allowed) => allowed.href === item.href),
  );
}
