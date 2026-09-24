"use client";

import type {
  FileAttachment,
  InventoryLocation,
  Machine,
  MachineDetail,
  QrLabel,
  PreliminaryInspectionHistoryResponse,
} from "@simply-clean/contracts";
import { useState, type FormEvent } from "react";

import {
  InventoryRequestError,
  getBrowserMachine,
  relocateMachine,
  updateMachineActualSpecs,
  updateMachineIdentity,
  verifyMachine,
} from "../../../../lib/inventory-client";
import { MachineIdentityStatus, recorded } from "../machine-labels";
import { AttachmentsPanel } from "../../attachments-panel";
import { useOnlineStatus } from "../../online-status";
import { useServerState } from "../../use-server-state";
import { MachineQrPanel } from "./machine-qr-panel";
import { PreliminaryInspectionPanel } from "./preliminary-inspection-panel";

export function MachineDetailView({
  initialDetail,
  locations,
  canManage,
  canVerify,
  canRelocate,
  initialFiles,
  canUploadFiles,
  initialQrLabels,
  canManageQrLabels,
  initialPreliminaryHistory,
  canManagePreliminary,
  canApproveDisposition,
}: Readonly<{
  initialDetail: MachineDetail;
  locations: InventoryLocation[];
  canManage: boolean;
  canVerify: boolean;
  canRelocate: boolean;
  initialFiles: FileAttachment[];
  canUploadFiles: boolean;
  initialQrLabels: QrLabel[];
  canManageQrLabels: boolean;
  initialPreliminaryHistory: PreliminaryInspectionHistoryResponse;
  canManagePreliminary: boolean;
  canApproveDisposition: boolean;
}>) {
  const [detail, setDetail] = useServerState<
    MachineDetail & { catalogPending?: boolean }
  >(initialDetail);
  const { machine, catalog } = detail;
  const catalogPending =
    detail.catalogPending || catalog?.pendingIdentityResolution;
  const setMachine = (machine: Machine) =>
    setDetail((current) => ({ ...current, machine }));
  const [message, setMessage] = useState<string>();
  const [files, setFiles] = useServerState(initialFiles);
  const [preliminaryHistory, setPreliminaryHistory] = useServerState(
    initialPreliminaryHistory,
  );
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  function beginOnlineMutation(message: string): boolean {
    if (!online) {
      setMessage(message);
      return false;
    }
    setBusy(true);
    return true;
  }

  async function updateIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!beginOnlineMutation("Reconnect before saving identity evidence."))
      return;
    const form = new FormData(event.currentTarget);
    const nullable = (name: string) => String(form.get(name) ?? "") || null;
    const capacity = String(form.get("capacityLb") ?? "").trim();
    try {
      const updatedMachine = await updateMachineIdentity(machine.id, {
        manufacturer: nullable("manufacturer"),
        model: nullable("model"),
        serial: nullable("serial"),
        voltage: nullable("voltage"),
        phase: nullable("phase") as Machine["phase"],
        fuel: nullable("fuel") as Machine["fuel"],
        capacityLb: capacity ? Number(capacity) : null,
        sourceKind: "manual",
        expectedVersion: machine.version,
      });
      setDetail((current) => ({
        ...current,
        machine: updatedMachine,
        catalogPending: true,
      }));
      setMessage("Identity evidence saved. Verification is required again.");
    } catch {
      setMessage(
        "The Machine changed elsewhere or the input is invalid. Refresh and retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!beginOnlineMutation("Reconnect before verifying Machine identity."))
      return;
    try {
      setMachine(await verifyMachine(machine.id, machine.version));
      setMessage("Machine identity verified.");
    } catch (error) {
      if (error instanceof InventoryRequestError) {
        const conflict = error.identityConflict();
        if (conflict) {
          setMachine(conflict.machine);
          setMessage(
            `Identity conflict with Machine ${conflict.conflictingMachineId}. Correct the identity facts before retrying.`,
          );
          return;
        }
      }
      setMessage(
        "Verification failed. Manufacturer and serial are required; refresh if the version changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveActualSpecs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canManage ||
      !beginOnlineMutation("Reconnect before saving actual measurements.")
    )
      return;
    const form = new FormData(event.currentTarget);
    const measurement = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      return value ? Number(value) : null;
    };
    try {
      const detail = await updateMachineActualSpecs(machine.id, {
        widthIn: measurement("widthIn"),
        depthIn: measurement("depthIn"),
        heightIn: measurement("heightIn"),
        weightLb: measurement("weightLb"),
        expectedVersion: catalog?.actualSpecs?.version ?? 0,
      });
      setDetail(detail);
      setMessage("Actual measurements saved.");
    } catch {
      setMessage(
        "Measurements could not be saved. Refresh and check the values before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshCatalog() {
    if (!beginOnlineMutation("Reconnect before refreshing Catalog facts."))
      return;
    try {
      setDetail(await getBrowserMachine(machine.id));
    } catch {
      setMessage("Catalog facts could not be refreshed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function relocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!beginOnlineMutation("Reconnect before recording a relocation."))
      return;
    const form = new FormData(event.currentTarget);
    try {
      setMachine(
        await relocateMachine(machine.id, {
          toLocationId: String(form.get("toLocationId") ?? ""),
          expectedVersion: machine.version,
        }),
      );
      setMessage("Location updated and history recorded.");
    } catch {
      setMessage(
        "Relocation failed. The Location may be inactive or the Machine changed; refresh and retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inventory-stack">
      <div className="page-heading">
        <p className="eyebrow">Machine · {machine.machineType}</p>
        <h1>
          {recorded(machine.manufacturer)} {recorded(machine.model)}
        </h1>
        <p className="machine-id">{machine.id}</p>
        <MachineIdentityStatus machine={machine} />
      </div>
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      <section className="panel detail-grid">
        <dl>
          <div>
            <dt>Serial</dt>
            <dd>{recorded(machine.serial)}</dd>
          </div>
          <div>
            <dt>Voltage</dt>
            <dd>{recorded(machine.voltage)}</dd>
          </div>
          <div>
            <dt>Phase</dt>
            <dd>{machine.phase ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt>Fuel</dt>
            <dd>{machine.fuel ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt>Capacity</dt>
            <dd>
              {machine.capacityLb == null
                ? "Not recorded"
                : `${machine.capacityLb} lb`}
            </dd>
          </div>
          <div>
            <dt>Load</dt>
            <dd>{machine.sourceLoadDisplayName}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{machine.currentLocationCode ?? "Not assigned"}</dd>
          </div>
          <div>
            <dt>Inventory state</dt>
            <dd>
              {
                {
                  expected: "Expected",
                  on_hand: "On hand",
                  scrapped: "Scrapped",
                }[machine.inventoryState]
              }
            </dd>
          </div>
          <div>
            <dt>Production state</dt>
            <dd>
              {
                {
                  not_assessed: "Not assessed",
                  preliminary_passed: "Preliminary passed",
                  blocked: "Blocked",
                }[machine.productionState]
              }
            </dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{machine.version}</dd>
          </div>
        </dl>
      </section>
      {catalogPending ? (
        <section className="panel">
          <p role="status">Catalog resolution pending.</p>
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => void refreshCatalog()}
          >
            Refresh Catalog
          </button>
        </section>
      ) : catalog ? (
        <section
          className="panel inventory-stack"
          aria-labelledby="catalog-heading"
        >
          <h2 id="catalog-heading">Catalog specifications</h2>
          <p>Catalog match: {catalog.status.replaceAll("_", " ")}</p>
          <p>
            Manufacture year:{" "}
            {catalog.manufactureDate.kind === "exact"
              ? catalog.manufactureDate.year
              : catalog.manufactureDate.kind === "range"
                ? `${catalog.manufactureDate.startYear}–${catalog.manufactureDate.endYear}`
                : "Unknown"}
            {catalog.manufactureDate.kind !== "unknown"
              ? ` · Serial rule ${catalog.manufactureDate.ruleId}, revision ${catalog.manufactureDate.ruleRevision} · Source ${catalog.manufactureDate.sourceId}: ${catalog.manufactureDate.locator}`
              : null}
          </p>
          {catalog.revision ? (
            <>
              <p>
                Pinned revision {catalog.revision.revision} ·{" "}
                {catalog.revision.revisionId}
              </p>
              <p>
                {catalog.revision.manufacturer} {catalog.revision.model} ·{" "}
                {catalog.revision.equipmentClass.replaceAll("_", " ")}
              </p>
              <p>
                Model production range:{" "}
                {catalog.revision.productionStartYear ?? "Unknown"}–
                {catalog.revision.productionEndYear ?? "Unknown"}
              </p>
              {catalog.revision.publicationMode ===
              "automatic_official_source_policy" ? (
                <p>Automatically published under the official-source policy.</p>
              ) : null}
              {catalog.revision.discoveryRun ? (
                <p>
                  Discovery usage:{" "}
                  {catalog.revision.discoveryRun.usage?.inputTokens ?? 0} input
                  tokens ·{" "}
                  {catalog.revision.discoveryRun.usage?.outputTokens ?? 0}{" "}
                  output tokens ·{" "}
                  {catalog.revision.discoveryRun.webSearchCallCount} web search
                  call
                  {catalog.revision.discoveryRun.webSearchCallCount === 1
                    ? ""
                    : "s"}{" "}
                  · {catalog.revision.discoveryRun.pricing.version} · estimated
                  cost $
                  {catalog.revision.discoveryRun.estimatedCostUsd.toFixed(4)}
                </p>
              ) : null}
            </>
          ) : (
            <p>No approved model revision is linked.</p>
          )}
          <div className="import-table-wrap">
            <table className="import-table">
              <caption>
                Measurements and the source of each effective value
              </caption>
              <thead>
                <tr>
                  <th scope="col">Specification</th>
                  <th scope="col">Catalog</th>
                  <th scope="col">Actual / Machine</th>
                  <th scope="col">Effective</th>
                  <th scope="col">Effective source</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["widthIn", "Width", "in"],
                    ["depthIn", "Depth", "in"],
                    ["heightIn", "Height", "in"],
                    ["weightLb", "Weight", "lb"],
                    ["capacityLb", "Capacity", "lb"],
                  ] as const
                ).map(([field, label, unit]) => {
                  const catalogValue = catalog.revision?.specs[field];
                  const actualValue =
                    field === "capacityLb"
                      ? machine.capacityLb
                      : catalog.actualSpecs?.[field];
                  const effective = catalog.effectiveSpecs[field];
                  return (
                    <tr key={field}>
                      <th scope="row">{label}</th>
                      <td>
                        {catalogValue == null
                          ? "Unknown"
                          : `${catalogValue} ${unit}`}
                      </td>
                      <td>
                        {actualValue == null
                          ? "Not recorded"
                          : `${actualValue} ${unit}`}
                      </td>
                      <td>
                        {effective.value == null
                          ? "Unknown"
                          : `${effective.value} ${unit}`}
                      </td>
                      <td>
                        {
                          {
                            actual: "Actual measurement",
                            machine: "Machine record",
                            catalog: "Pinned catalog",
                            unknown: "Unknown",
                          }[effective.source]
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {catalog.revision ? (
            <>
              <dl>
                {(
                  [
                    ["voltage", "Catalog voltage"],
                    ["phase", "Catalog phase"],
                    ["fuel", "Catalog fuel"],
                    ["configuration", "Catalog configuration"],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field}>
                    <dt>{label}</dt>
                    <dd>
                      {catalog
                        .revision!.specs[field].map((value) =>
                          value.replaceAll("_", " "),
                        )
                        .join(", ") || "Unknown"}
                    </dd>
                  </div>
                ))}
              </dl>
              <h3>Official sources and field evidence</h3>
              {catalog.revision.sources.map((source) => (
                <div key={source.id}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                  <p>
                    Source class:{" "}
                    {(source.sourceClass ?? "official_manufacturer").replaceAll(
                      "_",
                      " ",
                    )}{" "}
                    · Document revision:{" "}
                    {source.documentRevision ?? "Not recorded"} · Retrieved{" "}
                    {source.retrievedAt.slice(0, 10)}
                  </p>
                  {catalog
                    .revision!.evidence.filter(
                      (evidence) => evidence.sourceId === source.id,
                    )
                    .map((evidence, index) => (
                      <p key={`${evidence.field}-${index}`}>
                        {
                          {
                            widthIn: "Width",
                            depthIn: "Depth",
                            heightIn: "Height",
                            weightLb: "Weight",
                            capacityLb: "Capacity",
                            voltage: "Voltage",
                            phase: "Phase",
                            fuel: "Fuel",
                            configuration: "Configuration",
                            model: "Model",
                            equipmentClass: "Equipment class",
                            productionStartYear: "Production start year",
                            productionEndYear: "Production end year",
                          }[evidence.field]
                        }
                        : {evidence.locator}
                        {evidence.officialValue != null
                          ? ` · Official value: ${evidence.officialValue} ${evidence.officialUnit ?? ""}`
                          : null}
                      </p>
                    ))}
                </div>
              ))}
            </>
          ) : null}
        </section>
      ) : null}
      <AttachmentsPanel
        target={{ type: "machine", id: machine.id }}
        initialFiles={initialFiles}
        canUpload={canUploadFiles}
        onFilesChanged={setFiles}
      />
      <PreliminaryInspectionPanel
        machine={machine}
        history={preliminaryHistory}
        files={files}
        canManage={canManagePreliminary}
        canApprove={canApproveDisposition}
        onRecorded={(history) => {
          setPreliminaryHistory(history);
          setMachine(history.machine);
        }}
      />
      <MachineQrPanel
        machineId={machine.id}
        initialLabels={initialQrLabels}
        canManage={canManageQrLabels}
      />
      {canManage ? (
        <section className="panel">
          <h2>Actual measurements</h2>
          <p>
            Record measurements for this physical Machine. Clear a value to use
            the catalog default when available.
          </p>
          <form
            key={`actual-${machine.id}-${catalog?.actualSpecs?.version ?? 0}`}
            className="inline-form"
            onSubmit={saveActualSpecs}
          >
            {(
              [
                ["widthIn", "Actual width (in)"],
                ["depthIn", "Actual depth (in)"],
                ["heightIn", "Actual height (in)"],
                ["weightLb", "Actual weight (lb)"],
              ] as const
            ).map(([field, label]) => (
              <label key={field}>
                {label}
                <input
                  name={field}
                  type="number"
                  step="any"
                  min={0.001}
                  max={100000}
                  defaultValue={catalog?.actualSpecs?.[field] ?? ""}
                />
              </label>
            ))}
            <button type="submit" disabled={busy || !online}>
              {busy ? "Saving…" : "Save actual measurements"}
            </button>
          </form>
        </section>
      ) : null}
      {canManage ? (
        <section className="panel">
          <h2>Record identity evidence</h2>
          <form
            key={`identity-${machine.version}`}
            className="inline-form"
            onSubmit={updateIdentity}
          >
            <label>
              Manufacturer
              <input
                name="manufacturer"
                defaultValue={machine.manufacturer ?? ""}
              />
            </label>
            <label>
              Model
              <input name="model" defaultValue={machine.model ?? ""} />
            </label>
            <label>
              Serial
              <input name="serial" defaultValue={machine.serial ?? ""} />
            </label>
            <label>
              Voltage
              <input name="voltage" defaultValue={machine.voltage ?? ""} />
            </label>
            <label>
              Capacity (lb)
              <input
                name="capacityLb"
                type="number"
                min={1}
                max={2000}
                defaultValue={machine.capacityLb ?? ""}
              />
            </label>
            <label>
              Phase
              <select name="phase" defaultValue={machine.phase ?? ""}>
                <option value="">Not recorded</option>
                <option value="single_phase">Single phase</option>
                <option value="three_phase">Three phase</option>
              </select>
            </label>
            <label>
              Fuel
              <select name="fuel" defaultValue={machine.fuel ?? ""}>
                <option value="">Not recorded</option>
                <option value="gas">Gas</option>
                <option value="electric">Electric</option>
                <option value="steam">Steam</option>
                <option value="other">Other</option>
              </select>
            </label>
            <button type="submit" disabled={busy || !online}>
              {busy ? "Saving…" : "Save identity evidence"}
            </button>
            {canVerify ? (
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !online}
                onClick={() => void verify()}
              >
                Verify identity
              </button>
            ) : null}
          </form>
        </section>
      ) : null}
      {canRelocate ? (
        <section className="panel">
          <h2>Relocate Machine</h2>
          <form
            key={`relocation-${machine.version}`}
            className="inline-form"
            onSubmit={relocate}
          >
            <label>
              Active destination
              <select
                name="toLocationId"
                required
                defaultValue={machine.currentLocationId ?? ""}
              >
                <option value="" disabled>
                  Select a Location
                </option>
                {locations
                  .filter((location) => location.active)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} — {location.name}
                    </option>
                  ))}
              </select>
            </label>
            <button type="submit" disabled={busy || !online}>
              {busy ? "Saving…" : "Record relocation"}
            </button>
          </form>
        </section>
      ) : null}
      <div className="management-grid">
        <section className="panel inventory-list">
          <h2>Identity evidence</h2>
          {initialDetail.identityEvidence.map((evidence) => (
            <article className="history-row" key={evidence.id}>
              <strong>{evidence.sourceKind}</strong>
              <span>
                {recorded(evidence.manufacturer)} · {recorded(evidence.serial)}
              </span>
              <small>{evidence.createdAt}</small>
            </article>
          ))}
        </section>
        <section className="panel inventory-list">
          <h2>Verification history</h2>
          {initialDetail.verificationHistory.length === 0 ? (
            <p className="empty-state">No verification decision recorded.</p>
          ) : (
            initialDetail.verificationHistory.map((entry) => (
              <article className="history-row" key={entry.id}>
                <strong>
                  {entry.fromState} → {entry.toState}
                </strong>
                <span>
                  {entry.conflictingMachineId
                    ? `Conflict with ${entry.conflictingMachineId}`
                    : `Machine version ${entry.machineVersion}`}
                </span>
                <small>{entry.createdAt}</small>
              </article>
            ))
          )}
        </section>
        <section className="panel inventory-list">
          <h2>Location history</h2>
          {initialDetail.locationHistory.length === 0 ? (
            <p className="empty-state">No relocation recorded.</p>
          ) : (
            initialDetail.locationHistory.map((entry) => (
              <article className="history-row" key={entry.id}>
                <strong>Machine version {entry.machineVersion}</strong>
                <span>
                  {entry.fromLocationId ?? "Unassigned"} → {entry.toLocationId}
                </span>
                <small>{entry.createdAt}</small>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
