import { headers } from "next/headers";
import Link from "next/link";

import { getCurrentIdentity } from "../../lib/identity-client";
import { dashboardForRole, ROLE_LABELS } from "../../lib/navigation";
import { readProtectedRouteData } from "../../lib/server-route-state";

export default async function Home() {
  const requestHeaders = await headers();
  const identity = await readProtectedRouteData(
    getCurrentIdentity(
      fetch,
      process.env,
      requestHeaders.get("cookie") ?? undefined,
    ),
  );
  const dashboard = dashboardForRole(identity.user.role);
  const showPilotPlaceholder = identity.user.role !== "owner_admin";
  return (
    <main className="page-main">
      <section className="hero-card">
        <p className="eyebrow">Signed in securely</p>
        <h1>Welcome, {identity.user.name}</h1>
        <p className="lede">
          Your current role is {ROLE_LABELS[identity.user.role]}. Choose a
          permitted foundation workspace below.
        </p>
      </section>
      <section
        className="dashboard-section"
        aria-labelledby="workspace-heading"
      >
        <div className="page-heading page-heading--compact">
          <p className="eyebrow">Your workspace</p>
          <h2 id="workspace-heading">Start work</h2>
        </div>
        <div className="dashboard-grid">
          {dashboard.map((item) => (
            <Link className="dashboard-card" href={item.href} key={item.href}>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </Link>
          ))}
          {showPilotPlaceholder ? (
            <article className="dashboard-card dashboard-card--placeholder">
              <span className="status status--warning">Pilot placeholder</span>
              <strong>Recent and assigned work</strong>
              <span>
                This workflow will be defined after warehouse observation. No
                assignments or completion status are recorded here yet.
              </span>
            </article>
          ) : null}
        </div>
      </section>
    </main>
  );
}
