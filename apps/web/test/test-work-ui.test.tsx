// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { TestSession, TestWorkDetail } from "@laundrorama/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const work = vi.hoisted(() => ({
  startTest: vi.fn(),
  createTestSession: vi.fn(),
  addTestSessionOrders: vi.fn(),
  recordTestStep: vi.fn(),
  finishTest: vi.fn(),
  assignTest: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const online = vi.hoisted(() => ({ value: true }));
const files = vi.hoisted(() => ({
  createFileUploadGrant: vi.fn(),
  uploadFileContent: vi.fn(),
  createFileDownloadUrl: vi.fn(),
}));
vi.mock("../src/lib/production-client", () => work);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("../src/app/(protected)/online-status", () => ({
  useOnlineStatus: () => online.value,
}));
vi.mock("../src/lib/files-client", () => files);
import { TestWorkView } from "../src/app/(protected)/work/[orderId]/test-work-view";

const id = "3498c172-93d8-4eca-b0f6-0e70fe03516c";
const time = "2026-09-24T12:00:00.000Z";
function fixture(): TestWorkDetail {
  return {
    order: {
      id,
      machineId: id,
      machineType: "washer",
      state: "testing",
      assignedUserId: "tech",
      activeSessionId: id,
      queuedAt: time,
      startedAt: time,
      completedAt: null,
      version: 2,
    },
    machine: {
      id,
      machineType: "washer",
      manufacturer: "Dexter",
      model: "T-900",
      serial: "W-001",
      voltage: null,
      phase: null,
      fuel: null,
      sourceLoadId: id,
      sourceLoadDisplayName: "Load",
      identityVerificationState: "provisional",
      conflictingMachineId: null,
      inventoryState: "on_hand",
      productionState: "testing",
      version: 3,
      createdAt: time,
      updatedAt: time,
    },
    run: {
      id,
      orderId: id,
      startedByUserId: "tech",
      startedAt: time,
      completedAt: null,
      videoFileId: null,
      template: {
        id,
        machineType: "washer",
        version: 1,
        steps: [
          {
            key: "washer_01",
            position: 0,
            instruction: "Inspect Bearing",
            allowNa: false,
            stopOnFailure: false,
            photoRequired: false,
          },
          {
            key: "washer_14",
            position: 1,
            instruction: "If possible, advance cycle",
            allowNa: true,
            stopOnFailure: false,
            photoRequired: false,
          },
        ],
      },
      results: [],
    },
    claims: [],
  };
}
function session(detail: TestWorkDetail): TestSession {
  return {
    id,
    workerUserId: "tech",
    specialty: "washer",
    state: "active",
    version: 3,
    createdAt: time,
    completedAt: null,
    asOf: time,
    elapsedSeconds: 0,
    unallocatedSeconds: 0,
    items: [{ order: detail, state: "working", allocatedSeconds: 0 }],
    events: [],
  };
}
beforeEach(() => {
  Object.values(work).forEach((mock) => mock.mockReset());
  refresh.mockReset();
  push.mockReset();
  Object.values(files).forEach((mock) => mock.mockReset());
  online.value = true;
});
afterEach(cleanup);

