"use client";

import type {
  FileAttachment,
  Machine,
  PreliminaryInspectionHistoryResponse,
} from "@laundrorama/contracts";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createFileDownloadUrl } from "../../../../lib/files-client";
import { finalizePreliminaryDisposition } from "../../../../lib/production-client";
import { useOnlineStatus } from "../../online-status";

const dispositionLabel = {
  repairable: "Repairable",
  hold: "Hold",
  parts_only: "Parts only",
  scrap: "Scrap",
  owner_review: "Owner review",
} as const;
const bearingLabel = {
  no_concern_observed: "No concern observed",
  concern_observed: "Concern observed",
  not_applicable: "Not applicable",
  unable_to_assess: "Unable to assess",
} as const;

export function PreliminaryInspectionPanel({
  machine,
  history,
  canManage,
  canApprove,
  onRecorded,
}: Readonly<{
  machine: Machine;
  history: PreliminaryInspectionHistoryResponse;
  files?: FileAttachment[];
  canManage: boolean;
  canApprove: boolean;
  onRecorded: (history: PreliminaryInspectionHistoryResponse) => void;
}>) {
  const online = useOnlineStatus();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const awaitingOwner =
    history.currentDisposition?.disposition === "owner_review" &&
    history.currentDisposition.inspectionId === history.inspections[0]?.id;

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) {
      setMessage("Reconnect before recording an Owner decision.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const latest = history.inspections[0];
    if (!latest) return;
    setBusy(true);
    try {
      const updated = await finalizePreliminaryDisposition(
        machine.id,
        latest.id,
        {
          expectedMachineVersion: machine.version,
          disposition: String(form.get("disposition")) as "parts_only",
          reason: String(form.get("reason") ?? "").trim(),
        },
        crypto.randomUUID(),
      );
      onRecorded(updated);
      setMessage("Owner disposition recorded.");
    } catch {
      setMessage("Decision could not be saved. Refresh the Machine and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function openEvidence(fileId: string) {
    if (!online) {
      setMessage("Reconnect before opening private evidence.");
      return;
    }
    try {
      window.location.assign(await createFileDownloadUrl(fileId));
    } catch {
      setMessage("Private evidence could not be opened. Retry when connected.");
    }
  }

  return (
    <section
      className="panel inventory-stack preliminary-inspection"
      aria-labelledby="preliminary-heading"
    >
      <div>
        <p className="eyebrow">Production</p>
        <h2 id="preliminary-heading">Preliminary inspection</h2>
        <p>
          Current disposition:{" "}
          {history.currentDisposition
            ? dispositionLabel[history.currentDisposition.disposition]
            : "Not assessed"}
          . This early decision does not release the Machine from QA.
        </p>
      </div>
      {message ? (
        <p role="status" className="form-message">
          {message}
        </p>
      ) : null}
      {canManage &&
      machine.inventoryState === "on_hand" &&
      machine.productionState === "not_assessed" &&
      (machine.machineType === "washer" || machine.machineType === "dryer") ? (
        <Link
          className="button-link"
          href={`/work/initial-check/${machine.id}`}
        >
          Open initial check
        </Link>
      ) : null}
      {canApprove && awaitingOwner && machine.inventoryState === "on_hand" ? (
        <form className="preliminary-form" onSubmit={approve}>
          <h3>Owner decision</h3>
          <p>Review the latest inspection and record a final disposition.</p>
          <label>
            Final disposition
            <select
              name="disposition"
              aria-label="Final disposition"
              defaultValue={
                history.inspections[0]?.recommendation === "scrap"
                  ? "scrap"
                  : "parts_only"
              }
            >
              <option value="parts_only">Parts only</option>
              <option value="scrap">Scrap</option>
              <option value="repairable">Repairable</option>
              <option value="hold">Hold</option>
            </select>
          </label>
          <label>
            Decision reason
            <textarea name="reason" maxLength={2000} required />
          </label>
          <button type="submit" disabled={busy || !online}>
            Record Owner decision
          </button>
        </form>
      ) : null}
      {history.inspections.length > 0 ? (
        <details className="inventory-list">
          <summary>Inspection and decision history</summary>
          {history.inspections.map((inspection) => (
            <article
              className="history-row preliminary-history-entry"
              key={inspection.id}
            >
              <strong>
                {new Date(inspection.createdAt).toLocaleString()} ·{" "}
                {dispositionLabel[inspection.recommendation]} recommended
              </strong>
              <span>Condition: {inspection.condition}</span>
              <span>
                Bearing: {bearingLabel[inspection.bearingAssessment]}
                {inspection.bearingNotes ? ` · ${inspection.bearingNotes}` : ""}
              </span>
              <span>
                Missing parts: {inspection.missingParts || "None recorded"}
              </span>
              <span>Damage: {inspection.damage || "None recorded"}</span>
              <span>
                Recommendation reason: {inspection.recommendationReason}
              </span>
              <small>
                Inspected by {inspection.inspectedByUserId} · Request{" "}
                {inspection.requestId}
              </small>
              {inspection.evidence.length ? (
                <div className="preliminary-evidence-links">
                  {inspection.evidence.map((file) => (
                    <button
                      type="button"
                      className="secondary-button"
                      key={file.id}
                      onClick={() => void openEvidence(file.id)}
                      disabled={!online}
                    >
                      {file.originalFilename}
                    </button>
                  ))}
                </div>
              ) : null}
              {history.decisions
                .filter((entry) => entry.inspectionId === inspection.id)
                .map((entry) => (
                  <div className="preliminary-decision" key={entry.id}>
                    <strong>
                      {dispositionLabel[entry.disposition]} · Machine version{" "}
                      {entry.machineVersion}
                    </strong>
                    <span>{entry.reason}</span>
                    <small>
                      Decided by {entry.decidedByUserId}
                      {entry.approvedByUserId
                        ? ` · Approved by ${entry.approvedByUserId}`
                        : ""}{" "}
                      · {new Date(entry.createdAt).toLocaleString()}
                    </small>
                  </div>
                ))}
            </article>
          ))}
        </details>
      ) : null}
    </section>
  );
}
