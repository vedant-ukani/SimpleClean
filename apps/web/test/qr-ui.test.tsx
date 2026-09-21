import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MachineQrPanel } from "../src/app/(protected)/machines/[machineId]/machine-qr-panel";
import {
  ScanResult,
  ScanView,
  scanFailureState,
} from "../src/app/(protected)/scan/scan-view";
import {
  fallbackCodeForLookup,
  scanReturnPathFromLoginHash,
  tokenFromFragment,
} from "../src/lib/qr-client";

const timestamp = new Date().toISOString();
const machine = {
  id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
  machineType: "washer" as const,
  manufacturer: "Dexter",
  model: "T-900",
  serial: "SN-100",
  voltage: "240V",
  phase: "single_phase" as const,
  fuel: "electric" as const,
  sourceLoadId: "f13fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
  sourceLoadDisplayName: "Expected Load",
  currentLocationId: null,
  currentLocationCode: "A-01",
  currentLocationName: "Warehouse A",
  identityVerificationState: "verified" as const,
  conflictingMachineId: null,
  inventoryState: "on_hand" as const,
  productionState: "not_started" as const,
  version: 2,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const labels = [
  {
    id: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
    machineId: machine.id,
    fallbackCode: "ABCDEFGHJKMNPQRS",
    state: "active" as const,
    version: 1,
    issuedByUserId: "warehouse-1",
    revokedByUserId: null,
    issuedAt: timestamp,
    revokedAt: null,
  },
  {
    id: "6698c172-93d8-4eca-b0f6-0e70fe03516c",
    machineId: machine.id,
    fallbackCode: "23456789BCDEFGHJ",
    state: "revoked" as const,
    version: 2,
    issuedByUserId: "owner-1",
    revokedByUserId: "owner-1",
    issuedAt: timestamp,
    revokedAt: timestamp,
  },
];

describe("QR label UI", () => {
  it("extracts an opaque fragment and normalizes human-entered fallback codes", () => {
    const token =
      "v1.4498c172-93d8-4eca-b0f6-0e70fe03516c.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
    expect(tokenFromFragment(`#${token}`)).toBe(token);
    expect(tokenFromFragment("#%E0%A4%A")).toBeUndefined();
    expect(tokenFromFragment("#v1.label.signature_part")).toBeUndefined();
    expect(scanReturnPathFromLoginHash(`#${token}`)).toBe(`/scan#${token}`);
    expect(fallbackCodeForLookup(" abcd-efgh jkmnpqrs ")).toBe(
      "ABCDEFGHJKMNPQRS",
    );
    expect(scanFailureState({ status: 404 })).toBe("invalid");
    expect(scanFailureState({ status: 403 })).toBe("forbidden");
    expect(scanFailureState(new TypeError("network interrupted"))).toBe(
      "error",
    );
  });

  it("shows active and historical label state with guarded management actions", () => {
    const managed = renderToStaticMarkup(
      <MachineQrPanel
        machineId={machine.id}
        initialLabels={labels}
        canManage
      />,
    );
    expect(managed).toContain("ABCDEFGHJKMNPQRS");
    expect(managed).toContain("Active label");
    expect(managed).toContain("Label history");
    expect(managed).toContain("Download / Print");
    expect(managed).toContain("Revoke");
    expect(managed).toContain("Reissue");

    const readOnly = renderToStaticMarkup(
      <MachineQrPanel
        machineId={machine.id}
        initialLabels={labels}
        canManage={false}
      />,
    );
    expect(readOnly).toContain("Active label");
    expect(readOnly).not.toContain("Download / Print");
    expect(readOnly).not.toContain(">Revoke<");
    expect(readOnly).not.toContain(">Reissue<");
  });

  it("offers touch-friendly manual entry and renders distinct result states", () => {
    const entry = renderToStaticMarkup(<ScanView />);
    expect(entry).toContain("Scan equipment label");
    expect(entry).toContain("Enter fallback code");
    expect(entry).toContain('autoComplete="off"');

    const loading = renderToStaticMarkup(<ScanResult state="loading" />);
    expect(loading).toContain("Looking up equipment");

    const invalid = renderToStaticMarkup(<ScanResult state="invalid" />);
    expect(invalid).toContain("not valid or is no longer active");

    const forbidden = renderToStaticMarkup(<ScanResult state="forbidden" />);
    expect(forbidden).toContain("permission");

    const success = renderToStaticMarkup(
      <ScanResult
        state="success"
        detail={{
          machine,
          identityEvidence: [],
          verificationHistory: [],
          locationHistory: [],
        }}
      />,
    );
    expect(success).toContain("Dexter T-900");
    expect(success).toContain("SN-100");
    expect(success).toContain("A-01");
    expect(success).toContain(`/machines/${machine.id}`);
  });
});
