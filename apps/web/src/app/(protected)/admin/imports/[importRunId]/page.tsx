import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentIdentity } from "../../../../../lib/identity-client";
import { getImportRows, getImportRun } from "../../../../../lib/imports-client";
import { canManageImports } from "../../../../../lib/navigation";
import { readProtectedRouteData } from "../../../../../lib/server-route-state";
import { ImportReview } from "./import-review";

export default async function ImportRunPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ importRunId: string }>;
  searchParams: Promise<{ classification?: string; page?: string }>;
}>) {
  const [{ importRunId }, filters, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const identity = await readProtectedRouteData(
    getCurrentIdentity(fetch, process.env, cookie),
  );
  if (!canManageImports(identity.user.role)) redirect("/");
  const classification =
    filters.classification === "ready" ||
    filters.classification === "warning" ||
    filters.classification === "error"
      ? filters.classification
      : undefined;
  const page = Math.max(1, Number(filters.page) || 1);
  const [run, rows] = await readProtectedRouteData(
    Promise.all([
      getImportRun(importRunId, fetch, process.env, cookie),
      getImportRows(
        importRunId,
        {
          ...(classification ? { classification } : {}),
          page,
          pageSize: 50,
        },
        fetch,
        process.env,
        cookie,
      ),
    ]),
  );
  return (
    <main className="page-main page-main--wide">
      <div className="page-heading">
        <p className="eyebrow">Owner Admin · Import review</p>
        <h1>{run.originalFilename}</h1>
        <p className="lede">
          Source rows are evidence. Selecting a warning accepts the ambiguity;
          it never verifies identity or merges an existing Machine.
        </p>
      </div>
      <ImportReview
        run={run}
        rowResult={rows}
        {...(classification ? { classification } : {})}
      />
    </main>
  );
}
