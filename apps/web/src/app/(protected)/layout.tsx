import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentIdentity } from "../../lib/identity-client";
import { navigationForRole } from "../../lib/navigation";
import { LogoutButton } from "./logout-button";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  let identity;
  try {
    identity = await getCurrentIdentity(
      fetch,
      process.env,
      requestHeaders.get("cookie") ?? undefined,
    );
  } catch {
    redirect("/login");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand-link" href="/">
          <span className="brand-mark brand-mark--small" aria-hidden="true">
            SC
          </span>
          <span>Simply Clean</span>
        </Link>
        <nav aria-label="Primary navigation">
          {navigationForRole(identity.user.role).map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="account-actions">
          <span>
            <strong>{identity.user.name}</strong>
            <small>{identity.user.email}</small>
          </span>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
