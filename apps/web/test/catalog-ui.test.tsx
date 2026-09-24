// @vitest-environment jsdom

import type { MachineDetail } from "@simply-clean/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MachineDetailView } from "../src/app/(protected)/machines/[machineId]/machine-detail-view";
import { CatalogDetailView } from "../src/app/(protected)/catalog/[revisionId]/catalog-detail-view";
import { CatalogView } from "../src/app/(protected)/catalog/catalog-view";

const inventory = vi.hoisted(() => ({
  updateMachineActualSpecs: vi.fn(),
  updateMachineIdentity: vi.fn(),
  getBrowserMachine: vi.fn(),
}));
vi.mock("../src/lib/inventory-client", async (original) => ({
  ...(await original()),
  ...inventory,
}));

const timestamp = "2026-09-23T00:00:00.000Z";
const detail: MachineDetail = {
  machine: {
    id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
    machineType: "washer",
    manufacturer: "Dexter",
    model: "T-400",
    serial: "SERIAL-1",
    voltage: null,
    phase: null,
    fuel: null,
    capacityLb: 40,
    sourceLoadId: "f13fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
    sourceLoadDisplayName: "Load",
    currentLocationId: null,
    currentLocationCode: null,
    currentLocationName: null,
    identityVerificationState: "provisional",
    conflictingMachineId: null,
    inventoryState: "expected",
    productionState: "not_assessed",
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  identityEvidence: [],
  verificationHistory: [],
  locationHistory: [],
  catalog: {
    resolutionId: "resolution-1",
    status: "exact",
    matchKind: "canonical",
    resolvedAt: timestamp,
    manufactureDate: {
      kind: "exact",
      year: 2018,
      ruleId: "serial-rule-1",
      ruleRevision: 3,
      sourceId: "source-1",
      locator: "Serial date table, p. 4",
    },
    revision: {
      manufacturerId: "dexter",
      manufacturer: "Dexter",
      modelId: "t-400",
      model: "T-400",
      family: "T",
      equipmentClass: "washer",
      revisionId: "revision-1",
      revision: 1,
      publicationMode: "automatic_official_source_policy",
      discoveryRun: {
        id: "discovery-run-1",
        status: "published",
        normalizedManufacturer: "DEXTER",
        normalizedModel: "T-400",
        provider: "openai",
        model: "gpt-test",
        promptVersion: "catalog-discovery-prompt-v1",
        schemaVersion: "catalog-discovery-schema-v1",
        policyVersion: "automatic-official-source-policy-v1",
        publicationMode: "automatic_official_source_policy",
        revisionId: "revision-1",
        noResultReason: null,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          raw: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        },
        webSearchCallCount: 1,
        pricing: {
          version: "test-pricing-v1",
          inputUsdPerMillionTokens: 1,
          outputUsdPerMillionTokens: 2,
          webSearchUsdPerCall: 0.01,
        },
        estimatedCostUsd: 0.0102,
        responseFingerprint: "f".repeat(64),
        createdAt: timestamp,
        completedAt: timestamp,
      },
      aliases: [],
      productionStartYear: 2010,
      productionEndYear: 2020,
      specs: {
        widthIn: 30,
        depthIn: 35,
        heightIn: 50,
        weightLb: 500,
        capacityLb: 30,
        voltage: ["208 V"],
        phase: ["three_phase"],
        fuel: [],
        configuration: ["Freestanding"],
      },
      sources: [
        {
          id: "source-1",
          url: "https://dexter.com/specification",
          title: "Official specification",
          retrievedAt: timestamp,
          documentRevision: "2026",
          checksum: "a".repeat(64),
          sourceClass: "official_manufacturer",
        },
      ],
      evidence: [
        {
          field: "widthIn",
          sourceId: "source-1",
          locator: "Dimensions table, p. 2",
          officialValue: "30",
          officialUnit: "in",
        },
      ],
    },
    actualSpecs: {
      widthIn: 31.5,
      depthIn: null,
      heightIn: null,
      weightLb: null,
      version: 2,
      updatedAt: timestamp,
      updatedByUserId: "worker-1",
    },
    effectiveSpecs: {
      widthIn: { value: 31.5, source: "actual" },
      depthIn: { value: 35, source: "catalog" },
      heightIn: { value: 50, source: "catalog" },
      weightLb: { value: 500, source: "catalog" },
      capacityLb: { value: 40, source: "machine" },
    },
  },
};

