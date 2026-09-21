import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MachineDetailView } from "../src/app/(protected)/machines/[machineId]/machine-detail-view";
import { MachineIdentityStatus } from "../src/app/(protected)/machines/machine-labels";
import { LoadsView } from "../src/app/(protected)/loads/loads-view";

const timestamp = new Date().toISOString();
const machine = {
  id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
  machineType: "washer" as const,
  manufacturer: null,
  model: null,
  serial: null,
  voltage: null,
  phase: null,
  fuel: null,
  sourceLoadId: "f13fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
  sourceLoadDisplayName: "Expected Load",
  currentLocationId: null,
  currentLocationCode: null,
  currentLocationName: null,
  identityVerificationState: "provisional" as const,
  conflictingMachineId: null,
  inventoryState: "expected" as const,
  productionState: "not_started" as const,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("inventory UI", () => {
  it("shows only unreceived Loads in the warehouse expected view", () => {
    const baseLoad = {
      id: "f13fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
      displayName: "Still expected",
      sourceName: null,
      sourceReference: null,
      expectedArrivalAt: null,
      receivedAt: null,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const markup = renderToStaticMarkup(
      <LoadsView
        initialLoads={[
          baseLoad,
          {
            ...baseLoad,
            id: "6a93d79e-f4ad-4ce8-9b7c-9ccb6e51c248",
            displayName: "Already received",
            receivedAt: timestamp,
          },
        ]}
        canManage={false}
        expectedOnly
      />,
    );
    expect(markup).toContain("Expected Loads");
    expect(markup).toContain("Still expected");
    expect(markup).not.toContain("Already received");
  });

  it("labels unknown facts and provisional identity explicitly", () => {
    const markup = renderToStaticMarkup(
      <MachineDetailView
        initialDetail={{
          machine,
          identityEvidence: [],
          verificationHistory: [],
          locationHistory: [],
        }}
        locations={[]}
        canManage={false}
        canVerify={false}
        canRelocate={false}
        initialFiles={[]}
        canUploadFiles={false}
        initialQrLabels={[]}
        canManageQrLabels={false}
      />,
    );
    expect(markup).toContain("Not recorded");
    expect(markup).toContain("Provisional identity — not verified");
    expect(markup).toContain("QR label");
    expect(markup).toContain("No active QR label");
    expect(markup).not.toContain("Save identity evidence");
  });

  it("renders a conflict and authorized Machine actions", () => {
    const conflictId = "a6ebd4ca-f41a-4e94-a247-b0b359a65d66";
    const markup = renderToStaticMarkup(
      <>
        <MachineIdentityStatus
          machine={{
            ...machine,
            identityVerificationState: "conflict",
            conflictingMachineId: conflictId,
          }}
        />
        <MachineDetailView
          initialDetail={{
            machine,
            identityEvidence: [],
            verificationHistory: [],
            locationHistory: [],
          }}
          locations={[]}
          canManage
          canVerify
          canRelocate
          initialFiles={[]}
          canUploadFiles
          initialQrLabels={[]}
          canManageQrLabels
        />
      </>,
    );
    expect(markup).toContain(`Identity conflict with ${conflictId}`);
    expect(markup).toContain("Save identity evidence");
    expect(markup).toContain("Verify identity");
    expect(markup).toContain("Record relocation");
  });
});
