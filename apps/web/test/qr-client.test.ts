import { createTestEnvironment } from "@laundrorama/test-support";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createQrLabel,
  getPrintableQrLabel,
  listMachineQrLabels,
  resolveQrLabel,
  downloadIntakeQrLabelSheet,
  tokenFromPrintedQrValue,
} from "../src/lib/qr-client";
import type { QrRequestError } from "../src/lib/qr-client";

const timestamp = new Date().toISOString();
const machineId = "3498c172-93d8-4eca-b0f6-0e70fe03516c";
const label = {
  id: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
  machineId,
  fallbackCode: "0123456789ABCDEF",
  state: "active" as const,
  version: 1,
  issuedByUserId: "warehouse-1",
  revokedByUserId: null,
  issuedAt: timestamp,
  revokedAt: null,
};
const machine = {
  id: machineId,
  machineType: "washer" as const,
  manufacturer: null,
  model: null,
  serial: null,
  voltage: null,
  phase: null,
  fuel: null,
  sourceLoadId: "f13fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
  sourceLoadDisplayName: "Expected Load",
  identityVerificationState: "provisional" as const,
  conflictingMachineId: null,
  inventoryState: "expected" as const,
  productionState: "not_assessed" as const,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("QR label client", () => {
  it("accepts only a same-origin printed Scan URL with a valid token", () => {
    const token =
      "v1.4498c172-93d8-4eca-b0f6-0e70fe03516c.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
    const origin = "https://platform.example.test";
    expect(tokenFromPrintedQrValue(`${origin}/scan#${token}`, origin)).toBe(
      token,
    );
    for (const value of [
      `/scan#${token}`,
      `https://other.example.test/scan#${token}`,
      `${origin}/machines#${token}`,
      `${origin}/scan?next=1#${token}`,
      `${origin}/scan#not-a-token`,
      `${origin}/scan`,
      ` ${origin}/scan#${token}`,
      "plain text",
    ]) {
      expect(tokenFromPrintedQrValue(value, origin)).toBeUndefined();
    }
  });
  it("validates label history and forwards the server session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ labels: [label] }), { status: 200 }),
      );

    await expect(
      listMachineQrLabels(
        machineId,
        fetcher,
        createTestEnvironment(),
        "session=cookie",
      ),
    ).resolves.toEqual([label]);
    expect(fetcher).toHaveBeenCalledWith(
      `http://localhost:3001/inventory/machines/${machineId}/qr-labels`,
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "session=cookie" }),
      }),
    );
  });

  it("rejects an unrecognized label lifecycle response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ labels: [{ ...label, state: "superseded" }] }),
          { status: 200 },
        ),
      );

    await expect(
      listMachineQrLabels(machineId, fetcher, createTestEnvironment()),
    ).rejects.toThrow();
  });

  it("reuses one idempotency key when label creation retries", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValue(
        new Response(JSON.stringify({ label }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);

    await expect(createQrLabel(machineId)).resolves.toEqual(label);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const first = fetcher.mock.calls[0]![1]!;
    const second = fetcher.mock.calls[1]![1]!;
    expect(first.body).toBe(JSON.stringify({}));
    expect((first.headers as Record<string, string>)["idempotency-key"]).toBe(
      (second.headers as Record<string, string>)["idempotency-key"],
    );
  });

  it("submits a fragment token only in the protected POST body", async () => {
    const token =
      "v1.4498c172-93d8-4eca-b0f6-0e70fe03516c.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          machine,
          identityEvidence: [],
          verificationHistory: [],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(resolveQrLabel({ token })).resolves.toMatchObject({
      machine: { id: machineId },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/inventory/qr-labels/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    );
    expect(fetcher.mock.calls[0]![0]).not.toContain(token);
  });

  it("accepts only an SVG print response for the in-app viewer", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<svg></svg>", {
        status: 200,
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(getPrintableQrLabel(label.id)).resolves.toMatchObject({
      blob: expect.any(Blob),
    });
  });

  it("opens an Intake PDF in a reserved tab and delays Blob URL cleanup", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("%PDF-1.4", {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition":
            'attachment; filename="laundrorama-intake-qr-labels-3.pdf"',
        },
      }),
    );
    const frame = {
      title: "",
      src: "",
      style: { width: "", height: "", border: "" },
    };
    const preview = {
      document: {
        title: "",
        body: { style: { margin: "" }, replaceChildren: vi.fn() },
        createElement: vi.fn(() => frame),
      },
      close: vi.fn(),
    };
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("window", { open: vi.fn(() => preview) });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:sheet"),
      revokeObjectURL,
    });

    await expect(
      downloadIntakeQrLabelSheet("00000000-0000-4000-8000-000000000001"),
    ).resolves.toBe("opened");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/inventory/intake/00000000-0000-4000-8000-000000000001/qr-label-sheet",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          accept: "application/pdf",
          "idempotency-key": expect.any(String),
        }),
      }),
    );
    expect(frame).toMatchObject({
      title: "Laundrorama QR label sheet PDF",
      src: "blob:sheet",
      style: { width: "100vw", height: "100vh", border: "0" },
    });
    expect(preview.document.body.replaceChildren).toHaveBeenCalledWith(frame);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sheet");
  });

  it("downloads the Intake PDF when a preview tab is blocked", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("%PDF-1.4", {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition":
            'attachment; filename="laundrorama-intake-qr-labels-3.pdf"',
        },
      }),
    );
    const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("window", { open: vi.fn(() => null) });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:sheet"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { append: vi.fn() },
    });

    await expect(
      downloadIntakeQrLabelSheet("00000000-0000-4000-8000-000000000001"),
    ).resolves.toBe("downloaded");
    expect(anchor.download).toBe("laundrorama-intake-qr-labels-3.pdf");
    expect(anchor.click).toHaveBeenCalled();
  });

  it("closes the reserved tab and preserves the server error when the sheet fails", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ code: "capacity_required", machineIds: [machineId] }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const preview = {
      document: {
        title: "",
        body: { style: { margin: "" }, replaceChildren: vi.fn() },
        createElement: vi.fn(),
      },
      close: vi.fn(),
    };
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("window", { open: vi.fn(() => preview) });

    await expect(
      downloadIntakeQrLabelSheet("00000000-0000-4000-8000-000000000001"),
    ).rejects.toMatchObject({
      code: "capacity_required",
      machineIds: [machineId],
    } satisfies Partial<QrRequestError>);
    expect(preview.close).toHaveBeenCalled();
  });
});
