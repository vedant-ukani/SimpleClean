"use client";

import type { InventoryLocation } from "@simply-clean/contracts";
import { useState, type FormEvent } from "react";

import {
  createLocation,
  deactivateLocation,
  updateLocation,
} from "../../../lib/inventory-client";
import { useOnlineStatus } from "../online-status";

export function LocationsView({
  initialLocations,
  canManage,
}: Readonly<{ initialLocations: InventoryLocation[]; canManage: boolean }>) {
  const [locations, setLocations] = useState(initialLocations);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  function replace(updated: InventoryLocation) {
    setLocations((current) =>
      current.map((location) =>
        location.id === updated.id ? updated : location,
      ),
    );
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) {
      setMessage("Reconnect before creating a Location.");
      return;
    }
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const location = await createLocation({
        code: String(form.get("code") ?? ""),
        name: String(form.get("name") ?? ""),
      });
      setLocations((current) => [...current, location]);
      event.currentTarget.reset();
      setMessage("Location created.");
    } catch {
      setMessage("The Location could not be created. Refresh and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(location: InventoryLocation, name: string) {
    if (!online) {
      setMessage("Reconnect before renaming a Location.");
      return;
    }
    setBusy(true);
    try {
      replace(
        await updateLocation(location.id, {
          name,
          expectedVersion: location.version,
        }),
      );
      setMessage("Location updated.");
    } catch {
      setMessage("The Location changed elsewhere. Refresh before retrying.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(location: InventoryLocation) {
    if (!online) {
      setMessage("Reconnect before deactivating a Location.");
      return;
    }
    setBusy(true);
    try {
      replace(await deactivateLocation(location.id, location.version));
      setMessage("Location deactivated. Existing history was preserved.");
    } catch {
      setMessage("The Location could not be deactivated. Refresh and retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="management-grid">
      {canManage ? (
        <section className="panel">
          <h2>Create Location</h2>
          <form className="auth-form" onSubmit={create}>
            <label>
              Code
              <input name="code" required maxLength={80} />
            </label>
            <label>
              Name
              <input name="name" required maxLength={160} />
            </label>
            <button type="submit" disabled={busy || !online}>
              {busy ? "Saving…" : "Create Location"}
            </button>
          </form>
        </section>
      ) : null}
      <section className="panel inventory-list">
        <h2>Location definitions</h2>
        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
        {locations.length === 0 ? (
          <p className="empty-state">No Locations recorded.</p>
        ) : null}
        {locations.map((location) => (
          <article className="inventory-row" key={location.id}>
            <div>
              <strong>{location.code}</strong>
              <span>{location.name}</span>
              <small>{location.active ? "Active" : "Inactive"}</small>
            </div>
            {canManage && location.active ? (
              <div className="row-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || !online}
                  onClick={() => {
                    const name = window.prompt("Location name", location.name);
                    if (name && name !== location.name)
                      void rename(location, name);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  disabled={busy || !online}
                  onClick={() => void deactivate(location)}
                >
                  Deactivate
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
