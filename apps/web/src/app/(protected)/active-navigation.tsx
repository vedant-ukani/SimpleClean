"use client";

import type { ApplicationRole } from "@simply-clean/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { navigationForRole } from "../../lib/navigation";

function isCurrentPath(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function ActiveNavigation({
  role,
}: Readonly<{ role: ApplicationRole }>) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = navigationForRole(role).map((item) => {
    const current = isCurrentPath(pathname, item.href);
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
      >
        {item.label}
      </Link>
    );
  });
  return (
    <div className="navigation-region">
      <button
        aria-controls="primary-navigation"
        aria-expanded={mobileOpen}
        className="navigation-menu-button"
        onClick={() => setMobileOpen((current) => !current)}
        type="button"
      >
        Menu
      </button>
      <nav
        aria-label="Primary navigation"
        className={`primary-navigation${mobileOpen ? " primary-navigation--open" : ""}`}
        id="primary-navigation"
      >
        {links}
      </nav>
    </div>
  );
}

export { isCurrentPath };
