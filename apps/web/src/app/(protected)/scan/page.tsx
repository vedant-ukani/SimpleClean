import { headers } from "next/headers";
import { roleHasPermission } from "@laundrorama/contracts";
import { getCurrentIdentity } from "../../../lib/identity-client";
import { readProtectedRouteData } from "../../../lib/server-route-state";
import { ScanView } from "./scan-view";

export default async function ScanPage() {
  const requestHeaders = await headers();
  const identity = await readProtectedRouteData(getCurrentIdentity(fetch, process.env, requestHeaders.get("cookie") ?? undefined));
  return (
    <main className="page-main">
      <ScanView canRouteToWork={roleHasPermission(identity.user.role, "production.work.execute")} />
    </main>
  );
}
