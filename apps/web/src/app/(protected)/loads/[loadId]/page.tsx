import { roleHasPermission } from "@laundrorama/contracts";
import { headers } from "next/headers";

import { getFiles } from "../../../../lib/files-client";
import { getCurrentIdentity } from "../../../../lib/identity-client";
import { getLoad } from "../../../../lib/inventory-client";
import { listIntakeBatchesForLoad } from "../../../../lib/intake-client";
import { canManageLoads } from "../../../../lib/navigation";
import { readProtectedRouteData } from "../../../../lib/server-route-state";
import { LoadDetailView } from "./load-detail-view";

export default async function LoadDetailPage({
  params,
}: Readonly<{ params: Promise<{ loadId: string }> }>) {
  const [{ loadId }, requestHeaders] = await Promise.all([params, headers()]);
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const [load, identity, files, batches] = await readProtectedRouteData(
    Promise.all([
      getLoad(loadId, fetch, process.env, cookie),
      getCurrentIdentity(fetch, process.env, cookie),
      getFiles({ type: "load", id: loadId }, fetch, process.env, cookie),
      listIntakeBatchesForLoad(loadId, fetch, process.env, cookie),
    ]),
  );
  return (
    <main className="page-main">
      <div className="page-heading">
        <p className="eyebrow">Acquisition Load</p>
        <h1>{load.displayName}</h1>
      </div>
      <LoadDetailView
        initialLoad={load}
        initialBatches={batches}
        canManage={canManageLoads(identity.user.role)}
        canManageIntake={roleHasPermission(identity.user.role, "intake.manage")}
        canReadIntake={roleHasPermission(identity.user.role, "intake.read")}
        canPrintIntake={roleHasPermission(
          identity.user.role,
          "inventory.qr_labels.manage",
        )}
        initialFiles={files}
        canUploadFiles={roleHasPermission(identity.user.role, "files.write")}
      />
    </main>
  );
}
