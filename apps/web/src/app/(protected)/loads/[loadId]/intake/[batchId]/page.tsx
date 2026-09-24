import { headers } from "next/headers";
import { getCurrentIdentity } from "../../../../../../lib/identity-client";
import { getIntakeBatch } from "../../../../../../lib/intake-client";
import { readProtectedRouteData } from "../../../../../../lib/server-route-state";
import { IntakeReviewView } from "./review-view";

export default async function IntakePage({
  params,
}: Readonly<{ params: Promise<{ loadId: string; batchId: string }> }>) {
  const [{ loadId, batchId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const [detail, identity] = await readProtectedRouteData(
    Promise.all([
      getIntakeBatch(batchId, fetch, process.env, cookie),
      getCurrentIdentity(fetch, process.env, cookie),
    ]),
  );
  return (
    <main className="page-main">
      <div className="page-heading">
        <p className="eyebrow">Laundrorama</p>
        <h1>Photo intake review</h1>
        <p>
          Upload all nameplates, let each photo finish recognition, choose each
          Machine type, then add the complete Intake to Inventory.
        </p>
      </div>
      <IntakeReviewView
        initialDetail={detail}
        loadId={loadId}
        canManage={
          identity.user.role === "owner_admin" ||
          identity.user.role === "warehouse"
        }
      />
    </main>
  );
}
