import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  getCurrentIdentity,
  identityRequiresSignIn,
} from "../../lib/identity-client";
import { ROLE_LABELS } from "../../lib/navigation";
import { ActiveNavigation } from "./active-navigation";
import { LogoutButton } from "./logout-button";
import { OnlineStatus } from "./online-status";

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
  } catch (error) {
    if (identityRequiresSignIn(error)) redirect("/login");
    throw error;
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <OnlineStatus />
      <header className="app-header">
        <Link className="brand-link" href="/">
          <span className="brand-mark brand-mark--small" aria-hidden="true">
            SC
          </span>
          <span>Simply Clean</span>
        </Link>
        <ActiveNavigation role={identity.user.role} />
        <div className="account-actions">
          <span>
            <strong>{identity.user.name}</strong>
            <small>{ROLE_LABELS[identity.user.role]}</small>
          </span>
          <LogoutButton />
        </div>
      </header>
      <div id="main-content" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
