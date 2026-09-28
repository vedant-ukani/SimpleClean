"use client";

import type {
  AcquisitionLoad,
  FileAttachment,
  IntakeBatchSummary,
} from "@laundrorama/contracts";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { updateLoad } from "../../../../lib/inventory-client";
import { createIntakeBatch } from "../../../../lib/intake-client";
import { downloadIntakeQrLabelSheet } from "../../../../lib/qr-client";
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
  initialBatches,
  canManage,
  canManageIntake,
  canReadIntake,
  canPrintIntake,
  initialFiles,
  canUploadFiles,
}: Readonly<{
  initialLoad: AcquisitionLoad;
  initialBatches: IntakeBatchSummary[];
  canManage: boolean;
  canManageIntake: boolean;
  canReadIntake: boolean;
  canPrintIntake: boolean;
  initialFiles: FileAttachment[];
  canUploadFiles: boolean;
}>) {
  const [load, setLoad] = useServerState(initialLoad);
  const [batches] = useServerState(initialBatches);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [startingIntake, setStartingIntake] = useState(false);
  const [printingBatchId, setPrintingBatchId] = useState<string>();
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
      {message ? (
        <p className="form-message" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
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
      {canManageIntake && !load.receivedAt ? (
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
      {canReadIntake ? (
        <section
          className="panel inventory-list"
          aria-labelledby="load-intake-history-heading"
        >
          <h2 id="load-intake-history-heading">Intake history</h2>
          {batches.length === 0 ? (
            <p className="empty-state">
              No Intake Batches have been started for this Load.
            </p>
          ) : (
            batches.map((batch) => (
              <article
                className="inventory-row intake-history-row"
                key={batch.id}
              >
                <div>
                  <strong>
                    {batch.state === "open" ? "Open" : "Completed"} Intake
                  </strong>
                  <small>
                    {batch.state === "open" ? "Last updated" : "Completed"}:{" "}
                    {new Date(batch.updatedAt).toLocaleString()}
                  </small>
                  <small>
                    {batch.candidateCount} items · {batch.machineCount} Machines
                  </small>
                </div>
                <div className="intake-history-actions">
                  <Link
                    href={`/loads/${load.id}/intake/${batch.id}`}
                    aria-disabled={!online}
                    tabIndex={online ? undefined : -1}
                    onClick={(event) => {
                      if (!online) event.preventDefault();
                    }}
                  >
                    {batch.state === "open" ? "Resume Intake" : "View Intake"}
                  </Link>
                  {batch.state === "committed" &&
                  batch.machineCount > 0 &&
                  canPrintIntake ? (
                    <button
                      type="button"
                      disabled={!online || Boolean(printingBatchId)}
                      onClick={async () => {
                        if (!online) return;
                        setPrintingBatchId(batch.id);
                        try {
                          const presentation = await downloadIntakeQrLabelSheet(
                            batch.id,
                          );
                          setMessage(
                            presentation === "opened"
                              ? "QR label sheet opened in a new tab."
                              : "QR label sheet downloaded.",
                          );
                        } catch {
                          setMessage(
                            "QR label sheet could not be printed. Reconnect and retry.",
                          );
                        } finally {
                          setPrintingBatchId(undefined);
                        }
                      }}
                    >
                      {printingBatchId === batch.id
                        ? "Preparing QR labels…"
                        : `Print all QR labels (${batch.machineCount})`}
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
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
