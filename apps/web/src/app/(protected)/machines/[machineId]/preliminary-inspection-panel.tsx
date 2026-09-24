"use client";

import type {
  FileAttachment,
  Machine,
  PreliminaryInspectionHistoryResponse,
} from "@simply-clean/contracts";
import { useState, type FormEvent } from "react";
import { createFileDownloadUrl } from "../../../../lib/files-client";
import {
  createPreliminaryInspection,
  finalizePreliminaryDisposition,
} from "../../../../lib/production-client";
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
  files,
  canManage,
  canApprove,
  onRecorded,
}: Readonly<{
  machine: Machine;
  history: PreliminaryInspectionHistoryResponse;
  files: FileAttachment[];
  canManage: boolean;
  canApprove: boolean;
  onRecorded: (history: PreliminaryInspectionHistoryResponse) => void;
}>) {
  const online = useOnlineStatus();
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const readyEvidence = files.filter(
    (file) =>
      file.target.type === "machine" &&
      file.target.id === machine.id &&
      file.purpose === "preliminary_inspection" &&
      file.state === "ready",
  );
  const awaitingOwner =
    history.currentDisposition?.disposition === "owner_review" &&
    history.currentDisposition.inspectionId === history.inspections[0]?.id;

  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) {
      setMessage("Reconnect before recording an inspection.");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      const updated = await createPreliminaryInspection(
        machine.id,
        {
          expectedMachineVersion: machine.version,
          condition: String(form.get("condition") ?? "").trim(),
          bearingAssessment: String(
            form.get("bearingAssessment"),
          ) as "no_concern_observed",
          bearingNotes: String(form.get("bearingNotes") ?? "").trim(),
          missingParts: String(form.get("missingParts") ?? "").trim(),
          damage: String(form.get("damage") ?? "").trim(),
          recommendation: String(form.get("recommendation")) as "repairable",
          reason: String(form.get("reason") ?? "").trim(),
          evidenceFileIds: selectedEvidence,
        },
        crypto.randomUUID(),
      );
      onRecorded(updated);
      formElement.reset();
      setSelectedEvidence([]);
      setMessage("Inspection and disposition recorded.");
    } catch {
      setMessage(
        "Inspection could not be saved. Refresh the Machine and check the evidence before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }

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
      {canManage && machine.inventoryState === "on_hand" ? (
        <form className="preliminary-form" onSubmit={record}>
          <label>
            Condition observed
            <textarea name="condition" maxLength={2000} required />
          </label>
          <label>
            Bearing assessment
            <select
              name="bearingAssessment"
              aria-label="Bearing assessment"
              required
            >
              {Object.entries(bearingLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bearing notes
            <textarea name="bearingNotes" maxLength={2000} />
          </label>
          <label>
            Missing parts
            <textarea name="missingParts" maxLength={2000} />
          </label>
          <label>
            Damage
            <textarea name="damage" maxLength={2000} />
          </label>
          <label>
            Recommendation
            <select name="recommendation" aria-label="Recommendation" required>
              {Object.entries(dispositionLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reason for recommendation
            <textarea name="reason" maxLength={2000} required />
          </label>
          <fieldset>
            <legend>Private inspection evidence (optional)</legend>
            {readyEvidence.length ? (
              readyEvidence.map((file) => (
                <label className="preliminary-evidence-option" key={file.id}>
                  <input
                    type="checkbox"
                    checked={selectedEvidence.includes(file.id)}
                    onChange={(event) =>
                      setSelectedEvidence((current) =>
                        event.target.checked
                          ? [...current, file.id]
                          : current.filter((id) => id !== file.id),
                      )
                    }
                  />
                  {file.originalFilename}
                </label>
              ))
            ) : (
              <p>
                Upload Preliminary inspection media in Attachments to select it
                here.
              </p>
            )}
          </fieldset>
          <button
            type="submit"
            disabled={busy || !online || selectedEvidence.length > 12}
          >
            Record inspection
          </button>
        </form>
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
      <div className="inventory-list">
        <h3>Inspection and decision history</h3>
        {history.inspections.length === 0 ? (
          <p className="empty-state">No preliminary inspections recorded.</p>
        ) : (
          history.inspections.map((inspection) => (
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
          ))
        )}
      </div>
    </section>
  );
}
