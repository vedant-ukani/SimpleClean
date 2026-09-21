import { createTestEnvironment } from "@simply-clean/test-support";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  approveInventoryImport,
  commitInventoryImport,
  getImportRows,
  uploadInventoryImport,
} from "../src/lib/imports-client";

const timestamp = new Date().toISOString();
const run = {
  id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
  sourceLoadId: "f13fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
  sourceLoadDisplayName: "Legacy inventory",
  state: "staged" as const,
  version: 1,
  originalFilename: "Inventory List.xlsx",
  mediaType:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
  byteCount: 42,
  sha256: "a".repeat(64),
  totalRows: 2,
  readyRows: 1,
  warningRows: 1,
  errorRows: 0,
  approvedRows: 0,
  committedRows: 0,
  failureCode: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

afterEach(() => vi.unstubAllGlobals());

describe("inventory imports client", () => {
  it("stages multipart data and reuses one idempotency key on network retry", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValue(
        new Response(JSON.stringify({ run }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const file = new File(["workbook"], "Inventory List.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(
      uploadInventoryImport(file, run.sourceLoadId),
    ).resolves.toMatchObject({ id: run.id, totalRows: 2 });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const first = fetcher.mock.calls[0]![1]!;
    const second = fetcher.mock.calls[1]![1]!;
    expect(first.body).toBeInstanceOf(FormData);
    expect((first.body as FormData).get("loadId")).toBe(run.sourceLoadId);
    expect(first.headers).not.toHaveProperty("content-type");
    expect((first.headers as Record<string, string>)["idempotency-key"]).toBe(
      (second.headers as Record<string, string>)["idempotency-key"],
    );
  });

  it("forwards row filters and the Owner session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ rows: [], page: 2, pageSize: 50, total: 51 }),
          { status: 200 },
        ),
      );
    await expect(
      getImportRows(
        run.id,
        { classification: "warning", page: 2, pageSize: 50 },
        fetcher,
        createTestEnvironment(),
        "session=cookie",
      ),
    ).resolves.toMatchObject({ page: 2, total: 51 });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        `/imports/${run.id}/rows?classification=warning&page=2&pageSize=50`,
      ),
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "session=cookie" }),
      }),
    );
  });

  it("sends the exact approval selection and version", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          run: { ...run, state: "approved", version: 2, approvedRows: 1 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await approveInventoryImport(run.id, 1, ["row-1"]);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/imports/${run.id}/approve`,
      expect.objectContaining({
        body: JSON.stringify({ expectedVersion: 1, rowIds: ["row-1"] }),
      }),
    );
  });

  it("commits with an idempotency key and validates Machine IDs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          run: {
            ...run,
            state: "committed",
            version: 3,
            approvedRows: 1,
            committedRows: 1,
          },
          machineIds: ["a6ebd4ca-f41a-4e94-a247-b0b359a65d66"],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(commitInventoryImport(run.id, 2)).resolves.toMatchObject({
      machineIds: ["a6ebd4ca-f41a-4e94-a247-b0b359a65d66"],
    });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/imports/${run.id}/commit`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "content-type": "application/json",
          "idempotency-key": expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
        body: JSON.stringify({ expectedVersion: 2 }),
      }),
    );
  });
});
