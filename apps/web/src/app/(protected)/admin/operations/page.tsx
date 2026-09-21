import {
  OperationsActionSchema,
  OperationsTargetTypeSchema,
} from "@simply-clean/contracts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentIdentity } from "../../../../lib/identity-client";
import { canReviewOperations } from "../../../../lib/navigation";
import {
  getAuditHistory,
  getOperationsJobs,
} from "../../../../lib/operations-client";
import { OperationsFilters } from "./operations-filters";
import { OperationsReview } from "./operations-review";

export default async function OperationsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    action?: string;
    targetType?: string;
    targetId?: string;
  }>;
}>) {
  const requestHeaders = await headers();
  const filters = await searchParams;
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const identity = await getCurrentIdentity(fetch, process.env, cookie);
  if (!canReviewOperations(identity.user.role)) redirect("/");
  const action = OperationsActionSchema.safeParse(filters.action);
  const targetType = OperationsTargetTypeSchema.safeParse(filters.targetType);
  const targetId =
    targetType.success &&
    typeof filters.targetId === "string" &&
    filters.targetId.length > 0 &&
    filters.targetId.length <= 200
      ? filters.targetId
      : undefined;
  const [audit, deadLetters, retryWaiting] = await Promise.all([
    getAuditHistory(
      {
        pageSize: 50,
        ...(action.success ? { action: action.data } : {}),
        ...(targetType.success ? { targetType: targetType.data } : {}),
        ...(targetId ? { targetId } : {}),
      },
      fetch,
      process.env,
      cookie,
    ),
    getOperationsJobs(
      { pageSize: 100, state: "dead_letter" },
      fetch,
      process.env,
      cookie,
    ),
    getOperationsJobs(
      { pageSize: 100, state: "retry_wait" },
      fetch,
      process.env,
      cookie,
    ),
  ]);
  const attention = [...deadLetters.jobs, ...retryWaiting.jobs].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  return (
    <main className="page-main">
      <div className="page-heading">
        <p className="eyebrow">Owner Admin</p>
        <h1>Operations history and failed work</h1>
        <p className="lede">
          Review attributable changes and safely requeue work that exhausted its
          automatic attempts.
        </p>
      </div>
      <OperationsFilters
        action={action.success ? action.data : undefined}
        targetType={targetType.success ? targetType.data : undefined}
        targetId={targetId}
      />
      <OperationsReview initialAudit={audit.entries} initialJobs={attention} />
    </main>
  );
}
