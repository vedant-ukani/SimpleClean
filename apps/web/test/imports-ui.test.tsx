import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ImportRow } from "@simply-clean/contracts";

import { ImportReview } from "../src/app/(protected)/admin/imports/[importRunId]/import-review";
import { ImportsDashboard } from "../src/app/(protected)/admin/imports/imports-dashboard";
import { canManageImports, navigationForRole } from "../src/lib/navigation";

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
  totalRows: 3,
  readyRows: 1,
  warningRows: 1,
  errorRows: 1,
  approvedRows: 0,
  committedRows: 0,
  failureCode: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const load = {
  id: run.sourceLoadId,
  displayName: run.sourceLoadDisplayName,
  sourceName: null,
  sourceReference: null,
  expectedArrivalAt: null,
  receivedAt: null,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const rows: ImportRow[] = [
  {
    id: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
    runId: run.id,
    sheetName: "Inventory List",
    sourceRowNumber: 2,
    rawCells: [],
    candidate: {
      machineType: "other" as const,
      manufacturer: "Dexter",
      model: "T-30",
      serial: "001234",
      inventoryState: "on_hand" as const,
    },
    classification: "warning" as const,
    findings: ["machine_type_unknown", "duplicate_in_import"],
    approved: false,
    machineId: null,
  },
  {
    id: "2c74c8a4-b4db-4c31-91f4-16c4d941fef8",
    runId: run.id,
    sheetName: "Inventory List",
    sourceRowNumber: 3,
    rawCells: [],
    candidate: {
      machineType: "other" as const,
      manufacturer: "Speed Queen",
      model: "SC60",
      serial: "999",
      inventoryState: "expected" as const,
    },
    classification: "error" as const,
    findings: ["legacy_sold_shipped_unsupported"],
    approved: false,
    machineId: null,
  },
];

describe("inventory imports UI", () => {
  it("keeps Import review in the Owner-only navigation", () => {
    expect(canManageImports("owner_admin")).toBe(true);
    expect(canManageImports("warehouse")).toBe(false);
    expect(canManageImports("technician_cleaner")).toBe(false);
    expect(navigationForRole("owner_admin")).toContainEqual({
      href: "/admin/imports",
      label: "Imports",
    });
    expect(navigationForRole("warehouse")).not.toContainEqual(
      expect.objectContaining({ href: "/admin/imports" }),
    );
  });

  it("shows private staging, Load selection, and source counts", () => {
    const markup = renderToStaticMarkup(
      <ImportsDashboard initialRuns={[run]} loads={[load]} />,
    );
    expect(markup).toContain("Stage inventory file");
    expect(markup).toContain('accept=".xlsx,.csv');
    expect(markup).toContain("Legacy inventory");
    expect(markup).toContain("1 ready");
    expect(markup).toContain("1 warning");
    expect(markup).toContain("1 error");
    expect(markup).toContain(`/admin/imports/${run.id}`);
  });

  it("renders findings, disables error approval, and selects no rows by default", () => {
    const markup = renderToStaticMarkup(
      <ImportReview
        run={run}
        rowResult={{ rows, page: 1, pageSize: 50, total: 2 }}
        classification="warning"
      />,
    );
    expect(markup).toContain("Warning — review required");
    expect(markup).toContain("Error — cannot approve");
    expect(markup).toContain("machine type unknown");
    expect(markup).toContain("legacy sold shipped unsupported");
    expect(markup).toContain("Approve 0 selected");
    expect(markup).not.toContain('checked=""');
    expect(markup).toContain('aria-label="Approve source row 3"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain(`/api/imports/${run.id}/source`);
    expect(markup).toContain(`/api/imports/${run.id}/report`);
    expect(markup).toContain('value="warning" selected=""');
  });

  it("requires an explicit commit confirmation for an approved run", () => {
    const markup = renderToStaticMarkup(
      <ImportReview
        run={{ ...run, state: "approved", version: 2, approvedRows: 1 }}
        rowResult={{ rows: [], page: 1, pageSize: 50, total: 0 }}
      />,
    );
    expect(markup).toContain("I confirm this exact approved selection");
    expect(markup).toContain("Create provisional Machines");
    expect(markup).toContain('disabled=""');
  });

  it("requires a new run after the approved duplicate snapshot changes", () => {
    const markup = renderToStaticMarkup(
      <ImportReview
        run={{
          ...run,
          state: "commit_failed",
          version: 3,
          approvedRows: 1,
          failureCode: "duplicate_state_changed",
        }}
        rowResult={{ rows: [], page: 1, pageSize: 50, total: 0 }}
      />,
    );
    expect(markup).toContain("Inventory matches changed");
    expect(markup).toContain("Start a new import");
    expect(markup).not.toContain("Create provisional Machines");
  });
});
