import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentIdentity } from "../../../../lib/identity-client";
import { getImportRuns } from "../../../../lib/imports-client";
import { getLoads } from "../../../../lib/inventory-client";
import { canManageImports } from "../../../../lib/navigation";
import { ImportsDashboard } from "./imports-dashboard";

export default async function ImportsPage() {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const identity = await getCurrentIdentity(fetch, process.env, cookie);
  if (!canManageImports(identity.user.role)) redirect("/");
  const [runs, loads] = await Promise.all([
    getImportRuns(fetch, process.env, cookie),
    getLoads(fetch, process.env, cookie),
  ]);
  return (
    <main className="page-main page-main--wide">
      <div className="page-heading">
        <p className="eyebrow">Owner Admin · Inventory migration</p>
        <h1>Inventory imports</h1>
        <p className="lede">
          Stage a source workbook, review every warning, then explicitly approve
          the rows that may create provisional Machines.
        </p>
      </div>
      <ImportsDashboard initialRuns={runs} loads={loads} />
    </main>
  );
}
