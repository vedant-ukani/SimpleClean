import { roleHasPermission } from "@simply-clean/contracts";
import { headers } from "next/headers";

import { getCurrentIdentity } from "../../../../lib/identity-client";
import { getFiles } from "../../../../lib/files-client";
import { getLocations, getMachine } from "../../../../lib/inventory-client";
import { MachineDetailView } from "./machine-detail-view";

export default async function MachineDetailPage({
  params,
}: Readonly<{ params: Promise<{ machineId: string }> }>) {
  const [{ machineId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const [identity, detail, locations, files] = await Promise.all([
    getCurrentIdentity(fetch, process.env, cookie),
    getMachine(machineId, fetch, process.env, cookie),
    getLocations(fetch, process.env, cookie),
    getFiles({ type: "machine", id: machineId }, fetch, process.env, cookie),
  ]);
  return (
    <main className="page-main page-main--wide">
      <MachineDetailView
        initialDetail={detail}
        locations={locations}
        canManage={roleHasPermission(
          identity.user.role,
          "inventory.machines.manage",
        )}
        canVerify={roleHasPermission(
          identity.user.role,
          "inventory.machines.verify",
        )}
        canRelocate={roleHasPermission(
          identity.user.role,
          "inventory.machines.relocate",
        )}
        initialFiles={files}
        canUploadFiles={roleHasPermission(identity.user.role, "files.write")}
      />
    </main>
  );
}
