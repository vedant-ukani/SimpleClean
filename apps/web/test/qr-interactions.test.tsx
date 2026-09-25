// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const qrMocks = vi.hoisted(() => ({
  createQrLabel: vi.fn(),
  getPrintableQrLabel: vi.fn(),
  listMachineQrLabelsInBrowser: vi.fn(),
  reissueQrLabel: vi.fn(),
  resolveQrLabel: vi.fn(),
  revokeQrLabel: vi.fn(),
}));
const activeWork = vi.hoisted(() => ({ getProductionWorkDestination: vi.fn() }));
vi.mock("../src/lib/production-client", () => activeWork);

vi.mock("../src/lib/qr-client", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("../src/lib/qr-client")),
  ...qrMocks,
}));

import { MachineQrPanel } from "../src/app/(protected)/machines/[machineId]/machine-qr-panel";
import { ScanView } from "../src/app/(protected)/scan/scan-view";
import { QrRequestError } from "../src/lib/qr-client";
import { ApiRequestError } from "../src/lib/api-client";

const token =
  "v1.4498c172-93d8-4eca-b0f6-0e70fe03516c.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
const timestamp = "2026-09-21T12:00:00.000Z";
const machineId = "3498c172-93d8-4eca-b0f6-0e70fe03516c";
const detail = {
  machine: {
    id: machineId,
    machineType: "washer" as const,
    manufacturer: "Dexter",
    model: "T-900",
    serial: "SN-100",
    voltage: null,
    phase: null,
    fuel: null,
    sourceLoadId: "f13fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
    sourceLoadDisplayName: "Expected Load",
    identityVerificationState: "provisional" as const,
    conflictingMachineId: null,
    inventoryState: "on_hand" as const,
    productionState: "not_assessed" as const,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  identityEvidence: [],
  verificationHistory: [],
};
const activeLabel = {
  id: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
  machineId,
  fallbackCode: "ABCDEFGHJKMNPQRS",
  state: "active" as const,
  version: 1,
  issuedByUserId: "warehouse-1",
  revokedByUserId: null,
  issuedAt: timestamp,
  revokedAt: null,
};

beforeEach(() => {
  window.history.replaceState(null, "", "/scan");
  for (const mock of Object.values(qrMocks)) mock.mockReset();
  activeWork.getProductionWorkDestination.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("QR interaction UI", () => {
  it("routes an eligible worker from a resolved Machine label to active Test work without claiming it", async () => {
    const navigateToWork = vi.fn();
    qrMocks.resolveQrLabel.mockResolvedValueOnce(detail);
    activeWork.getProductionWorkDestination.mockResolvedValueOnce({ kind: "test", orderId: "4498c172-93d8-4eca-b0f6-0e70fe03516c" });
    render(<ScanView navigateToLogin={vi.fn()} navigateToWork={navigateToWork} canRouteToWork />);
    await userEvent.setup().type(screen.getByLabelText("Enter fallback code"), "ABCDEFGHJKMNPQRS");
    fireEvent.click(screen.getByRole("button", { name: "Look up Machine" }));
    await waitFor(() => expect(navigateToWork).toHaveBeenCalledWith("/work/4498c172-93d8-4eca-b0f6-0e70fe03516c"));
    expect(activeWork.getProductionWorkDestination).toHaveBeenCalledWith(machineId);
  });
  it("routes an unassessed Machine to the tap-only initial check", async () => {
    const navigateToWork = vi.fn();
    qrMocks.resolveQrLabel.mockResolvedValueOnce(detail);
    activeWork.getProductionWorkDestination.mockResolvedValueOnce({ kind: "initial_check", machineId });
    render(<ScanView navigateToLogin={vi.fn()} navigateToWork={navigateToWork} canRouteToWork />);
    await userEvent.setup().type(screen.getByLabelText("Enter fallback code"), "ABCDEFGHJKMNPQRS");
    fireEvent.click(screen.getByRole("button", { name: "Look up Machine" }));
    await waitFor(() => expect(navigateToWork).toHaveBeenCalledWith(`/work/initial-check/${machineId}`));
  });
  it("shows an error when active-work lookup fails instead of ordinary Machine lookup", async () => {
    qrMocks.resolveQrLabel.mockResolvedValueOnce(detail);
    activeWork.getProductionWorkDestination.mockRejectedValueOnce(new ApiRequestError(404));
    render(<ScanView navigateToLogin={vi.fn()} navigateToWork={vi.fn()} canRouteToWork />);
    await userEvent.setup().type(screen.getByLabelText("Enter fallback code"), "ABCDEFGHJKMNPQRS");
    fireEvent.click(screen.getByRole("button", { name: "Look up Machine" }));
    expect(await screen.findByText(/active Test work could not be checked/)).toBeTruthy();
    expect(screen.queryByText("Machine found")).toBeNull();
  });
  it("clears the fragment, auto-resolves it, and renders loading then success", async () => {
    let finish!: (value: typeof detail) => void;
    qrMocks.resolveQrLabel.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    window.history.replaceState(null, "", `/scan#${token}`);

    render(<ScanView navigateToLogin={vi.fn()} />);
    await waitFor(() =>
      expect(qrMocks.resolveQrLabel).toHaveBeenCalledWith({ token }),
    );
    expect(window.location.hash).toBe("");
    expect(screen.getByText("Looking up equipment…")).toBeTruthy();

    finish(detail);
    expect(await screen.findByText(/Dexter T-900/)).toBeTruthy();
    expect(screen.getByText("SN-100")).toBeTruthy();
  });

  it("normalizes manual entry and renders lookup failures", async () => {
    const user = userEvent.setup();
    qrMocks.resolveQrLabel.mockResolvedValueOnce(detail);
    const view = render(<ScanView navigateToLogin={vi.fn()} />);
    await user.type(
      screen.getByLabelText("Enter fallback code"),
      "abcd-efgh jkmnpqrs",
    );
    await user.click(screen.getByRole("button", { name: "Look up Machine" }));
    await waitFor(() =>
      expect(qrMocks.resolveQrLabel).toHaveBeenCalledWith({
        fallbackCode: "ABCDEFGHJKMNPQRS",
      }),
    );
    expect(await screen.findByText(/Dexter T-900/)).toBeTruthy();

    view.unmount();
    window.history.replaceState(null, "", `/scan#${token}`);
    qrMocks.resolveQrLabel.mockRejectedValueOnce(new QrRequestError(404));
    render(<ScanView navigateToLogin={vi.fn()} />);
    expect(
      await screen.findByText(/not valid or is no longer active/),
    ).toBeTruthy();
  });

  it("preserves a scanned token through sign-in when the session is missing", async () => {
    const navigateToLogin = vi.fn();
    window.history.replaceState(null, "", `/scan#${token}`);
    qrMocks.resolveQrLabel.mockRejectedValueOnce(new QrRequestError(401));
    render(<ScanView navigateToLogin={navigateToLogin} />);
    await waitFor(() =>
      expect(navigateToLogin).toHaveBeenCalledWith(`/login#${token}`),
    );
  });

  it("views and explicitly prints the label without downloading it", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => "blob:printed-label");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }),
    );
    qrMocks.getPrintableQrLabel.mockResolvedValue({
      blob: new Blob(["<svg></svg>"], { type: "image/svg+xml" }),
    });
    const view = render(
      <MachineQrPanel machineId={machineId} initialLabels={[activeLabel]} canManage />,
    );
    await user.click(screen.getByRole("button", { name: "View / Print" }));
    await waitFor(() =>
      expect(qrMocks.getPrintableQrLabel).toHaveBeenCalledWith(activeLabel.id),
    );
    const preview = await screen.findByTitle("Printable Machine QR label preview");
    expect(preview.getAttribute("src")).toBe("blob:printed-label");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Print label" }).hasAttribute("disabled")).toBe(true);
    fireEvent.load(preview);
    const print = vi.fn();
    const focus = vi.fn();
    const frameWindow = (preview as HTMLIFrameElement).contentWindow!;
    vi.spyOn(frameWindow, "print").mockImplementation(print);
    vi.spyOn(frameWindow, "focus").mockImplementation(focus);
    await user.click(screen.getByRole("button", { name: "Print label" }));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a[download]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:printed-label");
    expect(screen.queryByTitle("Printable Machine QR label preview")).toBeNull();
    view.unmount();
  });

  it("revokes replaced and unmounted label previews", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn()
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }),
    );
    qrMocks.getPrintableQrLabel.mockResolvedValue({
      blob: new Blob(["<svg></svg>"], { type: "image/svg+xml" }),
    });
    const view = render(
      <MachineQrPanel machineId={machineId} initialLabels={[activeLabel]} canManage />,
    );
    await user.click(screen.getByRole("button", { name: "View / Print" }));
    await screen.findByTitle("Printable Machine QR label preview");
    await user.click(screen.getByRole("button", { name: "View / Print" }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(2));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second");
  });

  it("keeps management controls usable when the printable label cannot load", async () => {
    qrMocks.getPrintableQrLabel.mockRejectedValueOnce(new Error("private failure"));
    render(
      <MachineQrPanel machineId={machineId} initialLabels={[activeLabel]} canManage />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "View / Print" }));
    expect(await screen.findByText(/printable label could not be opened/)).toBeTruthy();
    expect(screen.queryByTitle("Printable Machine QR label preview")).toBeNull();
    expect(screen.getByRole("button", { name: "View / Print" })).toBeTruthy();
    expect(screen.queryByText(/private failure/)).toBeNull();
  });

  it("drives create, revoke, and reissue management actions", async () => {
    const user = userEvent.setup();
    qrMocks.createQrLabel.mockResolvedValue(activeLabel);
    qrMocks.revokeQrLabel.mockResolvedValue({
      ...activeLabel,
      state: "revoked",
      version: 2,
      revokedByUserId: "warehouse-1",
      revokedAt: timestamp,
    });
    qrMocks.reissueQrLabel.mockResolvedValue({
      ...activeLabel,
      id: "b6ebd4ca-f41a-4e94-a247-b0b359a65d66",
      version: 2,
    });
    qrMocks.listMachineQrLabelsInBrowser.mockResolvedValue([activeLabel]);

    const empty = render(
      <MachineQrPanel machineId={machineId} initialLabels={[]} canManage />,
    );
    await user.click(screen.getByRole("button", { name: "Create label" }));
    await waitFor(() =>
      expect(qrMocks.createQrLabel).toHaveBeenCalledWith(machineId),
    );
    empty.unmount();

    render(
      <MachineQrPanel
        machineId={machineId}
        initialLabels={[activeLabel]}
        canManage
      />,
    );
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() =>
      expect(qrMocks.revokeQrLabel).toHaveBeenCalledWith(activeLabel.id, 1),
    );
    await user.click(screen.getByRole("button", { name: "Reissue" }));
    await waitFor(() =>
      expect(qrMocks.reissueQrLabel).toHaveBeenCalledWith(
        machineId,
        activeLabel.id,
        1,
      ),
    );
  });
});
