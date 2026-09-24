import {
  roleHasPermission,
  type ApplicationRole,
} from "@simply-clean/contracts";

export interface NavigationItem {
  href: string;
  label: string;
  icon: NavigationIconName;
  category: "workspace" | "management";
}

export interface DashboardItem extends NavigationItem {
  description: string;
}

/** Presentation metadata for the shared shell. Permission decisions remain here. */
export type NavigationIconName =
  "home" | "users" | "loads" | "machines" | "scan" | "catalog";

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

export function canManageMachines(role: ApplicationRole): boolean {
  return roleHasPermission(role, "inventory.machines.manage");
}

export function canManageQrLabels(role: ApplicationRole): boolean {
  return roleHasPermission(role, "inventory.qr_labels.manage");
}

export function navigationForRole(
  role: ApplicationRole,
): readonly NavigationItem[] {
  const navigation: NavigationItem[] = [
    { href: "/", label: "Home", icon: "home", category: "workspace" },
  ];
  if (roleHasPermission(role, "identity.users.read")) {
    navigation.push({
      href: "/admin/users",
      label: "Team",
      icon: "users",
      category: "management",
    });
  }
  if (roleHasPermission(role, "inventory.loads.read")) {
    navigation.push({
      href: "/loads",
      label: "Loads",
      icon: "loads",
      category: "workspace",
    });
  }
  if (roleHasPermission(role, "inventory.machines.read")) {
    navigation.push({
      href: "/machines",
      label: "Machines",
      icon: "machines",
      category: "workspace",
    });
    navigation.push({
      href: "/scan",
      label: "Scan",
      icon: "scan",
      category: "workspace",
    });
  }
  if (roleHasPermission(role, "catalog.read")) {
    navigation.push({
      href: "/catalog",
      label: "Catalog",
      icon: "catalog",
      category: "workspace",
    });
  }
  return navigation;
}

export function dashboardForRole(
  role: ApplicationRole,
): readonly DashboardItem[] {
  if (role === "owner_admin") {
    const items: DashboardItem[] = [
      {
        href: "/loads",
        label: "Loads",
        icon: "loads",
        category: "workspace",
        description: "Review expected and received acquisition loads.",
      },
      {
        href: "/machines",
        label: "Machines",
        icon: "machines",
        category: "workspace",
        description: "Search serialized equipment and identity evidence.",
      },
      {
        href: "/admin/users",
        label: "Team",
        icon: "users",
        category: "management",
        description: "Manage individual staff access and roles.",
      },
    ];
    return items.filter((item) =>
      navigationForRole(role).some((allowed) => allowed.href === item.href),
    );
  }

  if (role === "warehouse") {
    const items: DashboardItem[] = [
      {
        href: "/loads",
        label: "Expected Loads",
        icon: "loads",
        category: "workspace",
        description: "Open incoming Loads that have not been received yet.",
      },
      {
        href: "/machines",
        label: "Machine Search",
        icon: "machines",
        category: "workspace",
        description: "Find a Machine by ID or recorded equipment facts.",
      },
      {
        href: "/scan",
        label: "Scan",
        icon: "scan",
        category: "workspace",
        description: "Resolve a printed QR label or fallback code.",
      },
    ];
    return items.filter((item) =>
      navigationForRole(role).some((allowed) => allowed.href === item.href),
    );
  }

  const items: DashboardItem[] = [
    {
      href: "/machines",
      label: "Machine Search",
      icon: "machines",
      category: "workspace",
      description: "Find equipment and view its permitted record and files.",
    },
    {
      href: "/scan",
      label: "Scan",
      icon: "scan",
      category: "workspace",
      description: "Resolve a printed QR label or fallback code.",
    },
  ];
  return items.filter((item) =>
    navigationForRole(role).some((allowed) => allowed.href === item.href),
  );
}
