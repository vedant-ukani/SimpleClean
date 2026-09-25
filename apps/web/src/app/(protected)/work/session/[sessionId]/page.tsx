import { headers } from "next/headers";
import { getCurrentIdentity } from "../../../../../lib/identity-client";
import { getTestSession } from "../../../../../lib/production-client";
import { readProtectedRouteData } from "../../../../../lib/server-route-state";
import { SessionView } from "./session-view";

export default async function SessionPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ machine?: string }>;
}>) {
  const [{ sessionId }, query, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const identity = await readProtectedRouteData(
    getCurrentIdentity(fetch, process.env, cookie),
  );
  const session = await readProtectedRouteData(
    getTestSession(sessionId, fetch, process.env, cookie),
  );
  return (
    <main className="page-main page-main--wide">
      <SessionView
        initialSession={session}
        owner={identity.user.role === "owner_admin"}
        {...(query.machine ? { highlightMachineId: query.machine } : {})}
      />
    </main>
  );
}
