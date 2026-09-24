// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type {
  IntakeBatchDetail,
  IntakeRecognitionStatus,
} from "@simply-clean/contracts";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const intakeMocks = vi.hoisted(() => ({
  assignIntakePhoto: vi.fn(),
  commitIntakeBatch: vi.fn(),
  confirmIntakeCandidate: vi.fn(),
  createIntakeCandidate: vi.fn(),
  createIntakePreviewGrant: vi.fn(),
  excludeIntakePhoto: vi.fn(),
  getBrowserIntakeBatch: vi.fn(),
  getIntakeRecognition: vi.fn(),
  linkIntakePhoto: vi.fn(),
  prepareIntakeItem: vi.fn(),
  changeIntakeCandidateType: vi.fn(),
  changeIntakeCandidateCapacity: vi.fn(),
  removeIntakePhoto: vi.fn(),
  requestIntakeRecognition: vi.fn(),
  setIntakeDestination: vi.fn(),
  submitIntakeRecaptureEvidence: vi.fn(),
  updateIntakeCandidate: vi.fn(),
  IntakeRequestError: class IntakeRequestError extends Error {
    readonly code: string | undefined;
    constructor(status: number, detail?: unknown) {
      super(`Intake request failed with status ${status}`);
      const body =
        detail && typeof detail === "object"
          ? (detail as Record<string, unknown>)
          : undefined;
      this.code = typeof body?.code === "string" ? body.code : undefined;
    }
  },
}));

vi.mock("../src/lib/intake-client", () => ({
  ...intakeMocks,
  intakePreviewUrl: vi.fn(() => "/preview"),
}));

import { IntakeReviewView } from "../src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view";
import "../src/app/styles.css";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/app/styles.css"),
  "utf8",
);

const id = "00000000-0000-4000-8000-000000000001";
const timestamp = new Date().toISOString();

