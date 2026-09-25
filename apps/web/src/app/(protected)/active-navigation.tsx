"use client";

import type { ApplicationRole } from "@laundrorama/contracts";
import {
  BookOpen,
  Boxes,
  Home,
  Menu,
  PackageOpen,
  ScanLine,
  ClipboardCheck,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  navigationForRole,
  type NavigationIconName,
} from "../../lib/navigation";

const icons: Record<NavigationIconName, LucideIcon> = {
  home: Home,
  users: UsersRound,
  loads: PackageOpen,
  machines: Boxes,
  scan: ScanLine,
  catalog: BookOpen,
  work: ClipboardCheck,
};

function isCurrentPath(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function ActiveNavigation({
  role,
  mode = "sidebar",
}: Readonly<{
  role: ApplicationRole;
  mode?: "sidebar" | "mobile";
}>) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = navigationForRole(role);
  const categories = ["workspace", "management"] as const;
  return (
    <div className={`navigation-region navigation-region--${mode}`}>
      <button
        aria-controls={`primary-navigation-${mode}`}
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? "Close menu" : "Menu"}
        className="navigation-menu-button"
        onClick={() => setMobileOpen((current) => !current)}
        type="button"
      >
        {mobileOpen ? (
          <X aria-hidden="true" size={18} strokeWidth={2.2} />
        ) : (
          <Menu aria-hidden="true" size={18} strokeWidth={2.2} />
        )}
        <span>{mobileOpen ? "Close" : "Menu"}</span>
      </button>
      <nav
        aria-label="Primary navigation"
        className={`primary-navigation${mobileOpen ? " primary-navigation--open" : ""}`}
        id={`primary-navigation-${mode}`}
      >
        {categories.map((category) => {
          const categoryItems = items.filter(
            (item) => item.category === category,
          );
          if (categoryItems.length === 0) return null;
          return (
            <div className="navigation-group" key={category}>
              <p className="navigation-group-label">
                {category === "workspace" ? "Workspace" : "Administration"}
              </p>
              {categoryItems.map((item) => {
                const current = isCurrentPath(pathname, item.href);
                const Icon = icons[item.icon];
                return (
                  <Link
                    aria-current={current ? "page" : undefined}
                    className={
                      current
                        ? "navigation-link navigation-link--active"
                        : "navigation-link"
                    }
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon aria-hidden="true" size={18} strokeWidth={2} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export { isCurrentPath };
