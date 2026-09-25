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
      <aside className="app-sidebar" aria-label="Laundrorama workspace">
        <Link className="brand-link brand-link--sidebar" href="/">
          <span className="brand-mark brand-mark--small" aria-hidden="true">
            L
          </span>
          <span>
            <strong>Laundrorama</strong>
            <small>Operations</small>
          </span>
        </Link>
        <ActiveNavigation mode="sidebar" role={identity.user.role} />
        <div className="account-actions account-actions--sidebar">
          <span className="account-identity">
            <strong>{identity.user.name}</strong>
            <small>{ROLE_LABELS[identity.user.role]}</small>
          </span>
          <LogoutButton />
        </div>
      </aside>
      <div className="app-content">
        <header className="app-header">
          <Link className="brand-link brand-link--mobile" href="/">
            <span className="brand-mark brand-mark--small" aria-hidden="true">
              L
            </span>
            <span>
              <strong>Laundrorama</strong>
              <small>Operations</small>
            </span>
          </Link>
          <ActiveNavigation mode="mobile" role={identity.user.role} />
          <div className="account-actions account-actions--mobile">
            <span className="account-identity">
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
    </div>
  );
}