describe("Intake review UI", () => {
  beforeEach(() => {
    for (const mock of Object.values(intakeMocks))
      if (typeof mock === "function" && "mockReset" in mock)
        (mock as { mockReset: () => void }).mockReset();
    intakeMocks.createIntakePreviewGrant.mockResolvedValue({
      token: "preview",
    });
    intakeMocks.getIntakeRecognition.mockResolvedValue({
      enabled: true,
      latestRun: null,
      recaptures: [],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ locations: [] }), {
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    for (const mock of Object.values(intakeMocks))
      if (typeof mock === "function" && "mockReset" in mock)
        (mock as { mockReset: () => void }).mockReset();
  });

  it("renders private evidence, candidate editing, and approval controls", () => {
    render(
      <IntakeReviewView
        loadId={id}
        canManage
        initialDetail={{
          batch: {
            id,
            loadId: "00000000-0000-4000-8000-000000000002",
            state: "open",
            destinationLocationId: null,
            version: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          photos: [],
          candidates: [],
          machineMappings: [],
          items: [],
        }}
      />,
    );
    expect(screen.getByText("Machine intake queue")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Add Machines to Inventory" }),
    ).toHaveProperty("disabled", true);
    expect(screen.queryByLabelText("Destination location")).toBeNull();
    expect(screen.queryByText(/Choose an active destination/)).toBeNull();
    expect(screen.getByLabelText("Choose nameplates")).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.queryByRole("button", { name: "Washer" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Capture next nameplate" }),
    ).toBeNull();
    expect(screen.getByText(/choose each Machine type/)).toBeTruthy();
  });

  it("does not render duplicate warnings and keeps candidate approval available", () => {
    render(
      <IntakeReviewView
        loadId={id}
        canManage
        initialDetail={{
          batch: {
            id,
            loadId: "00000000-0000-4000-8000-000000000002",
            state: "open",
            destinationLocationId: null,
            version: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          photos: [],
          candidates: [
            {
              id: "00000000-0000-4000-8000-000000000003",
              batchId: id,
              state: "draft",
              machineType: "washer",
              manufacturer: "Dexter",
              model: "T-400",
              serial: "SERIAL-1",
              voltage: null,
              phase: null,
              fuel: null,
              capacityLb: null,
              confirmationSource: "manual",
              warnings: [
                {
                  kind: "serial_match",
                  machineIds: ["internal-machine-id"],
                  acknowledged: false,
                },
                {
                  kind: "serial_only_match",
                  machineIds: ["internal-machine-id-2"],
                  acknowledged: false,
                },
              ],
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
          machineMappings: [],
        }}
      />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Inventory warnings/)).toBeNull();
    expect(screen.queryByText(/matches an existing Machine/)).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Confirm candidate" }),
    ).toHaveProperty("disabled", false);
  });

  it("retries consecutive preparation version conflicts without reuploading the photo", async () => {
    const user = userEvent.setup();
    const fileId = "00000000-0000-0000-0000-000000000010";
    const photoId = "00000000-0000-0000-0000-000000000011";
    const candidateId = "00000000-0000-0000-0000-000000000012";
    const base = {
      batch: {
        id,
        loadId: "00000000-0000-0000-0000-000000000002",
        state: "open" as const,
        destinationLocationId: null,
        version: 4,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      photos: [],
      candidates: [],
      machineMappings: [],
      items: [],
    };
    const candidate = {
      id: candidateId,
      batchId: id,
      state: "draft" as const,
      machineType: null,
      manufacturer: null,
      model: null,
      serial: null,
      voltage: null,
      phase: null,
      fuel: null,
      capacityLb: null,
      confirmationSource: "recognition" as const,
      warnings: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const refreshed = {
      ...base,
      batch: { ...base.batch, version: 5 },
      photos: [
        {
          id: photoId,
          batchId: id,
          fileId,
          order: 0,
          disposition: "assigned" as const,
          candidateId,
          filename: "nameplate.jpg",
          mediaType: "image/jpeg" as const,
          state: "ready" as const,
          previewAvailable: false,
          createdAt: timestamp,
        },
      ],
      candidates: [candidate],
      items: [
        {
          candidateId,
          photoId,
          fileId,
          machineType: null,
          machineId: null,
          latestRunState: "queued" as const,
        },
      ],
    };
    intakeMocks.getBrowserIntakeBatch
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce({ ...base, batch: { ...base.batch, version: 5 } })
      .mockResolvedValueOnce({ ...base, batch: { ...base.batch, version: 6 } });
    intakeMocks.prepareIntakeItem
      .mockRejectedValueOnce(
        new intakeMocks.IntakeRequestError(409, { code: "version_conflict" }),
      )
      .mockRejectedValueOnce(
        new intakeMocks.IntakeRequestError(409, { code: "version_conflict" }),
      )
      .mockResolvedValueOnce(refreshed);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/files/upload-grants")
          return new Response(
            JSON.stringify({ file: { id: fileId }, grant: { token: "grant" } }),
            { status: 200 },
          );
        if (url.includes("/upload-content"))
          return new Response(JSON.stringify({ file: { id: fileId } }), {
            status: 201,
          });
        if (url === "/api/inventory/locations")
          return new Response(JSON.stringify({ locations: [] }), {
            status: 200,
          });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(
      <IntakeReviewView
        loadId={base.batch.loadId}
        canManage
        initialDetail={base as unknown as IntakeBatchDetail}
      />,
    );
    await user.upload(
      screen.getByLabelText("Choose nameplates"),
      new File(["nameplate"], "nameplate.jpg", { type: "image/jpeg" }),
    );

    expect(
      screen.queryByRole("button", { name: "Upload nameplates" }),
    ).toBeNull();
    expect(screen.queryByLabelText("Staged nameplates")).toBeNull();
    await waitFor(() =>
      expect(intakeMocks.prepareIntakeItem).toHaveBeenCalledTimes(3),
    );
    expect(intakeMocks.prepareIntakeItem).toHaveBeenNthCalledWith(
      1,
      id,
      fileId,
      4,
    );
    expect(intakeMocks.prepareIntakeItem).toHaveBeenNthCalledWith(
      2,
      id,
      fileId,
      5,
    );
    expect(intakeMocks.prepareIntakeItem).toHaveBeenNthCalledWith(
      3,
      id,
      fileId,
      6,
    );
    expect(intakeMocks.getBrowserIntakeBatch).toHaveBeenCalledTimes(3);
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => String(call[0]) === "/api/files/upload-grants",
      ),
    ).toHaveLength(1);
  });

  it.each([
    { code: "version_conflict", status: 409, attempts: 5 },
    { code: "forbidden", status: 403, attempts: 1 },
  ])(
    "bounds preparation retries for $code and retains the single uploaded file",
    async ({ code, status, attempts }) => {
      const fileId = "00000000-0000-4000-8000-000000000061";
      const detail: IntakeBatchDetail = {
        batch: {
          id,
          loadId: id,
          state: "open",
          destinationLocationId: null,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        photos: [],
        candidates: [],
        machineMappings: [],
        items: [],
      };
      let version = 0;
      intakeMocks.getBrowserIntakeBatch.mockImplementation(async () => ({
        ...detail,
        batch: { ...detail.batch, version: ++version },
      }));
      intakeMocks.prepareIntakeItem.mockRejectedValue(
        new intakeMocks.IntakeRequestError(status, { code }),
      );
      const fetcher = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/files/upload-grants")
          return new Response(
            JSON.stringify({ file: { id: fileId }, grant: { token: "grant" } }),
          );
        if (String(input).includes("/upload-content"))
          return new Response(JSON.stringify({ file: { id: fileId } }), {
            status: 201,
          });
        throw new Error("Unexpected request");
      });
      vi.stubGlobal("fetch", fetcher);
      render(<IntakeReviewView loadId={id} canManage initialDetail={detail} />);
      await userEvent
        .setup()
        .upload(
          screen.getByLabelText("Choose nameplates"),
          new File(["nameplate"], "nameplate.jpg", { type: "image/jpeg" }),
        );
      expect(
        await screen.findByText(
          /Some nameplates could not be uploaded or prepared/,
        ),
      ).toBeTruthy();
      expect(intakeMocks.prepareIntakeItem).toHaveBeenCalledTimes(attempts);
      expect(intakeMocks.getBrowserIntakeBatch).toHaveBeenCalledTimes(attempts);
      for (let attempt = 1; attempt <= attempts; attempt += 1)
        expect(intakeMocks.prepareIntakeItem).toHaveBeenNthCalledWith(
          attempt,
          id,
          fileId,
          attempt,
        );
      expect(
        fetcher.mock.calls.filter(
          ([url]) => String(url) === "/api/files/upload-grants",
        ),
      ).toHaveLength(1);
      expect(
        fetcher.mock.calls.filter(([url]) =>
          String(url).includes("/upload-content"),
        ),
      ).toHaveLength(1);
    },
  );

  it("hides temporary upload work and releases the final action after a local failure", async () => {
    const user = userEvent.setup();
    const candidateId = "00000000-0000-4000-8000-000000000021";
    const photoId = "00000000-0000-4000-8000-000000000022";
    const fileId = "00000000-0000-4000-8000-000000000023";
    const detail: IntakeBatchDetail = {
      batch: {
        id,
        loadId: "00000000-0000-4000-8000-000000000002",
        state: "open",
        destinationLocationId: null,
        version: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      photos: [
        {
          id: photoId,
          batchId: id,
          fileId,
          order: 0,
          disposition: "assigned",
          candidateId,
          filename: "ready.jpg",
          mediaType: "image/jpeg",
          state: "ready",
          previewAvailable: false,
          createdAt: timestamp,
        },
      ],
      candidates: [
        {
          id: candidateId,
          batchId: id,
          state: "confirmed",
          machineType: "washer",
          manufacturer: "Dexter",
          model: "T-400",
          serial: "SERIAL-READY",
          voltage: "208 V",
          phase: "three_phase",
          fuel: null,
          capacityLb: null,
          confirmationSource: "recognition",
          revision: 1,
          machineTypeSelectedByUserId: "warehouse-1",
          machineTypeSelectedAt: timestamp,
          warnings: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      machineMappings: [],
      items: [
        {
          candidateId,
          photoId,
          fileId,
          machineType: "washer",
          candidateState: "confirmed",
          candidateRevision: 1,
          latestRunId: "00000000-0000-4000-8000-000000000024",
          latestRunState: "ready",
          machineId: null,
        },
      ],
    };
    let resolveUploadGrant: ((response: Response) => void) | undefined;
    const uploadGrant = new Promise<Response>((resolve) => {
      resolveUploadGrant = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/files/upload-grants") return uploadGrant;
        if (url === "/api/inventory/locations")
          return Promise.resolve(
            new Response(JSON.stringify({ locations: [] }), { status: 200 }),
          );
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(
      <IntakeReviewView
        loadId={detail.batch.loadId}
        canManage
        initialDetail={detail}
      />,
    );
    const finalAction = screen.getByRole("button", {
      name: "Add Machines to Inventory",
    });
    expect(finalAction).toHaveProperty("disabled", false);

    await user.upload(
      screen.getByLabelText("Choose nameplates"),
      new File(["failed"], "failed.jpg", { type: "image/jpeg" }),
    );

    expect(screen.queryByLabelText("Staged nameplates")).toBeNull();
    expect(screen.queryByAltText("Preview of failed.jpg")).toBeNull();
    expect(finalAction).toHaveProperty("disabled", true);
    resolveUploadGrant?.(new Response("upload failed", { status: 500 }));
    await screen.findByText(
      "Some nameplates could not be uploaded or prepared. Select those photos again.",
    );
    await waitFor(() => expect(finalAction).toHaveProperty("disabled", false));
  });

  it("replaces failed evidence before excluding it and only exposes removal on failed items", async () => {
    const user = userEvent.setup();
    const failedCandidateId = "00000000-0000-4000-8000-000000000031";
    const readyCandidateId = "00000000-0000-4000-8000-000000000032";
    const failedPhotoId = "00000000-0000-4000-8000-000000000033";
    const readyPhotoId = "00000000-0000-4000-8000-000000000034";
    const replacementFileId = "00000000-0000-4000-8000-000000000035";
    const candidate = (candidateId: string, model: string) => ({
      id: candidateId,
      batchId: id,
      state: "confirmed" as const,
      machineType: null,
      manufacturer: "Dexter",
      model,
      serial: `${model}-SERIAL`,
      voltage: "120V",
      phase: "single_phase" as const,
      fuel: "electric" as const,
      capacityLb: null,
      confirmationSource: "recognition" as const,
      revision: 1,
      machineTypeSelectedByUserId: null,
      machineTypeSelectedAt: null,
      warnings: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const photo = (photoId: string, fileId: string, candidateId: string) => ({
      id: photoId,
      batchId: id,
      fileId,
      order: 0,
      disposition: "assigned" as const,
      candidateId,
      filename: `${candidateId}.jpg`,
      mediaType: "image/jpeg" as const,
      state: "ready" as const,
      previewAvailable: false,
      createdAt: timestamp,
    });
    const detail: IntakeBatchDetail = {
      batch: {
        id,
        loadId: "00000000-0000-4000-8000-000000000002",
        state: "open",
        destinationLocationId: null,
        version: 4,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      photos: [
        photo(
          failedPhotoId,
          "00000000-0000-4000-8000-000000000036",
          failedCandidateId,
        ),
        photo(
          readyPhotoId,
          "00000000-0000-4000-8000-000000000037",
          readyCandidateId,
        ),
      ],
      candidates: [
        candidate(failedCandidateId, "FAILED"),
        candidate(readyCandidateId, "READY"),
      ],
      machineMappings: [],
      items: [
        {
          candidateId: failedCandidateId,
          photoId: failedPhotoId,
          fileId: "00000000-0000-4000-8000-000000000036",
          machineType: null,
          candidateState: "confirmed",
          candidateRevision: 1,
          latestRunId: "00000000-0000-4000-8000-000000000038",
          latestRunState: "failed",
          machineId: null,
        },
        {
          candidateId: readyCandidateId,
          photoId: readyPhotoId,
          fileId: "00000000-0000-4000-8000-000000000037",
          machineType: null,
          candidateState: "confirmed",
          candidateRevision: 1,
          latestRunId: "00000000-0000-4000-8000-000000000039",
          latestRunState: "ready",
          machineId: null,
        },
      ],
    };
    const replacementCandidateId = "00000000-0000-4000-8000-000000000040";
    const prepared: IntakeBatchDetail = {
      ...detail,
      batch: { ...detail.batch, version: 5 },
      candidates: [
        ...detail.candidates,
        candidate(replacementCandidateId, "Reading"),
      ],
      items: [
        ...detail.items!,
        {
          candidateId: replacementCandidateId,
          photoId: "00000000-0000-4000-8000-000000000041",
          fileId: replacementFileId,
          machineType: null,
          candidateState: "draft",
          candidateRevision: 1,
          latestRunId: "00000000-0000-4000-8000-000000000042",
          latestRunState: "queued",
          machineId: null,
        },
      ],
    };
    const excluded: IntakeBatchDetail = {
      ...prepared,
      batch: { ...prepared.batch, version: 6 },
      items: prepared.items!.filter(
        (item) => item.candidateId !== failedCandidateId,
      ),
    };
    intakeMocks.getBrowserIntakeBatch.mockResolvedValue(detail);
    intakeMocks.prepareIntakeItem.mockResolvedValue(prepared);
    intakeMocks.excludeIntakePhoto.mockResolvedValue(excluded);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/files/upload-grants")
          return new Response(
            JSON.stringify({
              file: { id: replacementFileId },
              grant: { token: "grant" },
            }),
            { status: 200 },
          );
        if (url.includes("/upload-content"))
          return new Response("{}", { status: 201 });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(
      <IntakeReviewView
        loadId={detail.batch.loadId}
        canManage
        initialDetail={detail}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Retry this Machine" }),
    ).toBeNull();
    expect(
      screen.getByLabelText("Retake or choose another image"),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Remove failed image" }),
    ).toHaveLength(1);
    expect(
      screen
        .getByRole("heading", { name: "READY" })
        .closest("article")
        ?.querySelector("button"),
    ).toBeNull();

    await user.upload(
      screen.getByLabelText("Retake or choose another image"),
      new File(["replacement"], "replacement.jpg", { type: "image/jpeg" }),
    );
    await screen.findByText("Replacement nameplate is being read.");
    expect(intakeMocks.prepareIntakeItem).toHaveBeenCalledWith(
      id,
      replacementFileId,
      4,
    );
    expect(intakeMocks.excludeIntakePhoto).toHaveBeenCalledWith(
      id,
      failedPhotoId,
      true,
      5,
    );
    expect(
      intakeMocks.prepareIntakeItem.mock.invocationCallOrder[0],
    ).toBeLessThan(intakeMocks.excludeIntakePhoto.mock.invocationCallOrder[0]!);
    expect(screen.queryByRole("heading", { name: "FAILED" })).toBeNull();
  });

  it.each(["failed", "stale"] as const)(
    "removes %s evidence through exclusion without exposing removal on ready items",
    async (runState) => {
      const user = userEvent.setup();
      const candidateId = "00000000-0000-4000-8000-000000000051";
      const photoId = "00000000-0000-4000-8000-000000000052";
      const detail = {
        batch: {
          id,
          loadId: "00000000-0000-4000-8000-000000000002",
          state: "open" as const,
          destinationLocationId: null,
          version: 2,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        photos: [
          {
            id: photoId,
            batchId: id,
            fileId: "00000000-0000-4000-8000-000000000053",
            order: 0,
            disposition: "assigned" as const,
            candidateId,
            filename: "failed.jpg",
            mediaType: "image/jpeg" as const,
            state: "ready" as const,
            previewAvailable: false,
            createdAt: timestamp,
          },
        ],
        candidates: [
          {
            id: candidateId,
            batchId: id,
            state: "draft" as const,
            machineType: null,
            manufacturer: null,
            model: null,
            serial: null,
            voltage: null,
            phase: null,
            fuel: null,
            capacityLb: null,
            confirmationSource: "recognition" as const,
            revision: 1,
            machineTypeSelectedByUserId: null,
            machineTypeSelectedAt: null,
            warnings: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        machineMappings: [],
        items: [
          {
            candidateId,
            photoId,
            fileId: "00000000-0000-4000-8000-000000000053",
            machineType: null,
            candidateState: "draft" as const,
            candidateRevision: 1,
            latestRunId: "00000000-0000-4000-8000-000000000054",
            latestRunState: runState,
            machineId: null,
          },
        ],
      };
      const excluded = {
        ...detail,
        batch: { ...detail.batch, version: 3 },
        items: [],
      };
      intakeMocks.getBrowserIntakeBatch.mockResolvedValue(detail);
      intakeMocks.excludeIntakePhoto.mockResolvedValue(excluded);
      render(
        <IntakeReviewView
          loadId={detail.batch.loadId}
          canManage
          initialDetail={detail}
        />,
      );

      if (runState === "failed") {
        expect(
          screen.getByRole("heading", { name: "Needs a clearer nameplate" }),
        ).toBeTruthy();
        expect(
          screen.queryByRole("heading", { name: "Reading nameplate…" }),
        ).toBeNull();
      }

      await user.click(
        screen.getByRole("button", { name: "Remove failed image" }),
      );
      await screen.findByText("Failed image removed from this Intake.");
      expect(intakeMocks.excludeIntakePhoto).toHaveBeenCalledWith(
        id,
        photoId,
        true,
        2,
      );
      expect(
        screen.queryByRole("button", { name: "Remove failed image" }),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: "Add Machines to Inventory" }),
      ).toHaveProperty("disabled", true);
    },
  );

  it("keeps a Catalog suggestion advisory until a human chooses type and commits", async () => {
    const user = userEvent.setup();
    const candidateId = "00000000-0000-4000-8000-000000000012";
    const photoId = "00000000-0000-4000-8000-000000000011";
    const fileId = "00000000-0000-4000-8000-000000000010";
    const machineId = "00000000-0000-4000-8000-000000000013";
    const candidate = {
      id: candidateId,
      batchId: id,
      state: "confirmed" as const,
      machineType: null,
      catalogTypeSuggestion: {
        machineType: "dryer" as const,
        revisionId: "dexter-revision-1",
        manufacturer: "Dexter",
        model: "T-400",
        label:
          "Verified exact model match — confirm the observed Machine type.",
      },
      catalogEnrichment: {
        status: "researching" as const,
        revision: null,
        discoveryRun: null,
      },
      manufacturer: "Dexter",
      model: "T-400",
      serial: "SERIAL-1",
      voltage: "208 V",
      phase: "three_phase" as const,
      fuel: null,
      capacityLb: null,
      confirmationSource: "recognition" as const,
      revision: 1,
      machineTypeSelectedByUserId: null,
      machineTypeSelectedAt: null,
      warnings: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const detail: IntakeBatchDetail = {
      batch: {
        id,
        loadId: "00000000-0000-4000-8000-000000000002",
        state: "open",
        destinationLocationId: null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      photos: [
        {
          id: photoId,
          batchId: id,
          fileId,
          order: 0,
          disposition: "assigned",
          candidateId,
          filename: "nameplate.jpg",
          mediaType: "image/jpeg",
          state: "ready",
          previewAvailable: false,
          createdAt: timestamp,
        },
      ],
      candidates: [candidate],
      machineMappings: [],
      items: [
        {
          candidateId,
          photoId,
          fileId,
          machineType: null,
          candidateState: "confirmed",
          candidateRevision: 1,
          latestRunId: "00000000-0000-4000-8000-000000000014",
          latestRunState: "ready",
          machineId: null,
        },
      ],
    };
    const typed: IntakeBatchDetail = {
      ...detail,
      batch: { ...detail.batch, version: 2 },
      candidates: [
        {
          ...candidate,
          machineType: "washer",
          revision: 2,
          machineTypeSelectedByUserId: "warehouse-1",
          machineTypeSelectedAt: timestamp,
        },
      ],
      items: detail.items?.map((item) => ({ ...item, machineType: "washer" })),
    };
    intakeMocks.changeIntakeCandidateType.mockResolvedValue(typed);
    intakeMocks.commitIntakeBatch.mockResolvedValue({
      batch: { ...typed.batch, state: "committed", version: 3 },
      machines: [machineId],
      mappings: [{ candidateId, machineId }],
    });
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      const rendered = render(
        <IntakeReviewView
          loadId={detail.batch.loadId}
          canManage
          initialDetail={detail}
        />,
      );

      const finalAction = screen.getByRole("button", {
        name: "Add Machines to Inventory",
      });
      expect(finalAction).toHaveProperty("disabled", true);
      expect(screen.getByText(/Catalog suggests Dryer/)).toBeTruthy();
      expect(screen.getByText("Researching specifications")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
      rendered.rerender(
        <IntakeReviewView
          loadId={detail.batch.loadId}
          canManage
          initialDetail={{
            ...detail,
            candidates: [
              {
                ...candidate,
                catalogEnrichment: {
                  status: "no_verified_specs",
                  revision: null,
                  discoveryRun: null,
                },
              },
            ],
          }}
        />,
      );
      expect(
        await screen.findByText("No verified specifications found"),
      ).toBeTruthy();
      rendered.rerender(
        <IntakeReviewView
          loadId={detail.batch.loadId}
          canManage
          initialDetail={{
            ...detail,
            candidates: [
              {
                ...candidate,
                catalogEnrichment: {
                  status: "verified",
                  discoveryRun: null,
                  manufactureDate: {
                    kind: "unknown",
                    reason: "serial_rule_unavailable",
                  },
                  revision: {
                    manufacturerId: "dexter",
                    manufacturer: "Dexter",
                    modelId: "t-400",
                    family: "T-Series",
                    model: "T-400",
                    equipmentClass: "dryer",
                    revisionId: "dexter-revision-1",
                    revision: 1,
                    aliases: [],
                    productionStartYear: 2020,
                    productionEndYear: 2024,
                    specs: {
                      widthIn: 30,
                      depthIn: 40,
                      heightIn: 50,
                      weightLb: 600,
                      capacityLb: 40,
                      voltage: ["208 V"],
                      phase: ["three_phase"],
                      fuel: ["gas"],
                      configuration: ["stackable"],
                    },
                    sources: [
                      {
                        id: "source-1",
                        url: "https://dexter.com/t-400",
                        title: "Official T-400 specifications",
                        retrievedAt: timestamp,
                        documentRevision: null,
                        checksum: null,
                        checksumUnavailableReason: "Not retained",
                        sourceClass: "official_manufacturer",
                      },
                    ],
                    evidence: [],
                    publicationMode: "automatic_official_source_policy",
                    discoveryRun: null,
                  },
                },
              },
            ],
          }}
        />,
      );
      expect(screen.getByText("Verified specifications")).toBeTruthy();
      expect(screen.getByText("2020–2024")).toBeTruthy();
      expect(screen.getByText("three phase")).toBeTruthy();
      expect(screen.getByText("stackable")).toBeTruthy();
      expect(screen.getByText("Official T-400 specifications")).toBeTruthy();
      expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
      expect(
        screen.getByRole("combobox", { name: "Machine type" }),
      ).toHaveProperty("value", "");
      expect(intakeMocks.changeIntakeCandidateType).not.toHaveBeenCalled();
      expect(screen.queryByText("Ready for review")).toBeNull();
      expect(screen.queryByText("Added to Inventory")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Add this Machine to Inventory" }),
      ).toBeNull();

      await user.selectOptions(
        screen.getByRole("combobox", { name: "Machine type" }),
        "washer",
      );
      expect(intakeMocks.changeIntakeCandidateType).toHaveBeenCalledWith(
        id,
        candidateId,
        "washer",
        1,
      );
      await waitFor(() =>
        expect(finalAction).toHaveProperty("disabled", false),
      );
      await user.click(finalAction);
      await screen.findByText("Machines added to Inventory.");
      expect(intakeMocks.commitIntakeBatch).toHaveBeenCalledWith(id, 2, false);
      expect(screen.getByText("committed", { exact: true })).toBeTruthy();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("marks private evidence previews for responsive sizing", async () => {
    render(
      <IntakeReviewView
        loadId={id}
        canManage
        initialDetail={{
          batch: {
            id,
            loadId: "00000000-0000-4000-8000-000000000002",
            state: "open",
            destinationLocationId: null,
            version: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          photos: [
            {
              id: "00000000-0000-4000-8000-000000000003",
              batchId: id,
              fileId: "00000000-0000-4000-8000-000000000004",
              order: 0,
              disposition: "unassigned" as const,
              candidateId: null,
              filename: "large-photo.jpg",
              mediaType: "image/jpeg" as const,
              state: "ready" as const,
              previewAvailable: true,
              createdAt: timestamp,
            },
          ],
          candidates: [],
          machineMappings: [],
        }}
      />,
    );

    const image = await screen.findByAltText(
      "Private preview of large-photo.jpg",
    );
    expect(image.classList.contains("intake-photo-preview")).toBe(true);
    expect(stylesheet).toMatch(
      /\.intake-photo-preview\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;[\s\S]*?height:\s*auto;/,
    );
    expect(stylesheet).toMatch(
      /\.intake-photo-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*18rem\),\s*1fr\)\);/,
    );
  });

  it("assigns and then unassigns a photo through the review controls", async () => {
    const user = userEvent.setup();
    const photo = {
      id: "00000000-0000-4000-8000-000000000003",
      batchId: id,
      fileId: "00000000-0000-4000-8000-000000000004",
      order: 0,
      disposition: "unassigned" as const,
      candidateId: null,
      filename: "arrival.png",
      mediaType: "image/png" as const,
      state: "ready" as const,
      previewAvailable: true,
      createdAt: timestamp,
    };
    const candidate = {
      id: "00000000-0000-4000-8000-000000000005",
      batchId: id,
      state: "draft" as const,
      machineType: "washer" as const,
      manufacturer: "Maker",
      model: "Model",
      serial: "SERIAL",
      voltage: null,
      phase: null,
      fuel: null,
      confirmationSource: "manual" as const,
      warnings: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
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
      photos: [photo],
      candidates: [candidate],
      machineMappings: [],
    };
    const assigned = {
      ...detail,
      batch: { ...detail.batch, version: 2 },
      photos: [
        {
          ...photo,
          disposition: "assigned" as const,
          candidateId: candidate.id,
        },
      ],
    };
    const unassigned = {
      ...detail,
      batch: { ...detail.batch, version: 3 },
    };
    intakeMocks.assignIntakePhoto
      .mockResolvedValueOnce(assigned)
      .mockResolvedValueOnce(unassigned);

    render(
      <IntakeReviewView
        loadId={detail.batch.loadId}
        canManage
        initialDetail={detail}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Assign arrival.png" }),
    );
    expect(
      await screen.findByRole("button", { name: "Unassign arrival.png" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Unassign arrival.png" }),
    );
    expect(
      await screen.findByRole("button", { name: "Assign arrival.png" }),
    ).toBeTruthy();
    expect(intakeMocks.assignIntakePhoto).toHaveBeenLastCalledWith(
      id,
      photo.id,
      null,
      2,
    );
  });

  it("shows evidence, confidence, and a targeted recapture without manual fallback", async () => {
    const photoId = "00000000-0000-4000-8000-000000000003";
    const recaptureId = "00000000-0000-4000-8000-000000000006";
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
      photos: [
        {
          id: photoId,
          batchId: id,
          fileId: "00000000-0000-4000-8000-000000000004",
          order: 0,
          disposition: "unassigned" as const,
          candidateId: null,
          filename: "nameplate.jpg",
          mediaType: "image/jpeg" as const,
          state: "ready" as const,
          previewAvailable: false,
          createdAt: timestamp,
        },
      ],
      candidates: [],
      machineMappings: [],
      recognition: {
        enabled: true,
        latestRun: {
          id: "00000000-0000-4000-8000-000000000007",
          batchId: id,
          state: "needs_recapture" as const,
          inputVersion: 1,
          policyVersion: "test-policy",
          provider: "fake",
          model: "fake-v1",
          provenance: {
            provider: "fake",
            model: "fake-v1",
            schemaVersion: "intake-nameplate-v2",
            verifier: "fake-ocr",
            verifierModel: "fake-ocr-v1",
            policyVersion: "test-policy",
            inputFingerprint: "a".repeat(64),
            sourceChecksums: {},
          },
          errorCode: null,
          groups: [
            {
              key: "washer-1",
              photoIds: [photoId],
              accepted: false,
              reasons: ["small_text" as const],
              fields: [
                {
                  field: "manufacturer" as const,
                  value: "Acme",
                  accepted: true,
                  reason: "accepted" as const,
                  photoId,
                  box: null,
                  verifierAgreement: true,
                  confidence: 0.94,
                },
              ],
            },
          ],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        recaptures: [
          {
            id: recaptureId,
            runId: "00000000-0000-4000-8000-000000000007",
            batchId: id,
            candidateId: null,
            photoIds: [photoId],
            field: "model" as const,
            reason: "small_text" as const,
            instruction: "Move closer and keep the full plate in frame.",
            state: "open" as const,
            resolvedByUserId: null,
          },
        ],
      },
    } as unknown as IntakeBatchDetail & {
      recognition: IntakeRecognitionStatus;
    };
    intakeMocks.getIntakeRecognition.mockResolvedValue(detail.recognition);
    intakeMocks.getBrowserIntakeBatch.mockResolvedValue(detail);

    render(
      <IntakeReviewView
        loadId={detail.batch.loadId}
        canManage
        initialDetail={detail}
      />,
    );

    expect(screen.getByText("Needs a clearer photo")).toBeTruthy();
    expect(screen.getByText(/94% confidence/)).toBeTruthy();
    expect(screen.getByTestId("recognition-provenance").textContent).toMatch(
      /policy:\s+test-policy/,
    );
    expect(
      screen.getByText(/Move closer and keep the full plate/),
    ).toBeTruthy();
    expect(screen.getByLabelText("Upload the requested evidence")).toBeTruthy();
    expect(screen.queryByLabelText("Manual fallback reason")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Continue with manual review" }),
    ).toBeNull();
  });

  it("prevents repeated approval while the Inventory request is in flight", async () => {
    const user = userEvent.setup();
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
    let resolveCommit: (value: {
      machines: string[];
      mappings: { candidateId: string; machineId: string }[];
    }) => void = () => undefined;
    intakeMocks.commitIntakeBatch.mockReturnValue(
      new Promise<{
        machines: string[];
        mappings: { candidateId: string; machineId: string }[];
      }>((resolve) => {
        resolveCommit = resolve;
      }),
    );
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      render(
        <IntakeReviewView
          loadId={detail.batch.loadId}
          canManage
          initialDetail={detail}
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Approve and Add to Inventory" }),
      );
      const pendingButton = await screen.findByRole("button", {
        name: "Adding Machines to Inventory…",
      });
      expect(pendingButton.getAttribute("aria-busy")).toBe("true");
      expect(pendingButton).toHaveProperty("disabled", true);
      await user.click(pendingButton);
      expect(intakeMocks.commitIntakeBatch).toHaveBeenCalledTimes(1);
      resolveCommit({
        machines: [id],
        mappings: [{ candidateId: id, machineId: id }],
      });
      await screen.findByText("Intake approved and added to Inventory.");
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("keeps an open batch without Machines when approval is rejected", async () => {
    const user = userEvent.setup();
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
    intakeMocks.commitIntakeBatch.mockRejectedValue(new Error("blocked"));
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      render(
        <IntakeReviewView
          loadId={detail.batch.loadId}
          canManage
          initialDetail={detail}
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Approve and Add to Inventory" }),
      );
      await screen.findByText(
        "Approval blocked. Confirm every candidate and account for every photo before finishing.",
      );
      expect(screen.getByText("open", { exact: true })).toBeTruthy();
      expect(screen.queryByRole("link", { name: "View Inventory" })).toBeNull();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("does not dispatch approval when the irreversible confirmation is canceled", async () => {
    const user = userEvent.setup();
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
    const originalConfirm = window.confirm;
    window.confirm = () => false;
    try {
      render(
        <IntakeReviewView
          loadId={detail.batch.loadId}
          canManage
          initialDetail={detail}
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Approve and Add to Inventory" }),
      );
      expect(intakeMocks.commitIntakeBatch).not.toHaveBeenCalled();
      expect(screen.getByText("open", { exact: true })).toBeTruthy();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("renders persisted Machine mappings after a committed batch reloads", () => {
    const machineId = "00000000-0000-4000-8000-000000000009";
    render(
      <IntakeReviewView
        loadId={id}
        canManage
        initialDetail={{
          batch: {
            id,
            loadId: "00000000-0000-4000-8000-000000000002",
            state: "committed",
            destinationLocationId: "00000000-0000-4000-8000-000000000003",
            version: 2,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          photos: [],
          candidates: [],
          machineMappings: [{ candidateId: id, machineId }],
        }}
      />,
    );
    expect(screen.getByRole("link", { name: machineId })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View Inventory" })).toBeTruthy();
  });

  it("refreshes authoritative state when approval response is lost", async () => {
    const user = userEvent.setup();
    const machineId = "00000000-0000-4000-8000-000000000009";
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
    const committed = {
      ...detail,
      batch: {
        ...detail.batch,
        state: "committed" as const,
        version: 2,
      },
      machineMappings: [{ candidateId: id, machineId }],
    };
    intakeMocks.commitIntakeBatch.mockRejectedValue(new Error("timeout"));
    intakeMocks.getBrowserIntakeBatch.mockResolvedValue(committed);
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      render(
        <IntakeReviewView
          loadId={detail.batch.loadId}
          canManage
          initialDetail={detail}
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Approve and Add to Inventory" }),
      );
      await screen.findByText("Intake approved and added to Inventory.");
      expect(screen.getByText("committed", { exact: true })).toBeTruthy();
      expect(screen.getByRole("link", { name: machineId })).toBeTruthy();
      expect(
        screen.queryByText(/Approval blocked\. Confirm every candidate/),
      ).toBeNull();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("starts recognition after linking and polls through a newer run state", async () => {
    const user = userEvent.setup();
    const photo = {
      id: "00000000-0000-4000-8000-000000000003",
      batchId: id,
      fileId: "00000000-0000-4000-8000-000000000004",
      order: 0,
      disposition: "unassigned" as const,
      candidateId: null,
      filename: "plate.png",
      mediaType: "image/png" as const,
      state: "ready" as const,
      previewAvailable: false,
      createdAt: timestamp,
    };
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
    const linked = {
      ...detail,
      batch: { ...detail.batch, version: 2 },
      photos: [photo],
    };
    const run = (state: "queued" | "running" | "ready") => ({
      id: "00000000-0000-4000-8000-000000000007",
      batchId: id,
      state,
      inputVersion: 2,
      policyVersion: "test-policy",
      provider: "fake",
      model: "fake-v1",
      errorCode: null,
      groups: [],
      createdAt: timestamp,
      updatedAt: new Date(
        Date.now() + (state === "queued" ? 0 : state === "running" ? 1 : 2),
      ).toISOString(),
    });
    const recognitionStatus = (state: "queued" | "running" | "ready") => ({
      enabled: true,
      latestRun: run(state),
      recaptures: [],
    });
    let recognitionReads = 0;
    intakeMocks.getIntakeRecognition.mockImplementation(async () => {
      recognitionReads += 1;
      if (recognitionReads === 1)
        return { enabled: true, latestRun: null, recaptures: [] };
      return recognitionStatus(recognitionReads === 2 ? "running" : "ready");
    });
    intakeMocks.linkIntakePhoto.mockResolvedValue(linked);
    intakeMocks.requestIntakeRecognition.mockResolvedValue(
      recognitionStatus("queued"),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/inventory/locations") {
          return new Response(JSON.stringify({ locations: [] }), {
            headers: { "content-type": "application/json" },
          });
        }
        if (url === "/api/files/upload-grants") {
          const body = JSON.parse(String(init?.body)) as {
            originalFilename: string;
          };
          return new Response(
            JSON.stringify({
              file: { id: "00000000-0000-4000-8000-000000000004" },
              grant: { token: `grant-${body.originalFilename}` },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/upload-content")) {
          return new Response(JSON.stringify({ file: { id: photo.fileId } }), {
            status: 200,
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(
      <IntakeReviewView
        loadId={detail.batch.loadId}
        canManage
        initialDetail={detail}
      />,
    );
    const photoInput = screen.getByLabelText("Choose arrival/nameplate photos");
    expect(photoInput.getAttribute("accept")).toBe("image/*,.heic,.heif");
    await user.upload(
      photoInput,
      new File(["photo"], "plate.png", { type: "image/png" }),
    );

    await screen.findByText("plate.png: linked");
    expect(intakeMocks.requestIntakeRecognition).toHaveBeenCalledWith(id, 2);
    await waitFor(
      () => expect(screen.getByText("Ready for review")).toBeTruthy(),
      { timeout: 5000 },
    );
  });

  it("does not start recognition while any visible upload remains failed", async () => {
    const user = userEvent.setup();
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
    const attempts = new Map<string, number>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/inventory/locations") {
          return new Response(JSON.stringify({ locations: [] }), {
            headers: { "content-type": "application/json" },
          });
        }
        if (url === "/api/files/upload-grants") {
          const body = JSON.parse(String(init?.body)) as {
            originalFilename: string;
          };
          return new Response(
            JSON.stringify({
              file: { id: `${body.originalFilename}-id` },
              grant: { token: body.originalFilename },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/upload-content")) {
          const file = (init?.body as FormData).get("file") as File;
          const attempt = (attempts.get(file.name) ?? 0) + 1;
          attempts.set(file.name, attempt);
          if (!(file.name === "first.png" && attempt > 1)) {
            throw new Error("synthetic upload failure");
          }
          return new Response(JSON.stringify({ file: { id: "first-id" } }), {
            status: 200,
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    intakeMocks.linkIntakePhoto.mockResolvedValue({
      ...detail,
      batch: { ...detail.batch, version: 2 },
      photos: [],
    });

    render(
      <IntakeReviewView
        loadId={detail.batch.loadId}
        canManage
        initialDetail={detail}
      />,
    );
    await user.upload(
      screen.getByLabelText("Choose arrival/nameplate photos"),
      [
        new File(["one"], "first.png", { type: "image/png" }),
        new File(["two"], "second.png", { type: "image/png" }),
      ],
    );
    await screen.findByText(/first.png: failed/);
    await screen.findByText(/second.png: failed/);
    expect(intakeMocks.requestIntakeRecognition).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Retry" })[0]!);
    await screen.findByText("first.png: linked");
    expect(screen.getByText(/second.png: failed/)).toBeTruthy();
    expect(intakeMocks.requestIntakeRecognition).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("list", { name: "Photo upload queue" })
        .getAttribute("aria-live"),
    ).toBe("polite");
  });

  it("does not apply a terminal detail response older than the current version", async () => {
    const user = userEvent.setup();
    const run = {
      id: "00000000-0000-4000-8000-000000000007",
      batchId: id,
      state: "queued" as const,
      inputVersion: 2,
      policyVersion: "test-policy",
      provider: "fake",
      model: "fake-v1",
      errorCode: null,
      groups: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const detail = {
      batch: {
        id,
        loadId: "00000000-0000-4000-8000-000000000002",
        state: "open" as const,
        destinationLocationId: null,
        version: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      photos: [],
      candidates: [],
      machineMappings: [],
      recognition: {
        enabled: true,
        latestRun: run,
        recaptures: [],
      },
    } as unknown as IntakeBatchDetail & {
      recognition: IntakeRecognitionStatus;
    };
    const staleDetail = {
      ...detail,
      batch: { ...detail.batch, version: 1 },
    };
    const ready = {
      ...detail.recognition,
      latestRun: {
        ...run,
        state: "ready" as const,
        updatedAt: new Date().toISOString(),
      },
    };
    intakeMocks.getIntakeRecognition.mockResolvedValue(ready);
    intakeMocks.getBrowserIntakeBatch.mockResolvedValue(staleDetail);
    intakeMocks.createIntakeCandidate.mockResolvedValue(detail);

    render(
      <IntakeReviewView
        loadId={detail.batch.loadId}
        canManage
        initialDetail={detail}
      />,
    );
    await waitFor(
      () => expect(screen.getByText("Ready for review")).toBeTruthy(),
      { timeout: 5000 },
    );
    await user.click(
      screen.getByRole("button", { name: "Add Machine candidate" }),
    );
    expect(intakeMocks.createIntakeCandidate).toHaveBeenCalledWith(id, 2);
  });

  it("uses the current version for recapture evidence and makes commit terminal immediately", async () => {
    const user = userEvent.setup();
    const recaptureId = "00000000-0000-4000-8000-000000000006";
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
      recognition: {
        enabled: true,
        latestRun: {
          id: "00000000-0000-4000-8000-000000000007",
          batchId: id,
          state: "needs_recapture" as const,
          inputVersion: 1,
          policyVersion: "test-policy",
          provider: "fake",
          model: "fake-v1",
          errorCode: null,
          groups: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        recaptures: [
          {
            id: recaptureId,
            runId: "00000000-0000-4000-8000-000000000007",
            batchId: id,
            candidateId: null,
            photoIds: [],
            field: "model" as const,
            reason: "small_text" as const,
            instruction: "Move closer to the nameplate.",
            state: "open" as const,
            resolvedByUserId: null,
          },
        ],
      },
    } as unknown as IntakeBatchDetail & {
      recognition: IntakeRecognitionStatus;
    };
    const versionTwo = {
      ...detail,
      batch: { ...detail.batch, version: 2 },
      candidates: [],
    };
    intakeMocks.createIntakeCandidate.mockResolvedValue(versionTwo);
    intakeMocks.submitIntakeRecaptureEvidence.mockResolvedValue(
      detail.recognition,
    );
    intakeMocks.getBrowserIntakeBatch.mockResolvedValue(detail);
    intakeMocks.commitIntakeBatch.mockResolvedValue({
      machines: [id],
      mappings: [{ candidateId: id, machineId: id }],
      batch: { ...detail.batch, state: "committed", version: 2 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/inventory/locations")
          return new Response(JSON.stringify({ locations: [] }), {
            status: 200,
          });
        if (url === "/api/files/upload-grants")
          return new Response(
            JSON.stringify({
              file: { id: "00000000-0000-4000-8000-000000000008" },
              grant: { token: "grant" },
            }),
            { status: 200 },
          );
        if (url.includes("/upload-content"))
          return new Response(JSON.stringify({ file: { id: "file" } }), {
            status: 200,
          });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      render(
        <IntakeReviewView
          loadId={detail.batch.loadId}
          canManage
          initialDetail={detail}
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Add Machine candidate" }),
      );
      await waitFor(() =>
        expect(intakeMocks.createIntakeCandidate).toHaveBeenCalledWith(id, 1),
      );
      await user.upload(
        screen.getByLabelText("Upload the requested evidence"),
        new File(["recapture"], "recapture.png", { type: "image/png" }),
      );
      await waitFor(() =>
        expect(intakeMocks.submitIntakeRecaptureEvidence).toHaveBeenCalledWith(
          id,
          recaptureId,
          "00000000-0000-4000-8000-000000000008",
          2,
        ),
      );

      await user.click(
        screen.getByRole("button", { name: "Approve and Add to Inventory" }),
      );
      await screen.findByText("Intake approved and added to Inventory.");
      expect(screen.getByText("committed", { exact: true })).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Approve and Add to Inventory" }),
      ).toHaveProperty("disabled", true);
      expect(
        screen
          .getByRole("link", { name: "View Inventory" })
          .getAttribute("href"),
      ).toBe("/machines");
    } finally {
      window.confirm = originalConfirm;
    }
  });
});
