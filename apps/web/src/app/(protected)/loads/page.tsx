import { headers } from "next/headers";

import { getCurrentIdentity } from "../../../lib/identity-client";
import { getLoads } from "../../../lib/inventory-client";
import { canManageLoads } from "../../../lib/navigation";
import { LoadsView } from "./loads-view";

export default async function LoadsPage() {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const [identity, loads] = await Promise.all([
    getCurrentIdentity(fetch, process.env, cookie),
    getLoads(fetch, process.env, cookie),
  ]);
  return (
    <main className="page-main page-main--wide">
      <div className="page-heading">
        <p className="eyebrow">Inventory and Intake</p>
        <h1>Acquisition Loads</h1>
        <p className="lede">
          Track expected groups of equipment before detailed intake begins.
        </p>
      </div>
      <LoadsView
        initialLoads={loads}
        canManage={canManageLoads(identity.user.role)}
      />
    </main>
  );
}
