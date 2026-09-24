import { afterEach, describe, expect, it, vi } from "vitest";

import {
  commitIntakeBatch,
  prepareIntakeItem,
  changeIntakeCandidateType,
  commitIntakeCandidate,
  getIntakeRecognition,
  getIntakeBatch,
  intakePreviewUrl,
  requestIntakeRecognition,
  submitIntakeRecaptureEvidence,
} from "../src/lib/intake-client";

const id = "00000000-0000-4000-8000-000000000001";
const timestamp = new Date().toISOString();
const detail = {
  batch: {
    id,
    loadId: "00000000-0000-4000-8000-000000000002",
    state: "open" as const,
    destinationLocationId: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  photos: [],
  candidates: [],
  machineMappings: [],
};

afterEach(() => vi.unstubAllGlobals());

describe("Intake browser client", () => {
  it("uses the server API base and forwards the session cookie during SSR", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(detail), { status: 200 }));
    await expect(
      getIntakeBatch(
        id,
        fetcher,
        {
          API_BASE_URL: "http://api.example.test",
          NODE_ENV: "test",
        },
        "session=abc",
      ),
    ).resolves.toEqual(detail);
    expect(fetcher).toHaveBeenCalledWith(
      `http://api.example.test/inventory/intake/${id}`,
      expect.objectContaining({
        headers: { accept: "application/json", cookie: "session=abc" },
      }),
    );
  });

  it("uses an idempotent browser mutation and keeps preview grants private", async () => {
    const committed = {
      batch: {
        ...detail.batch,
        state: "committed" as const,
        destinationLocationId: "00000000-0000-4000-8000-000000000003",
        version: 2,
      },
      machines: [id],
      mappings: [{ candidateId: id, machineId: id }],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(committed), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ machines: [id] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(commitIntakeBatch(id, 1)).resolves.toEqual(committed);
    await expect(commitIntakeBatch(id, 1)).rejects.toThrow();
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `/api/inventory/intake/${id}/commit`,
    );
    expect(fetcher.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.objectContaining({
          "idempotency-key": expect.any(String),
        }),
      }),
    );
    expect(intakePreviewUrl(id, "token")).toBe(
      `/api/files/${id}/preview-content?grant=token`,
    );
  });

  it("reads and mutates recognition through the protected lifecycle routes", async () => {
    const status = {
      enabled: true,
      latestRun: null,
      recaptures: [],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(status), { status: 200 })),
      );
    await expect(
      getIntakeRecognition(
        id,
        fetcher,
        { API_BASE_URL: "http://api.example.test", NODE_ENV: "test" },
        "session=abc",
      ),
    ).resolves.toEqual(status);
    vi.stubGlobal("fetch", fetcher);
    await requestIntakeRecognition(id, 4);
    await requestIntakeRecognition(id, 4, true);
    await submitIntakeRecaptureEvidence(id, "recapture-id", "file-id", 4);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/inventory/intake/${id}/recognition`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetcher.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ expectedVersion: 4, retry: true }),
      }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      `/api/inventory/intake/${id}/recaptures/recapture-id/evidence`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("parses status-shaped recognition mutation responses", async () => {
    const status = {
      enabled: true,
      latestRun: null,
      recaptures: [],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(status), { status: 200 })),
      );
    vi.stubGlobal("fetch", fetcher);

    await expect(requestIntakeRecognition(id, 4)).resolves.toEqual(status);
    await expect(
      submitIntakeRecaptureEvidence(id, "recapture-id", "file-id", 4),
    ).resolves.toEqual(status);

    expect(fetcher.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ expectedVersion: 4 }),
      }),
    );
    expect(fetcher.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ fileId: "file-id", expectedVersion: 4 }),
      }),
    );
  });

  it("queues an untyped item, changes its type, and retains the historical candidate commit route", async () => {
    const candidateId = "00000000-0000-4000-8000-000000000004";
    const fileId = "00000000-0000-4000-8000-000000000005";
    const committed = {
      batch: { ...detail.batch, version: 2 },
      candidateId,
      machineId: "00000000-0000-4000-8000-000000000006",
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(detail), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(detail), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(committed), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    await prepareIntakeItem(id, fileId, 1);
    await changeIntakeCandidateType(id, candidateId, "dryer", 2);
    await expect(
      commitIntakeCandidate(id, candidateId, 3, ["serial_match"]),
    ).resolves.toEqual(committed);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `/api/inventory/intake/${id}/items`,
    );
    expect(fetcher.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ fileId, expectedVersion: 1 }),
      }),
    );
    expect(fetcher.mock.calls[2]?.[0]).toBe(
      `/api/inventory/intake/${id}/candidates/${candidateId}/commit`,
    );
  });
});
