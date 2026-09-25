import { roleHasPermission } from "@laundrorama/contracts";
import { headers } from "next/headers";

import { getCurrentIdentity } from "../../../../lib/identity-client";
import { getFiles } from "../../../../lib/files-client";
import { getMachine } from "../../../../lib/inventory-client";
import { canManageQrLabels } from "../../../../lib/navigation";
import { listMachineQrLabels } from "../../../../lib/qr-client";
import {
  getPreliminaryHistory,
  getServerProductionWorkDestination,
} from "../../../../lib/production-client";
import { readProtectedRouteData } from "../../../../lib/server-route-state";
import { MachineDetailView } from "./machine-detail-view";

export default async function MachineDetailPage({
  params,
}: Readonly<{ params: Promise<{ machineId: string }> }>) {
  const [{ machineId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const identity = await readProtectedRouteData(
    getCurrentIdentity(fetch, process.env, cookie),
  );
  const [detail, files, qrLabels, preliminaryHistory, workDestination] =
    await readProtectedRouteData(
      Promise.all([
        getMachine(machineId, fetch, process.env, cookie),
        getFiles(
          { type: "machine", id: machineId },
          fetch,
          process.env,
          cookie,
        ),
        listMachineQrLabels(machineId, fetch, process.env, cookie),
        getPreliminaryHistory(machineId, fetch, process.env, cookie),
        roleHasPermission(identity.user.role, "production.work.execute")
          ? getServerProductionWorkDestination(
              machineId,
              fetch,
              process.env,
              cookie,
            )
          : Promise.resolve({ kind: "none" as const }),
      ]),
    );
  return (
    <main className="page-main page-main--wide">
      <MachineDetailView
        initialDetail={detail}
        canManage={roleHasPermission(
          identity.user.role,
          "inventory.machines.manage",
        )}
        canVerify={roleHasPermission(
          identity.user.role,
          "inventory.machines.verify",
        )}
        initialFiles={files}
        canUploadFiles={roleHasPermission(identity.user.role, "files.write")}
        initialQrLabels={qrLabels}
        canManageQrLabels={canManageQrLabels(identity.user.role)}
        initialPreliminaryHistory={preliminaryHistory}
        canManagePreliminary={workDestination.kind === "initial_check"}
        canApproveDisposition={roleHasPermission(
          identity.user.role,
          "production.disposition.approve",
        )}
      />
    </main>
  );
}
