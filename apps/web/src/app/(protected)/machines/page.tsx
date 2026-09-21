import { roleHasPermission } from "@simply-clean/contracts";
import { headers } from "next/headers";

import { getCurrentIdentity } from "../../../lib/identity-client";
import {
  getLoads,
  getLocations,
  searchMachines,
} from "../../../lib/inventory-client";
import { canManageMachines } from "../../../lib/navigation";
import { readProtectedRouteData } from "../../../lib/server-route-state";
import { MachinesView } from "./machines-view";

export default async function MachinesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ query?: string; page?: string }> }>) {
  const [params, requestHeaders] = await Promise.all([searchParams, headers()]);
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const identity = await readProtectedRouteData(
    getCurrentIdentity(fetch, process.env, cookie),
  );
  const canManage = canManageMachines(identity.user.role);
  const [results, locations, loads] = await readProtectedRouteData(
    Promise.all([
      searchMachines(
        {
          ...(params.query ? { query: params.query } : {}),
          page: Number(params.page) || 1,
        },
        fetch,
        process.env,
        cookie,
      ),
      getLocations(fetch, process.env, cookie),
      canManage ? getLoads(fetch, process.env, cookie) : Promise.resolve([]),
    ]),
  );
  return (
    <main className="page-main page-main--wide">
      <div className="page-heading">
        <p className="eyebrow">Inventory and Intake</p>
        <h1>Machines</h1>
        <p className="lede">
          Search immutable platform IDs and recorded equipment identity facts.
        </p>
      </div>
      <MachinesView
        initialResults={results}
        loads={loads}
        locations={locations}
        canManage={canManage}
        canRelocate={roleHasPermission(
          identity.user.role,
          "inventory.machines.relocate",
        )}
        initialQuery={params.query ?? ""}
      />
    </main>
  );
}
