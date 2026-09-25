import { headers } from "next/headers";

import { searchMachines } from "../../../lib/inventory-client";
import { readProtectedRouteData } from "../../../lib/server-route-state";
import { MachinesView } from "./machines-view";

export default async function MachinesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ query?: string; page?: string }> }>) {
  const [params, requestHeaders] = await Promise.all([searchParams, headers()]);
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const results = await readProtectedRouteData(
    searchMachines(
      {
        ...(params.query ? { query: params.query } : {}),
        page: Number(params.page) || 1,
      },
      fetch,
      process.env,
      cookie,
    ),
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
        initialQuery={params.query ?? ""}
      />
    </main>
  );
}