function view(initialDetail = detail, canManage = false) {
  return (
    <MachineDetailView
      initialDetail={initialDetail}
      locations={[]}
      canManage={canManage}
      canVerify={false}
      canRelocate={false}
      initialFiles={[]}
      canUploadFiles={false}
      initialQrLabels={[]}
      canManageQrLabels={false}
      initialPreliminaryHistory={{
        machine: initialDetail.machine,
        inspections: [],
        decisions: [],
        currentDisposition: null,
      }}
      canManagePreliminary={false}
      canApproveDisposition={false}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Machine Catalog facts", () => {
  it("shows automatic publication provenance, sources, usage, and cost", () => {
    render(view());
    expect(
      screen.getByText(
        "Automatically published under the official-source policy.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/100 input tokens/)).toBeTruthy();
    expect(screen.getByText(/1 web search call/)).toBeTruthy();
    expect(screen.getByText(/estimated cost \$0\.0102/)).toBeTruthy();
    expect(
      screen.getByText(/Source class: official manufacturer/),
    ).toBeTruthy();
  });
  it("continues to hide Catalog facts when an authoritative refresh is still pending", async () => {
    const pending = {
      ...detail,
      catalog: { ...detail.catalog!, pendingIdentityResolution: true },
    };
    inventory.getBrowserMachine.mockResolvedValue(pending);
    render(view(pending, true));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Refresh Catalog" }));
    expect(screen.getByText("Catalog resolution pending.")).toBeTruthy();
    expect(screen.queryByText(/Pinned revision/)).toBeNull();
    expect(
      screen.getByRole("spinbutton", { name: "Actual width (in)" }),
    ).toHaveProperty("value", "31.5");
  });

  it("clears an actual override explicitly and displays the returned catalog fallback", async () => {
    const user = userEvent.setup();
    inventory.updateMachineActualSpecs.mockResolvedValue({
      ...detail,
      catalog: {
        ...detail.catalog!,
        actualSpecs: {
          ...detail.catalog!.actualSpecs!,
          widthIn: null,
          version: 3,
        },
        effectiveSpecs: {
          ...detail.catalog!.effectiveSpecs,
          widthIn: { value: 30, source: "catalog" },
        },
      },
    });
    render(view(detail, true));
    await user.clear(
      screen.getByRole("spinbutton", { name: "Actual width (in)" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Save actual measurements" }),
    );
    expect(inventory.updateMachineActualSpecs).toHaveBeenCalledWith(
      detail.machine.id,
      expect.objectContaining({ widthIn: null, expectedVersion: 2 }),
    );
    expect(await screen.findByText("Actual measurements saved.")).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: /Width/ })).getByText(
        "Pinned catalog",
      ),
    ).toBeTruthy();
  });

  it("hides stale Catalog facts after identity edits until an authoritative refresh", async () => {
    const user = userEvent.setup();
    inventory.updateMachineIdentity.mockResolvedValue({
      ...detail.machine,
      version: 2,
    });
    inventory.getBrowserMachine.mockResolvedValue(detail);
    render(view(detail, true));
    await user.click(
      screen.getByRole("button", { name: "Save identity evidence" }),
    );
    expect(await screen.findByText("Catalog resolution pending.")).toBeTruthy();
    expect(screen.queryByText(/Pinned revision/)).toBeNull();
    expect(screen.queryByRole("row", { name: /Width/ })).toBeNull();
    expect(
      screen.getByRole("spinbutton", { name: "Actual width (in)" }),
    ).toHaveProperty("value", "31.5");
    await user.click(screen.getByRole("button", { name: "Refresh Catalog" }));
    expect(await screen.findByText(/Pinned revision 1/)).toBeTruthy();
    expect(inventory.getBrowserMachine).toHaveBeenCalledWith(detail.machine.id);
  });

  it("replaces Catalog facts and form values when refreshed server data arrives", () => {
    const rendered = render(view(detail, true));
    rendered.rerender(
      view(
        {
          ...detail,
          catalog: {
            ...detail.catalog!,
            actualSpecs: {
              ...detail.catalog!.actualSpecs!,
              widthIn: 34,
              version: 4,
            },
            effectiveSpecs: {
              ...detail.catalog!.effectiveSpecs,
              widthIn: { value: 34, source: "actual" },
            },
          },
        },
        true,
      ),
    );
    expect(
      screen.getByRole("spinbutton", { name: "Actual width (in)" }),
    ).toHaveProperty("value", "34");
    expect(
      within(screen.getByRole("row", { name: /Width/ })).getAllByText("34 in"),
    ).toHaveLength(2);
  });

  it("keeps actual measurements available without Catalog enrichment and blocks offline saves", () => {
    render(view({ ...detail, catalog: undefined }, true));
    expect(
      screen.queryByRole("heading", { name: "Catalog specifications" }),
    ).toBeNull();
    expect(
      screen.getByRole("spinbutton", { name: "Actual width (in)" }),
    ).toHaveProperty("value", "");
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    fireEvent(window, new Event("offline"));
    expect(
      screen.getByRole("button", { name: "Save actual measurements" }),
    ).toHaveProperty("disabled", true);
    expect(inventory.updateMachineActualSpecs).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("keeps the saved measurements visible when an override save fails", async () => {
    inventory.updateMachineActualSpecs.mockRejectedValue(new Error("Conflict"));
    const user = userEvent.setup();
    render(view(detail, true));
    await user.click(
      screen.getByRole("button", { name: "Save actual measurements" }),
    );
    expect(
      await screen.findByText(/Measurements could not be saved/),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: /Width/ })).getAllByText(
        "31.5 in",
      ),
    ).toHaveLength(2);
  });

  it.each([
    { kind: "unknown" as const, reason: "serial_rule_unavailable" as const },
    {
      kind: "range" as const,
      startYear: 2001,
      endYear: 2011,
      ruleId: "serial-rule-2",
      ruleRevision: 2,
      sourceId: "source-1",
      locator: "Serial date table, p. 5",
    },
  ])(
    "labels serial date $kind independently from model production dates",
    (manufactureDate) => {
      render(
        view({ ...detail, catalog: { ...detail.catalog!, manufactureDate } }),
      );
      expect(
        screen.getByText(
          `Manufacture year: ${manufactureDate.kind === "unknown" ? "Unknown" : "2001–2011 · Serial rule serial-rule-2, revision 2 · Source source-1: Serial date table, p. 5"}`,
        ),
      ).toBeTruthy();
      expect(
        screen.getByText(/Model production range: 2010–2020/),
      ).toBeTruthy();
    },
  );

  it("saves measured overrides separately and replaces effective values from the server", async () => {
    const user = userEvent.setup();
    inventory.updateMachineActualSpecs.mockResolvedValue({
      ...detail,
      catalog: {
        ...detail.catalog!,
        actualSpecs: {
          ...detail.catalog!.actualSpecs!,
          widthIn: 32,
          version: 3,
        },
        effectiveSpecs: {
          ...detail.catalog!.effectiveSpecs,
          widthIn: { value: 32, source: "actual" },
        },
      },
    });
    render(view(detail, true));
    const width = screen.getByRole("spinbutton", { name: "Actual width (in)" });
    await user.clear(width);
    await user.type(width, "32");
    await user.click(
      screen.getByRole("button", { name: "Save actual measurements" }),
    );
    expect(inventory.updateMachineActualSpecs).toHaveBeenCalledWith(
      detail.machine.id,
      {
        widthIn: 32,
        depthIn: null,
        heightIn: null,
        weightLb: null,
        expectedVersion: 2,
      },
    );
    expect(await screen.findByText("Actual measurements saved.")).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: /Width/ })).getAllByText("32 in"),
    ).toHaveLength(2);
  });

  it("distinguishes pinned source facts, serial year, actual and effective measurements", () => {
    render(view());
    expect(screen.getByText(/Pinned revision 1 · revision-1/)).toBeTruthy();
    expect(screen.getByText(/Manufacture year: 2018/)).toBeTruthy();
    expect(
      screen.getByText(
        /Serial rule serial-rule-1, revision 3 · Source source-1: Serial date table, p. 4/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Model production range: 2010–2020/)).toBeTruthy();
    const width = within(screen.getByRole("row", { name: /Width/ }));
    expect(width.getByText("30 in")).toBeTruthy();
    expect(width.getAllByText("31.5 in")).toHaveLength(2);
    expect(width.getByText("Actual measurement")).toBeTruthy();
    expect(screen.getByRole("row", { name: /Capacity/ }).textContent).toContain(
      "Machine record",
    );
    expect(
      screen
        .getByRole("link", { name: "Official specification" })
        .getAttribute("href"),
    ).toBe("https://dexter.com/specification");
    expect(screen.getByText(/Dimensions table, p. 2/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Save actual measurements" }),
    ).toBeNull();
  });
});

