// @vitest-environment jsdom

import type {
  AcquisitionLoad,
  IntakeBatchSummary,
} from "@laundrorama/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const inventory = vi.hoisted(() => ({
  createLoad: vi.fn(),
  updateLoad: vi.fn(),
}));
const qr = vi.hoisted(() => ({ downloadIntakeQrLabelSheet: vi.fn() }));
const connectivity = vi.hoisted(() => ({ online: true }));
vi.mock("../src/lib/inventory-client", () => inventory);
vi.mock("../src/lib/qr-client", () => qr);
vi.mock("../src/app/(protected)/online-status", () => ({
  useOnlineStatus: () => connectivity.online,
}));

import { LoadDetailView } from "../src/app/(protected)/loads/[loadId]/load-detail-view";
import { LoadsView } from "../src/app/(protected)/loads/loads-view";
import {
  filterReceivedLoads,
  groupExpectedLoads,
} from "../src/app/(protected)/loads/load-dates";

const load: AcquisitionLoad = {
  id: "f13fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
  displayName: "June load",
  sourceName: "Distributor",
  sourceReference: null,
  expectedArrivalAt: "2026-06-10T00:00:00.000Z",
  receivedAt: null,
  version: 1,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};
const batch: IntakeBatchSummary = {
  id: "5f1fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
  loadId: load.id,
  state: "committed",
  version: 2,
  createdAt: "2026-06-10T10:00:00.000Z",
  updatedAt: "2026-06-10T12:00:00.000Z",
  candidateCount: 3,
  machineCount: 2,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  connectivity.online = true;
});

