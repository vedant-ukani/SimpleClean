// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type {
  Machine,
  PreliminaryInspectionHistoryResponse,
} from "@laundrorama/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

const mutations = vi.hoisted(() => ({ create: vi.fn(), finalize: vi.fn() }));
vi.mock("../src/lib/production-client", () => ({
  createPreliminaryInspection: mutations.create,
  finalizePreliminaryDisposition: mutations.finalize,
}));
vi.mock("../src/lib/files-client", () => ({ createFileDownloadUrl: vi.fn() }));

import { PreliminaryInspectionPanel } from "../src/app/(protected)/machines/[machineId]/preliminary-inspection-panel";

const id = "3498c172-93d8-4eca-b0f6-0e70fe03516c";
const time = "2026-09-24T12:00:00.000Z";
const machine: Machine = {
  id,
  machineType: "washer",
  manufacturer: "Speed Queen",
  model: "SC30",
  serial: "PROD-001",
  voltage: null,
  phase: null,
  fuel: null,
  sourceLoadId: id,
  sourceLoadDisplayName: "Load",
  identityVerificationState: "provisional",
  conflictingMachineId: null,
  inventoryState: "on_hand",
  productionState: "not_assessed",
  version: 1,
  createdAt: time,
  updatedAt: time,
};
const initial: PreliminaryInspectionHistoryResponse = {
  machine,
  inspections: [],
  decisions: [],
  currentDisposition: null,
};
const file = {
  id: "4498c172-93d8-4eca-b0f6-0e70fe03516c",
  target: { type: "machine" as const, id },
  purpose: "preliminary_inspection" as const,
  originalFilename: "bearing.jpg",
  declaredMediaType: "image/jpeg" as const,
  detectedMediaType: "image/jpeg" as const,
  declaredByteCount: 4,
  byteCount: 4,
  sha256: "f".repeat(64),
  uploaderUserId: "worker",
  state: "ready" as const,
  failureCode: null,
  version: 2,
  createdAt: time,
  updatedAt: time,
};
const review: PreliminaryInspectionHistoryResponse = {
  machine: { ...machine, productionState: "blocked", version: 2 },
  inspections: [
    {
      id: "5498c172-93d8-4eca-b0f6-0e70fe03516c",
      machineId: id,
      condition: "Drum turns",
      bearingAssessment: "concern_observed",
      bearingNotes: "Noise",
      missingParts: "Coin box key",
      damage: "Dented side",
      recommendation: "parts_only",
      recommendationReason: "Economic review",
      inspectedByUserId: "worker",
      requestId: "req-1",
      createdAt: time,
      evidence: [file],
    },
  ],
  decisions: [
    {
      id: "6498c172-93d8-4eca-b0f6-0e70fe03516c",
      machineId: id,
      inspectionId: "5498c172-93d8-4eca-b0f6-0e70fe03516c",
      disposition: "owner_review",
      reason: "Economic review",
      decidedByUserId: "worker",
      approvedByUserId: null,
      requestId: "req-1",
      machineVersion: 2,
      createdAt: time,
    },
  ],
  currentDisposition: null,
};
review.currentDisposition = review.decisions[0] ?? null;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true,
  });
});

describe("Preliminary Inspection panel", () => {
  it.each([
    "preliminary_passed",
    "awaiting_test",
    "testing",
    "awaiting_repair",
    "awaiting_clean",
  ] as const)("hides manual inspection after %s", (productionState) => {
    render(
      <PreliminaryInspectionPanel
        machine={{ ...machine, productionState }}
        history={initial}
        files={[]}
        canManage
        canApprove
        onRecorded={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Condition observed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Record inspection" })).toBeNull();
  });

  it("shows history to readers and Owner controls only to approvers", () => {
    const read = render(
      <PreliminaryInspectionPanel
        machine={review.machine}
        history={review}
        files={[file]}
        canManage={false}
        canApprove={false}
        onRecorded={vi.fn()}
      />,
    );
    expect(screen.getByText(/Condition: Drum turns/)).toBeTruthy();
    expect(screen.getByText(/Bearing: Concern observed/)).toBeTruthy();
    expect(screen.getByText("bearing.jpg")).toBeTruthy();
    const history = screen.getByText("Inspection and decision history").closest("details");
    expect(history?.hasAttribute("open")).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Record Owner decision" }),
    ).toBeNull();
    read.unmount();
    render(
      <PreliminaryInspectionPanel
        machine={review.machine}
        history={review}
        files={[file]}
        canManage
        canApprove
        onRecorded={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Record Owner decision" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Condition observed")).toBeNull();
  });

  it("offers the tap-only initial check without a manual form", () => {
    render(
      <PreliminaryInspectionPanel
        machine={machine}
        history={initial}
        files={[
          file,
          {
            ...file,
            id: "7498c172-93d8-4eca-b0f6-0e70fe03516c",
            state: "pending_upload",
          },
        ]}
        canManage
        canApprove={false}
        onRecorded={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: "Open initial check" }).getAttribute("href")).toBe(`/work/initial-check/${id}`);
    expect(screen.queryByLabelText("Condition observed")).toBeNull();
  });

  it("gates mutations offline", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    render(
      <PreliminaryInspectionPanel
        machine={machine}
        history={initial}
        files={[]}
        canManage
        canApprove={false}
        onRecorded={vi.fn()}
      />,
    );
    fireEvent(window, new Event("offline"));
    expect(screen.getByRole("link", { name: "Open initial check" })).toBeTruthy();
  });
});
