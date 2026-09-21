"use client";

import type { AcquisitionLoad, FileAttachment } from "@simply-clean/contracts";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { updateLoad } from "../../../../lib/inventory-client";
import { AttachmentsPanel } from "../../attachments-panel";
import { useOnlineStatus } from "../../online-status";

export function LoadDetailView({
  initialLoad,
  canManage,
  initialFiles,
  canUploadFiles,
}: Readonly<{
  initialLoad: AcquisitionLoad;
  canManage: boolean;
  initialFiles: FileAttachment[];
  canUploadFiles: boolean;
}>) {
  const [load, setLoad] = useState(initialLoad);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) {
      setMessage("Reconnect before saving this Load.");
      return;
    }
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      setLoad(
        await updateLoad(load.id, {
          displayName: String(form.get("displayName") ?? ""),
          sourceName: String(form.get("sourceName") ?? "") || null,
          sourceReference: String(form.get("sourceReference") ?? "") || null,
          expectedVersion: load.version,
        }),
      );
      setMessage("Load updated.");
    } catch {
      setMessage(
        "The Load changed elsewhere. Refresh the page before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inventory-stack">
      <section className="panel detail-grid">
        <dl>
          <div>
            <dt>Source</dt>
            <dd>{load.sourceName ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{load.sourceReference ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt>Expected arrival</dt>
            <dd>{load.expectedArrivalAt ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd>{load.receivedAt ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{load.version}</dd>
          </div>
        </dl>
        <Link
          className="button-link"
          href={`/machines?query=${encodeURIComponent(load.displayName)}`}
        >
          Find Machines from this Load
        </Link>
      </section>
      <AttachmentsPanel
        target={{ type: "load", id: load.id }}
        initialFiles={initialFiles}
        canUpload={canUploadFiles}
      />
      {canManage ? (
        <section className="panel">
          <h2>Edit Load</h2>
          {message ? (
            <p className="form-message" role="status">
              {message}
            </p>
          ) : null}
          <form className="inline-form" onSubmit={update}>
            <label>
              Display name
              <input
                name="displayName"
                defaultValue={load.displayName}
                required
              />
            </label>
            <label>
              Source name
              <input name="sourceName" defaultValue={load.sourceName ?? ""} />
            </label>
            <label>
              Source reference
              <input
                name="sourceReference"
                defaultValue={load.sourceReference ?? ""}
              />
            </label>
            <button type="submit" disabled={busy || !online}>
              {busy ? "Saving…" : "Save Load"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