describe("Load dates", () => {
  it("sorts received Loads newest-first and filters by name and UTC receipt date", () => {
    const received = [
      {
        ...load,
        id: "11111111-1111-4111-8111-111111111111",
        displayName: "Alpha",
        receivedAt: "2026-06-11T23:59:00.000Z",
      },
      {
        ...load,
        id: "22222222-2222-4222-8222-222222222222",
        displayName: "Beta",
        receivedAt: "2026-06-12T00:01:00.000Z",
      },
      load,
    ];
    expect(
      filterReceivedLoads(received, "", "").map(
        ({ displayName }) => displayName,
      ),
    ).toEqual(["Beta", "Alpha"]);
    expect(
      filterReceivedLoads(received, "alp", "2026-06-11").map(
        ({ displayName }) => displayName,
      ),
    ).toEqual(["Alpha"]);
    expect(filterReceivedLoads(received, "beta", "2026-06-11")).toEqual([]);
  });

  it("groups unreceived Loads by UTC arrival date in operational order", () => {
    const loads: AcquisitionLoad[] = [
      {
        ...load,
        id: "11111111-1111-4111-8111-111111111111",
        displayName: "Today Z",
        expectedArrivalAt: "2026-06-10T23:59:59.000Z",
      },
      {
        ...load,
        id: "22222222-2222-4222-8222-222222222222",
        displayName: "Oldest",
        expectedArrivalAt: "2026-06-01T00:00:00.000Z",
      },
      {
        ...load,
        id: "33333333-3333-4333-8333-333333333333",
        displayName: "Soon",
        expectedArrivalAt: "2026-06-11T00:00:00.000Z",
      },
      {
        ...load,
        id: "44444444-4444-4444-8444-444444444444",
        displayName: "No date",
        expectedArrivalAt: null,
      },
      {
        ...load,
        id: "55555555-5555-4555-8555-555555555555",
        displayName: "Received",
        receivedAt: "2026-06-09T00:00:00.000Z",
      },
      {
        ...load,
        id: "66666666-6666-4666-8666-666666666666",
        displayName: "Today A",
        expectedArrivalAt: "2026-06-10T00:00:00.000Z",
      },
    ];
    const groups = groupExpectedLoads(loads, "2026-06-10");
    expect(
      groups.map((group) => [
        group.key,
        group.loads.map((item) => item.displayName),
      ]),
    ).toEqual([
      ["overdue", ["Oldest"]],
      ["today", ["Today A", "Today Z"]],
      ["upcoming", ["Soon"]],
      ["no_date", ["No date"]],
    ]);
  });

  it("shows grouped date/status cards without commercial source data to Warehouse", () => {
    render(
      <LoadsView
        initialLoads={[
          load,
          {
            ...load,
            id: "77777777-7777-4777-8777-777777777777",
            displayName: "Undated",
            expectedArrivalAt: null,
          },
        ]}
        canManage={false}
        expectedOnly
      />,
    );
    expect(
      screen.getByRole("heading", { name: "No arrival date" }),
    ).toBeTruthy();
    expect(screen.getByText("Arrival date not set")).toBeTruthy();
    expect(screen.getAllByText(/Expected:/)).toHaveLength(2);
    expect(screen.queryByText("Distributor")).toBeNull();
    expect(screen.queryByText("Source not recorded")).toBeNull();
  });

  it("shows received history separately and filters it without commercial source fields", async () => {
    render(
      <LoadsView
        initialLoads={[
          load,
          {
            ...load,
            id: batch.id,
            displayName: "Received Alpha",
            sourceReference: "Private reference",
            receivedAt: "2026-06-10T12:00:00.000Z",
          },
        ]}
        canManage={false}
        expectedOnly
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Expected Loads" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Intake History" }),
    ).toBeTruthy();
    expect(screen.getByText("Received Alpha")).toBeTruthy();
    expect(screen.queryByText("Private reference")).toBeNull();
    expect(screen.queryByText("Distributor")).toBeNull();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Load name"), "missing");
    expect(
      screen.getByText("No received Loads match these filters."),
    ).toBeTruthy();
    await user.clear(screen.getByLabelText("Load name"));
    await user.type(screen.getByLabelText("Received date"), "2026-06-10");
    expect(screen.getByText("Received Alpha")).toBeTruthy();
  });

  it("shows clear empty Warehouse history", () => {
    render(<LoadsView initialLoads={[load]} canManage={false} expectedOnly />);
    expect(screen.getByText("No Loads have been received yet.")).toBeTruthy();
  });

  it("keeps the Owner list ungrouped with source provenance", () => {
    render(<LoadsView initialLoads={[load]} canManage />);
    expect(screen.getByText("Distributor")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Overdue" })).toBeNull();
  });

  it("sends the chosen expected date when creating a Load", async () => {
    inventory.createLoad.mockResolvedValue(load);
    render(<LoadsView initialLoads={[]} canManage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Display name"), "June load");
    await user.type(
      screen.getByLabelText("Expected arrival date"),
      "2026-06-10",
    );
    await user.click(screen.getByRole("button", { name: "Create Load" }));
    expect(inventory.createLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedArrivalAt: "2026-06-10T00:00:00.000Z",
      }),
    );
  });

  it("edits or clears the expected date while receipt stays read only", async () => {
    inventory.updateLoad.mockResolvedValue({
      ...load,
      expectedArrivalAt: null,
    });
    render(
      <LoadDetailView
        initialLoad={load}
        initialBatches={[]}
        canManage
        canManageIntake={false}
        canReadIntake={false}
        canPrintIntake={false}
        initialFiles={[]}
        canUploadFiles={false}
      />,
    );
    expect(screen.getByText("Received")).toBeTruthy();
    expect(screen.getByText("Not received yet")).toBeTruthy();
    expect(screen.queryByLabelText("Received")).toBeNull();
    expect(screen.queryByText("Version")).toBeNull();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Expected arrival date"));
    await user.click(screen.getByRole("button", { name: "Save Load" }));
    expect(inventory.updateLoad).toHaveBeenCalledWith(
      load.id,
      expect.objectContaining({ expectedArrivalAt: null, expectedVersion: 1 }),
    );
  });

  it("shows open and committed Batch actions, reprints the whole sheet, and hides Start after receipt", async () => {
    qr.downloadIntakeQrLabelSheet.mockResolvedValue("opened");
    render(
      <LoadDetailView
        initialLoad={{ ...load, receivedAt: "2026-06-10T12:00:00.000Z" }}
        initialBatches={[
          batch,
          {
            ...batch,
            id: "6f1fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
            state: "open",
            machineCount: 0,
          },
        ]}
        canManage={false}
        canManageIntake
        canReadIntake
        canPrintIntake
        initialFiles={[]}
        canUploadFiles={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Start Laundrorama intake" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "View Intake" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Resume Intake" })).toBeTruthy();
    expect(screen.getByText("3 items · 2 Machines")).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Print all QR labels (2)" }));
    expect(qr.downloadIntakeQrLabelSheet).toHaveBeenCalledWith(batch.id);
    expect((await screen.findByRole("status")).textContent).toContain(
      "QR label sheet opened in a new tab.",
    );
  });

  it("disables history actions offline and reports print failure", async () => {
    qr.downloadIntakeQrLabelSheet.mockRejectedValue(new Error("failed"));
    const view = render(
      <LoadDetailView
        initialLoad={load}
        initialBatches={[batch]}
        canManage={false}
        canManageIntake
        canReadIntake
        canPrintIntake
        initialFiles={[]}
        canUploadFiles={false}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Print all QR labels (2)" }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "QR label sheet could not be printed.",
    );
    connectivity.online = false;
    view.rerender(
      <LoadDetailView
        initialLoad={load}
        initialBatches={[batch]}
        canManage={false}
        canManageIntake
        canReadIntake
        canPrintIntake
        initialFiles={[]}
        canUploadFiles={false}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Print all QR labels (2)",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen
        .getByRole("link", { name: "View Intake" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      (
        screen.getByRole("button", {
          name: "Start Laundrorama intake",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
