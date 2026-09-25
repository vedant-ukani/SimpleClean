import { headers } from "next/headers";
import { getInitialCheckMachine } from "../../../../../lib/production-client";
import { readProtectedRouteData } from "../../../../../lib/server-route-state";
import { InitialCheckView } from "./initial-check-view";

export default async function InitialCheckPage({
  params,
}: Readonly<{ params: Promise<{ machineId: string }> }>) {
  const [{ machineId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  const machine = await readProtectedRouteData(
    getInitialCheckMachine(
      machineId,
      fetch,
      process.env,
      requestHeaders.get("cookie") ?? undefined,
    ),
  );
  return (
    <main className="page-main page-main--wide">
      <InitialCheckView machine={machine} />
    </main>
  );
}