describe("Test Work Order UI", () => {
  it("saves tap results, offers N/A only on permitted steps, and enables Finish after persisted results", async () => {
    const initial = fixture();
    work.recordTestStep.mockImplementation(
      async (
        _id: string,
        _version: number,
        stepKey: string,
        result: string,
      ) => {
        const prior =
          work.recordTestStep.mock.calls.length === 1
            ? []
            : [
                {
                  id,
                  runId: id,
                  stepKey: "washer_01",
                  result: "pass",
                  actorUserId: "tech",
                  fileId: null,
                  createdAt: time,
                },
              ];
        return {
          ...initial,
          order: {
            ...initial.order,
            version: 2 + work.recordTestStep.mock.calls.length,
          },
          run: {
            ...initial.run,
            results: [
              ...prior,
              {
                id: `${work.recordTestStep.mock.calls.length}`,
                runId: id,
                stepKey,
                result,
                actorUserId: "tech",
                fileId: null,
                createdAt: time,
              },
            ],
          },
        };
      },
    );
    work.finishTest.mockResolvedValue({
      ...initial,
      order: { ...initial.order, state: "awaiting_clean", completedAt: time },
      machine: { ...initial.machine, productionState: "awaiting_clean" },
    });
    render(
      <TestWorkView
        initialDetail={initial}
        actorUserId="tech"
        owner={false}
        assignable={[]}
        activeSession={session(initial)}
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "N/A" })).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Finish Test" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Pass" }));
    await waitFor(() =>
      expect(screen.getByText("If possible, advance cycle")).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "N/A" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "N/A" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Private Machine video")).toBeTruthy(),
    );
    expect(
      (screen.getByRole("button", { name: "Finish Test" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const video = new File([Buffer.from("video")], "test.mp4", {
      type: "video/mp4",
    });
    fireEvent.change(screen.getByLabelText("Private Machine video"), {
      target: { files: [video] },
    });
    files.createFileUploadGrant.mockResolvedValue({
      file: { id },
      grant: { token: "grant" },
    });
    files.uploadFileContent.mockResolvedValue({ id, state: "ready" });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Finish Test",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish Test" }));
    await waitFor(() =>
      expect(work.finishTest).toHaveBeenCalledWith(id, 4, 3, id),
    );
  });

  it("resumes at the first unanswered step and blocks offline writes", () => {
    const initial = fixture();
    initial.run!.results = [
      {
        id,
        runId: id,
        stepKey: "washer_01",
        result: "pass",
        actorUserId: "tech",
        fileId: null,
        createdAt: time,
      },
    ];
    online.value = false;
    render(
      <TestWorkView
        initialDetail={initial}
        actorUserId="tech"
        owner={false}
        assignable={[]}
        activeSession={session(initial)}
      />,
    );
    expect(screen.getByText("If possible, advance cycle")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Pass" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Finish Test" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("lets a matching worker reclaim a released in-progress run", async () => {
    const initial = fixture();
    initial.order.assignedUserId = null;
    initial.order.activeSessionId = null;
    work.createTestSession.mockResolvedValue({ id, state: "active" });
    render(
      <TestWorkView
        initialDetail={initial}
        actorUserId="tech"
        owner={false}
        assignable={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Pass" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume in Session" }));
    await waitFor(() =>
      expect(work.createTestSession).toHaveBeenCalledWith([
        { orderId: id, expectedVersion: 2 },
      ]),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/work/session/${id}?machine=${id}`),
    );
  });

  it("requires a selected private Machine photo before recording a photo-required step", async () => {
    const initial = fixture();
    initial.run!.template.steps = [
      {
        key: "washer_photo",
        position: 0,
        instruction: "Capture private Machine photo",
        allowNa: false,
        stopOnFailure: false,
        photoRequired: true,
      },
    ];
    const photoId = "4498c172-93d8-4eca-b0f6-0e70fe03516c";
    files.createFileUploadGrant.mockResolvedValue({
      file: { id: photoId },
      grant: { token: "private-grant" },
    });
    files.uploadFileContent.mockResolvedValue({ id: photoId, state: "ready" });
    work.recordTestStep.mockResolvedValue({
      ...initial,
      order: { ...initial.order, version: 3 },
      run: {
        ...initial.run,
        results: [
          {
            id: photoId,
            runId: id,
            stepKey: "washer_photo",
            result: "pass",
            actorUserId: "tech",
            fileId: photoId,
            createdAt: time,
          },
        ],
      },
    });
    render(
      <TestWorkView
        initialDetail={initial}
        actorUserId="tech"
        owner={false}
        assignable={[]}
        activeSession={session(initial)}
      />,
    );
    expect(
      (screen.getByRole("button", { name: "Pass" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Fail" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const photo = new File(["jpeg"], "machine.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Required private Machine photo"), {
      target: { files: [photo] },
    });
    expect(
      (screen.getByRole("button", { name: "Pass" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Pass" }));
    await waitFor(() =>
      expect(files.createFileUploadGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { type: "machine", id },
          purpose: "production_test_evidence",
          originalFilename: "machine.jpg",
        }),
      ),
    );
    await waitFor(() =>
      expect(files.uploadFileContent).toHaveBeenCalledWith(
        photoId,
        "private-grant",
        photo,
      ),
    );
    await waitFor(() =>
      expect(work.recordTestStep).toHaveBeenCalledWith(
        id,
        2,
        "washer_photo",
        "pass",
        photoId,
      ),
    );
  });
});
