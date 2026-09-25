import { headers } from "next/headers";
import Link from "next/link";
import { getCurrentIdentity } from "../../../lib/identity-client";
import { getTestQueue } from "../../../lib/production-client";
import { readProtectedRouteData } from "../../../lib/server-route-state";
import { WorkQueueView } from "./work-queue-view";

export default async function WorkPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ completed?: string }> }>) {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const identity = await readProtectedRouteData(
    getCurrentIdentity(fetch, process.env, cookie),
  );
  const owner = identity.user.role === "owner_admin";
  const includeCompleted = owner && (await searchParams).completed === "true";
  const queue = await readProtectedRouteData(
    getTestQueue(fetch, process.env, cookie, includeCompleted),
  );
  return (
    <main className="page-main page-main--wide">
      <div className="page-heading">
        <p className="eyebrow">Production</p>
        <h1>{owner ? "Production Work" : "My Work"}</h1>
        <p className="lede">
          {owner
            ? "Review Test orders and assignments."
            : "Select matching Machines, then switch between their individual Tests in one timed session."}
        </p>
      </div>
      {owner ? (
        <p className="work-view-toggle">
          <Link
            className="button-link"
            href={includeCompleted ? "/work" : "/work?completed=true"}
          >
            {includeCompleted ? "Active work only" : "Include completed work"}
          </Link>
        </p>
      ) : null}
      <WorkQueueView initialQueue={queue} owner={owner} />
    </main>
  );
}