const catalogList = {
  models: [
    {
      manufacturerId: "dexter",
      manufacturer: "Dexter",
      modelId: "t-400",
      family: "T Series",
      model: "T-400",
      equipmentClass: "washer" as const,
      revisionId: "revision-1",
      revision: 1,
    },
  ],
  page: 2,
  pageSize: 1,
  total: 3,
};

const catalogModel = {
  ...catalogList.models[0]!,
  aliases: ["T400"],
  productionStartYear: 2010,
  productionEndYear: 2020,
  specs: {
    widthIn: 30,
    depthIn: null,
    heightIn: 50,
    weightLb: null,
    capacityLb: 40,
    voltage: ["208 V"],
    phase: ["three_phase" as const],
    fuel: [],
    configuration: [],
  },
  sources: [
    {
      id: "source-1",
      url: "https://example.test/model.pdf",
      title: "Official model guide",
      retrievedAt: timestamp,
      documentRevision: "2026",
      checksum: "a".repeat(64),
    },
  ],
  evidence: [
    {
      field: "widthIn" as const,
      sourceId: "source-1",
      locator: "Dimensions table, p. 2",
      officialValue: "30",
      officialUnit: "in",
    },
  ],
};

describe("Catalog browse UI", () => {
  it("renders searchable results and preserves filters in pagination links", () => {
    render(
      <CatalogView
        initialResults={catalogList}
        initialQuery="T-400"
        initialManufacturer="Dexter"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "3 approved models" }),
    ).toBeTruthy();
    expect(screen.getByText("T-400")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "View model" }).getAttribute("href"),
    ).toBe("/catalog/revision-1");
    expect(
      screen.getByRole("link", { name: "Previous page" }).getAttribute("href"),
    ).toBe("/catalog?query=T-400&manufacturer=Dexter");
    expect(
      screen.getByRole("link", { name: "Next page" }).getAttribute("href"),
    ).toBe("/catalog?query=T-400&manufacturer=Dexter&page=3");
  });

  it("renders an explicit empty state", () => {
    render(
      <CatalogView
        initialResults={{ ...catalogList, models: [], total: 0, page: 1 }}
        initialQuery="missing"
        initialManufacturer="Unknown"
      />,
    );
    expect(
      screen.getByText("No approved Catalog models match these filters."),
    ).toBeTruthy();
  });

  it("renders model specifications and source-backed field evidence", () => {
    render(<CatalogDetailView model={catalogModel} />);
    expect(screen.getByRole("heading", { name: "T-400" })).toBeTruthy();
    const widthRows = screen
      .getAllByRole("row")
      .filter((row) => row.textContent?.startsWith("Width"));
    expect(widthRows[0]?.textContent).toContain("30 in");
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(screen.getByText("T400")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Official model guide" })
        .getAttribute("href"),
    ).toBe("https://example.test/model.pdf");
    expect(screen.getByText("Checksum verified")).toBeTruthy();
    expect(screen.getByText("Dimensions table, p. 2")).toBeTruthy();
  });
});
