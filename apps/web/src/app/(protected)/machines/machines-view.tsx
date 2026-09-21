"use client";

import type {
  AcquisitionLoad,
  InventoryLocation,
  MachineSearchResponse,
  Machine as MachineRecord,
} from "@simply-clean/contracts";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { createMachine } from "../../../lib/inventory-client";
import { MachineIdentityStatus, recorded } from "./machine-labels";

export function MachinesView({
  initialResults,
  loads,
  locations,
  canManage,
  canRelocate,
  initialQuery,
}: Readonly<{
  initialResults: MachineSearchResponse;
  loads: AcquisitionLoad[];
  locations: InventoryLocation[];
  canManage: boolean;
  canRelocate: boolean;
  initialQuery: string;
}>) {
  const [machines, setMachines] = useState(initialResults.machines);
  const [message, setMessage] = useState<string>();

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const locationId = String(form.get("currentLocationId") ?? "");
      const machine = await createMachine({
        machineType: String(
          form.get("machineType") ?? "",
        ) as MachineRecord["machineType"],
        sourceLoadId: String(form.get("sourceLoadId") ?? ""),
        currentLocationId: locationId || null,
        sourceKind: "manual",
        inventoryState: "expected",
      });
      setMachines((current) => [machine, ...current]);
      setMessage("Provisional Machine created with an immutable ID.");
    } catch {
      setMessage("The Machine could not be created. Check the Load and retry.");
    }
  }

  return (
    <div className="inventory-stack">
      <section className="panel">
        <form className="search-form" method="get">
          <label>
            Search by ID, manufacturer, model, serial, Load, or Location
            <input name="query" defaultValue={initialQuery} maxLength={160} />
          </label>
          <button type="submit">Search</button>
        </form>
      </section>
      {canManage ? (
        <section className="panel">
          <h2>Create provisional Machine</h2>
          {loads.length === 0 ? (
            <p className="empty-state">
              Create a Load before creating a Machine.
            </p>
          ) : (
            <form className="inline-form" onSubmit={create}>
              <label>
                Type
                <select name="machineType">
                  <option value="washer">Washer</option>
                  <option value="dryer">Dryer</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Source Load
                <select name="sourceLoadId">
                  {loads.map((load) => (
                    <option key={load.id} value={load.id}>
                      {load.displayName}
                    </option>
                  ))}
                </select>
              </label>
              {canRelocate ? (
                <label>
                  Initial Location
                  <select name="currentLocationId">
                    <option value="">Not assigned</option>
                    {locations
                      .filter((location) => location.active)
                      .map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.code} — {location.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              <button type="submit">Create Machine</button>
            </form>
          )}
        </section>
      ) : null}
      <section className="panel inventory-list">
        <h2>
          {initialResults.total} Machine{initialResults.total === 1 ? "" : "s"}
        </h2>
        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
        {machines.length === 0 ? (
          <p className="empty-state">No Machines match this search.</p>
        ) : null}
        {machines.map((machine) => (
          <article className="inventory-row" key={machine.id}>
            <div>
              <strong>
                {recorded(machine.manufacturer)} {recorded(machine.model)}
              </strong>
              <span>Serial: {recorded(machine.serial)}</span>
              <small>
                {machine.currentLocationCode ?? "Location not assigned"} ·{" "}
                {machine.machineType}
              </small>
              <MachineIdentityStatus machine={machine} />
            </div>
            <Link href={`/machines/${machine.id}`}>View Machine</Link>
          </article>
        ))}
      </section>
    </div>
  );
}
