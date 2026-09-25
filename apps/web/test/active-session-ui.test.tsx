// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  TestQueueResponse,
  TestSession,
  TestWorkDetail,
} from "@laundrorama/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createTestSession: vi.fn(),
  addTestSessionOrders: vi.fn(),
  changeTestSessionState: vi.fn(),
  changeTestSessionItemState: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("../src/lib/production-client", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("../src/app/(protected)/online-status", () => ({
  useOnlineStatus: () => true,
}));

import { WorkQueueView } from "../src/app/(protected)/work/work-queue-view";
import { SessionView } from "../src/app/(protected)/work/session/[sessionId]/session-view";

const id = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";
const asOf = "2026-09-25T12:00:00.000Z";
const detail = {
  order: {
    id: orderId,
    machineId: id,
    machineType: "washer",
    state: "queued",
    assignedUserId: null,
    queuedAt: asOf,
    startedAt: null,
    completedAt: null,
    version: 1,
    activeSessionId: null,
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
    productionState: "awaiting_test",
    version: 1,
    createdAt: asOf,
    updatedAt: asOf,
  },
  run: null,
  claims: [],
  initialBearingCheck: null,
} as TestWorkDetail;
function session(): TestSession {
  return {
    id,
    workerUserId: "tech",
    specialty: "washer",
    state: "active",
    version: 1,
    createdAt: asOf,
    completedAt: null,
    asOf,
    elapsedSeconds: 62,
    unallocatedSeconds: 2,
    items: [{ order: detail, state: "working", allocatedSeconds: 60 }],
    events: [],
  };
}
beforeEach(() => {
  Object.values(actions).forEach((mock) => mock.mockReset());
  Object.values(navigation).forEach((mock) => mock.mockReset());
});
afterEach(cleanup);

describe("active Test session UI", () => {
  it("selects available Tests into one group", async () => {
    const queue = {
      specialties: ["washer"],
      initialChecks: [],
      orders: [detail],
      myActiveMachines: [],
      availableTests: [detail],
      activeSession: null,
      otherMachineCount: 0,
    } as TestQueueResponse;
    actions.createTestSession.mockResolvedValue(session());
    render(<WorkQueueView initialQueue={queue} owner={false} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Add to group" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Start Session with 1 Machines" }),
    );
    await waitFor(() =>
      expect(actions.createTestSession).toHaveBeenCalledWith([
        { orderId, expectedVersion: 1 },
      ]),
    );
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(`/work/session/${id}`),
    );
  });
  it("shows a server-derived timer, Machine status controls, and QR highlight", async () => {
    const current = session();
    actions.changeTestSessionItemState.mockResolvedValue({
      ...current,
      version: 2,
      items: [{ ...current.items[0]!, state: "waiting" }],
    });
    render(
      <SessionView
        initialSession={current}
        owner={false}
        highlightMachineId={id}
      />,
    );
    expect(screen.getByLabelText("Total elapsed time").textContent).toBe(
      "00:01:02",
    );
    expect(screen.getByText("Unallocated time: 00:00:02")).toBeTruthy();
    expect(document.querySelector(".session-machine--highlight")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Waiting" }));
    await waitFor(() =>
      expect(actions.changeTestSessionItemState).toHaveBeenCalledWith(
        id,
        orderId,
        1,
        "waiting",
      ),
    );
  });
  it("keeps Owner inspection read-only", () => {
    render(<SessionView initialSession={session()} owner={true} />);
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Waiting" })).toBeNull();
  });
});
