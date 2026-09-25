"use client";

import type { AcquisitionLoad, FileAttachment } from "@laundrorama/contracts";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { updateLoad } from "../../../../lib/inventory-client";
import { createIntakeBatch } from "../../../../lib/intake-client";
import { AttachmentsPanel } from "../../attachments-panel";
import { useOnlineStatus } from "../../online-status";
import { useServerState } from "../../use-server-state";
import {
  displayExpectedArrival,
  displayReceived,
  expectedArrivalDate,
  expectedArrivalFromDate,
} from "../load-dates";

export function LoadDetailView({
  initialLoad,
  canManage,
  canManageIntake,
  initialFiles,
  canUploadFiles,
}: Readonly<{
  initialLoad: AcquisitionLoad;
  canManage: boolean;
  canManageIntake: boolean;
  initialFiles: FileAttachment[];
  canUploadFiles: boolean;
}>) {
  const [load, setLoad] = useServerState(initialLoad);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [startingIntake, setStartingIntake] = useState(false);
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
          expectedArrivalAt: expectedArrivalFromDate(
            String(form.get("expectedArrivalDate") ?? ""),
          ),
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
      <section className="panel detail-grid load-overview-panel">
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
            <dd>{displayExpectedArrival(load.expectedArrivalAt)}</dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd>{displayReceived(load.receivedAt)}</dd>
          </div>
        </dl>
        <Link
          className="button-link"
          href={`/machines?query=${encodeURIComponent(load.displayName)}`}
        >
          Find Machines from this Load
        </Link>
      </section>
      {canManageIntake ? (
        <section className="panel load-next-action">
          <div>
            <p className="eyebrow">Next operational action</p>
            <h2>Laundrorama photo intake</h2>
          </div>
          <p>
            Review private arrival and nameplate evidence together before
            creating Machines.
          </p>
          <button
            type="button"
            disabled={startingIntake || !online}
            onClick={async () => {
              setStartingIntake(true);
              try {
                const batch = await createIntakeBatch(load.id);
                window.location.assign(`/loads/${load.id}/intake/${batch.id}`);
              } catch {
                setMessage("Could not start Intake. Reconnect and retry.");
              } finally {
                setStartingIntake(false);
              }
            }}
          >
            {startingIntake ? "Starting…" : "Start Laundrorama intake"}
          </button>
        </section>
      ) : null}
      <div className="load-evidence-panel">
        <AttachmentsPanel
          target={{ type: "load", id: load.id }}
          initialFiles={initialFiles}
          canUpload={canUploadFiles}
        />
      </div>
      {canManage ? (
        <section className="panel load-maintenance-panel">
          <p className="eyebrow">Maintenance</p>
          <h2>Edit Load</h2>
          {message ? (
            <p className="form-message" role="status">
              {message}
            </p>
          ) : null}
          <form
            key={`load-${load.version}`}
            className="inline-form"
            onSubmit={update}
          >
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
            <label>
              Expected arrival date
              <input
                name="expectedArrivalDate"
                type="date"
                defaultValue={expectedArrivalDate(load.expectedArrivalAt)}
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
