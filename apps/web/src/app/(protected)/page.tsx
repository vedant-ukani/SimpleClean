import { headers } from "next/headers";

import { getCurrentIdentity } from "../../lib/identity-client";

const roleLabels = {
  owner_admin: "Owner Admin",
  warehouse: "Warehouse",
  technician_cleaner: "Technician / Cleaner",
} as const;

export default async function Home() {
  const requestHeaders = await headers();
  const identity = await getCurrentIdentity(
    fetch,
    process.env,
    requestHeaders.get("cookie") ?? undefined,
  );
  return (
    <main className="page-main">
      <section className="hero-card">
        <p className="eyebrow">Signed in securely</p>
        <h1>Welcome, {identity.user.name}</h1>
        <p className="lede">
          Your current role is {roleLabels[identity.user.role]}. Operational
          workspaces will appear here as the foundation expands.
        </p>
      </section>
    </main>
  );
}
