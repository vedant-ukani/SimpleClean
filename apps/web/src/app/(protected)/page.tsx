import { headers } from "next/headers";
import {
  ArrowUpRight,
  Boxes,
  CircleAlert,
  PackageOpen,
  UsersRound,
} from "lucide-react";
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
      <section className="hero-card dashboard-hero">
        <div>
          <p className="eyebrow">Operations workspace</p>
          <h1>Welcome back, {identity.user.name}</h1>
        </div>
        <p className="lede">
          {ROLE_LABELS[identity.user.role]} access · Choose a workspace to
          continue today&apos;s work.
        </p>
      </section>
      <section
        className="dashboard-section"
        aria-labelledby="workspace-heading"
      >
        <div className="page-heading page-heading--compact">
          <p className="eyebrow">Your workspace</p>
          <h2 id="workspace-heading">Start work</h2>
          <p className="section-supporting-text">
            Your permitted operational destinations are ready below.
          </p>
        </div>
        <div className="dashboard-grid">
          {dashboard.map((item) => (
            <Link className="dashboard-card" href={item.href} key={item.href}>
              <span className="dashboard-card-icon" aria-hidden="true">
                {item.icon === "loads" ? (
                  <PackageOpen size={20} />
                ) : item.icon === "machines" ? (
                  <Boxes size={20} />
                ) : (
                  <UsersRound size={20} />
                )}
              </span>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
              <span className="dashboard-card-action">
                Open workspace
                <ArrowUpRight aria-hidden="true" size={15} />
              </span>
            </Link>
          ))}
          {showPilotPlaceholder ? (
            <article className="dashboard-card dashboard-card--placeholder">
              <span
                className="dashboard-card-icon dashboard-card-icon--muted"
                aria-hidden="true"
              >
                <CircleAlert size={20} />
              </span>
              <span className="status status--warning">Not enabled yet</span>
              <strong>Assigned work</strong>
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
