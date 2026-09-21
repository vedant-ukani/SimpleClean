import { createTestEnvironment } from "@simply-clean/test-support";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAuditHistory,
  getOperationsJobs,
  retryOperationsJob,
} from "../src/lib/operations-client";

const timestamp = new Date().toISOString();
const job = {
  id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
  eventType: "inventory.load.created" as const,
  targetType: "load" as const,
  targetId: "load-1",
  state: "dead_letter" as const,
  attemptCount: 5,
  availableAt: timestamp,
  leaseExpiresAt: null,
  errorCode: "handler_failed",
  version: 7,
  createdAt: timestamp,
  updatedAt: timestamp,
};

afterEach(() => vi.unstubAllGlobals());

describe("Operations client", () => {
  it("validates Owner audit history and forwards the session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ entries: [], page: 1, pageSize: 25, total: 0 }),
          { status: 200 },
        ),
      );
    await expect(
      getAuditHistory(
        {
          action: "inventory.load.created",
          targetType: "load",
          targetId: "load-1",
        },
        fetcher,
        createTestEnvironment(),
        "session=cookie",
      ),
    ).resolves.toMatchObject({ total: 0 });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        "/operations/audit?action=inventory.load.created&targetType=load&targetId=load-1",
      ),
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "session=cookie" }),
      }),
    );
  });

  it("uses the guarded same-origin retry endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ job: { ...job, state: "queued" } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      retryOperationsJob(job.id, job.version),
    ).resolves.toMatchObject({
      state: "queued",
    });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/operations/jobs/${job.id}/retry`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ expectedVersion: job.version }),
      }),
    );
  });

  it("queries attention work by durable state", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ jobs: [job], page: 1, pageSize: 100, total: 1 }),
          { status: 200 },
        ),
      );
    await expect(
      getOperationsJobs(
        { state: "dead_letter", pageSize: 100 },
        fetcher,
        createTestEnvironment(),
        "session=cookie",
      ),
    ).resolves.toMatchObject({ total: 1 });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        "/operations/jobs?state=dead_letter&pageSize=100",
      ),
      expect.any(Object),
    );
  });
});
