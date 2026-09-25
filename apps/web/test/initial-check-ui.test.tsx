// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Machine } from "@laundrorama/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const work = vi.hoisted(() => ({
  recordInitialCheck: vi.fn(),
  getProductionWorkDestination: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const online = vi.hoisted(() => ({ value: true }));
vi.mock("../src/lib/production-client", () => work);
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("../src/app/(protected)/online-status", () => ({
  useOnlineStatus: () => online.value,
}));
import { InitialCheckView } from "../src/app/(protected)/work/initial-check/[machineId]/initial-check-view";

const id = "3498c172-93d8-4eca-b0f6-0e70fe03516c";
const time = "2026-09-24T12:00:00.000Z";
const machine: Machine = {
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
  productionState: "not_assessed",
  version: 1,
  createdAt: time,
  updatedAt: time,
};
beforeEach(() => {
  online.value = true;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("tap-only initial check", () => {
  it("shows three large choices without typing and starts Test work after a smooth check", async () => {
    work.recordInitialCheck.mockResolvedValue({
      machine: { ...machine, productionState: "awaiting_test" },
    });
    work.getProductionWorkDestination.mockResolvedValue({
      kind: "test",
      orderId: id,
    });
    render(<InitialCheckView machine={machine} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("W-001")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /Smooth/ }));
    await waitFor(() =>
      expect(work.recordInitialCheck).toHaveBeenCalledWith(id, {
        expectedMachineVersion: 1,
        choice: "smooth",
      }),
    );
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(`/work/${id}`),
    );
  });

  it("sends a bearing concern to Owner review and leaves technician work", async () => {
    work.recordInitialCheck.mockResolvedValue({});
    render(<InitialCheckView machine={machine} />);
    fireEvent.click(screen.getByRole("button", { name: /Bearing noise/ }));
    await waitFor(() =>
      expect(work.recordInitialCheck).toHaveBeenCalledWith(id, {
        expectedMachineVersion: 1,
        choice: "bearing_concern",
      }),
    );
    expect(work.getProductionWorkDestination).not.toHaveBeenCalled();
    expect(navigation.push).toHaveBeenCalledWith("/work");
  });

  it("blocks taps while offline", () => {
    online.value = false;
    render(<InitialCheckView machine={machine} />);
    expect(
      screen.getByRole("button", { name: /Unable to assess/ }),
    ).toHaveProperty("disabled", true);
    expect(work.recordInitialCheck).not.toHaveBeenCalled();
  });
});
