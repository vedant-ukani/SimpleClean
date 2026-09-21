import { headers } from "next/headers";

import { getCurrentIdentity } from "../../../lib/identity-client";
import { getLocations } from "../../../lib/inventory-client";
import { canManageLocations } from "../../../lib/navigation";
import { readProtectedRouteData } from "../../../lib/server-route-state";
import { LocationsView } from "./locations-view";

export default async function LocationsPage() {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const [identity, locations] = await readProtectedRouteData(
    Promise.all([
      getCurrentIdentity(fetch, process.env, cookie),
      getLocations(fetch, process.env, cookie),
    ]),
  );
  return (
    <main className="page-main page-main--wide">
      <div className="page-heading">
        <p className="eyebrow">Inventory and Intake</p>
        <h1>Locations</h1>
        <p className="lede">
          Named physical positions where Machines can be found.
        </p>
      </div>
      <LocationsView
        initialLocations={locations}
        canManage={canManageLocations(identity.user.role)}
      />
    </main>
  );
}
