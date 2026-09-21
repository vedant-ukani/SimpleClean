// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { AttachmentsPanel } from "../src/app/(protected)/attachments-panel";
import { OnlineStatus } from "../src/app/(protected)/online-status";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
});

describe("shared tablet connectivity state", () => {
  it("announces offline state and disables private upload mutations", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);

    render(
      <>
        <OnlineStatus />
        <AttachmentsPanel
          target={{
            type: "machine",
            id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
          }}
          initialFiles={[]}
          canUpload
        />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByText(/You are offline/)).toBeTruthy(),
    );
    expect(
      screen.getByRole("button", { name: "Upload attachment" }),
    ).toHaveProperty("disabled", true);
  });

  it("refreshes authoritative server data once after reconnection", async () => {
    let online = true;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(
      () => online,
    );
    render(<OnlineStatus />);

    online = false;
    window.dispatchEvent(new Event("offline"));
    await screen.findByText(/You are offline/);
    expect(refresh).not.toHaveBeenCalled();

    online = true;
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
