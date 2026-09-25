// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const decode = vi.hoisted(() => vi.fn());
vi.mock("jsqr", () => ({ default: decode }));

import { QrCameraScanner } from "../src/app/(protected)/scan/qr-camera-scanner";

const token =
  "v1.4498c172-93d8-4eca-b0f6-0e70fe03516c.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";

function camera() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  return { track, stream, getUserMedia };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/scan");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    value: 1920,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    value: 1080,
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(1280 * 720 * 4),
      width: 1280,
      height: 720,
    })),
  } as unknown as CanvasRenderingContext2D);
  decode.mockReset();
  decode.mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("QR camera scanner", () => {
  it("requests the rear camera only after a click and stops on valid capture", async () => {
    const { track, getUserMedia } = camera();
    const onToken = vi.fn();
    render(<QrCameraScanner online busy={false} onToken={onToken} />);
    expect(getUserMedia).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Scan QR code" }));
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    await screen.findByText(/Scanning for a Machine QR label/);
    decode.mockReturnValue({ data: `${window.location.origin}/scan#${token}` });
    await waitFor(() => expect(onToken).toHaveBeenCalledWith(token));
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Live camera preview for Machine QR labels") as HTMLVideoElement).srcObject).toBeNull();
    expect(decode.mock.calls[0]?.[1]).toBe(1280);
    expect(decode.mock.calls[0]?.[2]).toBe(720);
  });

  it("keeps scanning after unrelated content without resolving it", async () => {
    const { track } = camera();
    const onToken = vi.fn();
    decode.mockReturnValue({ data: "https://other.example.test/scan#not-a-token" });
    render(<QrCameraScanner online busy={false} onToken={onToken} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Scan QR code" }));
    await screen.findByText(/not a Laundrorama Machine label/);
    expect(onToken).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Stop camera" }));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Scan QR code" })).toBeTruthy();
  });

  it("shows permission failure and allows retry", async () => {
    const { track, getUserMedia } = camera();
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    render(<QrCameraScanner online busy={false} onToken={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Scan QR code" }));
    expect(await screen.findByText(/Camera access was denied/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Scan QR code" }));
    await screen.findByText(/Scanning for a Machine QR label/);
    await userEvent.setup().click(screen.getByRole("button", { name: "Stop camera" }));
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("explains unsupported media and releases tracks when hidden or unmounted", async () => {
    const { track } = camera();
    const view = render(<QrCameraScanner online busy={false} onToken={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Scan QR code" }));
    await screen.findByText(/Scanning for a Machine QR label/);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(track.stop).toHaveBeenCalledTimes(1);
    view.unmount();

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    render(<QrCameraScanner online busy={false} onToken={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Scan QR code" }));
    expect(await screen.findByText(/Open this same localhost or HTTPS page in Chrome or Safari/)).toBeTruthy();
  });

  it("retries generic video only after a constraint incompatibility", async () => {
    const { getUserMedia, track } = camera();
    getUserMedia.mockRejectedValueOnce(
      new DOMException("unsupported constraint", "OverconstrainedError"),
    );
    render(<QrCameraScanner online busy={false} onToken={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Scan QR code" }));
    await screen.findByText(/Scanning for a Machine QR label/);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1]?.[0]).toEqual({ audio: false, video: true });
    await userEvent.setup().click(screen.getByRole("button", { name: "Stop camera" }));
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("stops after one generic retry and reports a missing camera safely", async () => {
    const { getUserMedia } = camera();
    getUserMedia
      .mockRejectedValueOnce(new DOMException("private constraint", "OverconstrainedError"))
      .mockRejectedValueOnce(new DOMException("private device", "NotFoundError"));
    render(<QrCameraScanner online busy={false} onToken={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Scan QR code" }));
    expect(await screen.findByText(/No camera is available/)).toBeTruthy();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/private constraint|private device/)).toBeNull();
  });

  it.each([
    ["NotFoundError", /No camera is available/],
    ["NotReadableError", /camera is busy or cannot be read/],
    ["SecurityError", /browser cannot access the camera here/],
  ])("shows a safe %s message without generic retry", async (name, message) => {
    const { getUserMedia } = camera();
    getUserMedia.mockRejectedValueOnce(new DOMException("private browser detail", name));
    render(<QrCameraScanner online busy={false} onToken={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Scan QR code" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText(/private browser detail/)).toBeNull();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("stops on decode failure and disables lookup when offline", async () => {
    const { track } = camera();
    decode.mockImplementation(() => {
      throw new Error("decoder failed");
    });
    const view = render(<QrCameraScanner online busy={false} onToken={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Scan QR code" }));
    expect(await screen.findByText(/camera could not scan this label/)).toBeTruthy();
    expect(track.stop).toHaveBeenCalledTimes(1);
    view.rerender(<QrCameraScanner online={false} busy={false} onToken={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Scan QR code" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Reconnect before scanning/)).toBeTruthy();
  });

  it("releases a late stream after unmount without decoding", async () => {
    const { stream, track, getUserMedia } = camera();
    let deliver!: (value: MediaStream) => void;
    getUserMedia.mockReturnValueOnce(
      new Promise<MediaStream>((resolve) => {
        deliver = resolve;
      }),
    );
    const view = render(<QrCameraScanner online busy={false} onToken={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Scan QR code" }));
    view.unmount();
    await act(async () => deliver(stream));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(decode).not.toHaveBeenCalled();
  });
});
