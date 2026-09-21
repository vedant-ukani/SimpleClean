"use client";

import type {
  FileAttachment,
  InventoryLocation,
  Machine,
  MachineDetail,
  QrLabel,
} from "@simply-clean/contracts";
import { useState, type FormEvent } from "react";

import {
  InventoryRequestError,
  relocateMachine,
  updateMachineIdentity,
  verifyMachine,
} from "../../../../lib/inventory-client";
import { MachineIdentityStatus, recorded } from "../machine-labels";
import { AttachmentsPanel } from "../../attachments-panel";
import { MachineQrPanel } from "./machine-qr-panel";

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
}>) {
  const [machine, setMachine] = useState(initialDetail.machine);
  const [message, setMessage] = useState<string>();

  async function updateIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nullable = (name: string) => String(form.get(name) ?? "") || null;
    try {
      setMachine(
        await updateMachineIdentity(machine.id, {
          manufacturer: nullable("manufacturer"),
          model: nullable("model"),
          serial: nullable("serial"),
          voltage: nullable("voltage"),
          phase: nullable("phase") as Machine["phase"],
          fuel: nullable("fuel") as Machine["fuel"],
          sourceKind: "manual",
          expectedVersion: machine.version,
        }),
      );
      setMessage("Identity evidence saved. Verification is required again.");
    } catch {
      setMessage(
        "The Machine changed elsewhere or the input is invalid. Refresh and retry.",
      );
    }
  }

  async function verify() {
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
    }
  }

  async function relocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
            <dt>Load</dt>
            <dd>{machine.sourceLoadDisplayName}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{machine.currentLocationCode ?? "Not assigned"}</dd>
          </div>
          <div>
            <dt>Inventory state</dt>
            <dd>{machine.inventoryState}</dd>
          </div>
          <div>
            <dt>Production state</dt>
            <dd>{machine.productionState}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{machine.version}</dd>
          </div>
        </dl>
      </section>
      <AttachmentsPanel
        target={{ type: "machine", id: machine.id }}
        initialFiles={initialFiles}
        canUpload={canUploadFiles}
      />
      <MachineQrPanel
        machineId={machine.id}
        initialLabels={initialQrLabels}
        canManage={canManageQrLabels}
      />
      {canManage ? (
        <section className="panel">
          <h2>Record identity evidence</h2>
          <form className="inline-form" onSubmit={updateIdentity}>
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
            <button type="submit">Save identity evidence</button>
            {canVerify ? (
              <button
                type="button"
                className="secondary-button"
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
          <form className="inline-form" onSubmit={relocate}>
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
            <button type="submit">Record relocation</button>
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
