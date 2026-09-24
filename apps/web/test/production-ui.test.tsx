// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  Machine,
  PreliminaryInspectionHistoryResponse,
} from "@simply-clean/contracts";
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
  currentLocationId: null,
  currentLocationCode: null,
  currentLocationName: null,
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
    expect(screen.getByLabelText("Condition observed")).toBeTruthy();
  });

  it("selects ready Machine evidence, records observations, and recovers after failure", async () => {
    const onRecorded = vi.fn();
    mutations.create
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(review);
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
        onRecorded={onRecorded}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Condition observed"), "Drum turns");
    await user.type(
      screen.getByLabelText("Reason for recommendation"),
      "Economic review",
    );
    await user.click(screen.getByRole("checkbox", { name: "bearing.jpg" }));
    await user.click(screen.getByRole("button", { name: "Record inspection" }));
    await waitFor(() =>
      expect(screen.getByText(/could not be saved/)).toBeTruthy(),
    );
    await user.click(screen.getByRole("button", { name: "Record inspection" }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith(review));
    expect(mutations.create).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ evidenceFileIds: [file.id] }),
      expect.any(String),
    );
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
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Record inspection" }),
      ).toHaveProperty("disabled", true),
    );
  });
});
