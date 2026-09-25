import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MachineDetailView } from "../src/app/(protected)/machines/[machineId]/machine-detail-view";
import { MachineIdentityStatus } from "../src/app/(protected)/machines/machine-labels";
import { MachinesView } from "../src/app/(protected)/machines/machines-view";
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
  identityVerificationState: "provisional" as const,
  conflictingMachineId: null,
  inventoryState: "expected" as const,
  productionState: "not_assessed" as const,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("inventory UI", () => {
  it("pages all Machines while preserving the search query", () => {
    const results = {
      machines: [{ ...machine, capacityLb: null }],
      page: 2,
      pageSize: 25,
      total: 188,
    };
    const markup = renderToStaticMarkup(
      <MachinesView initialResults={results} initialQuery="Dexter washer" />,
    );
    expect(markup).toContain('aria-label="Machines pagination"');
    expect(markup).toContain("Page 2 of 8");
    expect(markup).toContain('href="/machines?query=Dexter+washer"');
    expect(markup).toContain('href="/machines?query=Dexter+washer&amp;page=3"');
  });

  it("omits unavailable page links at the boundaries", () => {
    const results = {
      machines: [{ ...machine, capacityLb: null }],
      page: 1,
      pageSize: 25,
      total: 26,
    };
    const first = renderToStaticMarkup(
      <MachinesView initialResults={results} initialQuery="" />,
    );
    expect(first).not.toContain("Previous page");
    expect(first).toContain('href="/machines?page=2"');
    const last = renderToStaticMarkup(
      <MachinesView initialResults={{ ...results, page: 2 }} initialQuery="" />,
    );
    expect(last).toContain('href="/machines"');
    expect(last).not.toContain("Next page");
    const single = renderToStaticMarkup(
      <MachinesView
        initialResults={{ ...results, total: 1 }}
        initialQuery=""
      />,
    );
    expect(single).not.toContain("Machines pagination");
  });

  it("renders searchable Machines as single linked rows without identity status", () => {
    const markup = renderToStaticMarkup(
      <MachinesView
        initialResults={{
          machines: [
            { ...machine, model: "SC30", capacityLb: null },
            {
              ...machine,
              id: "4498c172-93d8-4eca-b0f6-0e70fe03516c",
              identityVerificationState: "verified",
              capacityLb: 30,
            },
            {
              ...machine,
              id: "5498c172-93d8-4eca-b0f6-0e70fe03516c",
              identityVerificationState: "conflict",
              conflictingMachineId: machine.id,
              capacityLb: null,
            },
          ],
          page: 1,
          pageSize: 25,
          total: 3,
        }}
        initialQuery="serial-123"
      />,
    );
    expect(markup).toContain("Search Machines");
    expect(markup).toContain(
      'placeholder="ID, manufacturer, model, serial, or load"',
    );
    expect(markup).toContain('value="serial-123"');
    expect(markup).toContain(
      'class="sr-only" id="machines-results-heading">3 Machines</h2>',
    );
    expect(markup).toContain(`/machines/${machine.id}`);
    expect(markup.match(/<a /g)).toHaveLength(3);
    expect(markup).toContain("Type / Capacity");
    expect(markup).toContain("Model Number");
    expect(markup).toContain("SC30");
    expect(markup).not.toContain("Location");
    expect(markup).toContain("Washer · 30 lb");
    expect(markup).not.toContain("Capacity unknown");
    expect(markup).not.toContain("View Machine");
    expect(markup).not.toContain("Identity needs confirmation");
    expect(markup).not.toContain("Identity confirmed");
    expect(markup).not.toContain("Identity conflict");
    expect(markup).not.toContain("Create provisional Machine");
    expect(markup).not.toContain("Create Machine");
  });

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
        }}
        canManage={false}
        canVerify={false}
        initialFiles={[]}
        canUploadFiles={false}
        initialQrLabels={[]}
        canManageQrLabels={false}
        initialPreliminaryHistory={{
          machine,
          inspections: [],
          decisions: [],
          currentDisposition: null,
        }}
        canManagePreliminary={false}
        canApproveDisposition={false}
      />,
    );
    expect(markup).toContain("Not recorded");
    expect(markup).toContain("Identity needs confirmation");
    expect(markup).not.toContain(machine.id);
    expect(markup).not.toContain("Record history");
    expect(markup).toContain("QR label");
    expect(markup).not.toContain("<dt>Version</dt>");
    expect(markup).toContain("No active QR label");
    expect(markup).not.toContain("Save machine identity");
    expect(markup).not.toContain("Location");
    expect(markup).not.toContain("relocation");
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
          }}
          canManage
          canVerify
          initialFiles={[]}
          canUploadFiles
          initialQrLabels={[]}
          canManageQrLabels
          initialPreliminaryHistory={{
            machine,
            inspections: [],
            decisions: [],
            currentDisposition: null,
          }}
          canManagePreliminary
          canApproveDisposition
        />
      </>,
    );
    expect(markup).toContain(`Identity conflict with ${conflictId}`);
    expect(markup).toContain("Save machine identity");
    expect(markup).toContain("Confirm identity");
    expect(markup).not.toContain("Record relocation");
  });
});
