"use client";

import type {
  IntakeBatchDetail,
  IntakeCandidate,
  IntakePhoto,
  IntakeRecognitionStatus,
} from "@laundrorama/contracts";
import { useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "../../../../online-status";
import { useServerState } from "../../../../use-server-state";
import {
  assignIntakePhoto,
  commitIntakeBatch,
  confirmIntakeCandidate,
  createIntakeCandidate,
  createIntakePreviewGrant,
  excludeIntakePhoto,
  getBrowserIntakeBatch,
  intakePreviewUrl,
  linkIntakePhoto,
  prepareIntakeItem,
  changeIntakeCandidateType,
  changeIntakeCandidateCapacity,
  removeIntakePhoto,
  getIntakeRecognition,
  IntakeRequestError,
  requestIntakeRecognition,
  submitIntakeRecaptureEvidence,
  updateIntakeCandidate,
} from "../../../../../../lib/intake-client";
import { downloadIntakeQrLabelSheet } from "../../../../../../lib/qr-client";

const INTAKE_IMAGE_ACCEPT = "image/*,.heic,.heif";
const NAMEPLATE_UPLOAD_FAILURE_MESSAGE =
  "Some nameplates could not be uploaded or prepared. Select those photos again.";

type IntakeMessage = { text: string; owner: "upload" | "action" };

async function uploadPhoto(
  file: File,
  loadId: string,
): Promise<{ fileId: string }> {
  const grantResponse = await fetch("/api/files/upload-grants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target: { type: "load", id: loadId },
      purpose: "intake_evidence",
      originalFilename: file.name,
      declaredMediaType: file.type || "image/jpeg",
      declaredByteCount: file.size,
    }),
  });
  if (!grantResponse.ok)
    throw new Error(`Upload grant failed (${grantResponse.status})`);
  const { file: attachment, grant } = (await grantResponse.json()) as {
    file: { id: string };
    grant: { token: string };
  };
  const body = new FormData();
  body.set("file", file);
  const uploadResponse = await fetch(
    `/api/files/${attachment.id}/upload-content`,
    { method: "POST", headers: { "x-file-grant": grant.token }, body },
  );
  if (!uploadResponse.ok)
    throw new Error(`Photo upload failed (${uploadResponse.status})`);
  return { fileId: attachment.id };
}

type UploadStatus = "queued" | "uploading" | "linked" | "failed";
type UploadItem = {
  id: string;
  file: File;
  status: UploadStatus;
  error?: string;
};

type StagedNameplate = {
  id: string;
  file: File;
};

type CandidateDraft = {
  machineType: string;
  manufacturer: string;
  model: string;
  serial: string;
  voltage: string;
  phase: string;
  fuel: string;
  capacityLb: string;
  capacityCustom: string;
};

function candidateDraft(candidate: IntakeCandidate): CandidateDraft {
  const knownCapacities = [20, 30, 40, 50, 60, 80];
  const capacity =
    candidate.capacityLb == null ? null : String(candidate.capacityLb);
  return {
    machineType: candidate.machineType ?? "",
    manufacturer: candidate.manufacturer ?? "",
    model: candidate.model ?? "",
    serial: candidate.serial ?? "",
    voltage: candidate.voltage ?? "",
    phase: candidate.phase ?? "",
    fuel: candidate.fuel ?? "",
    capacityLb:
      capacity && !knownCapacities.includes(Number(capacity))
        ? "custom"
        : (capacity ?? ""),
    capacityCustom:
      capacity && !knownCapacities.includes(Number(capacity)) ? capacity : "",
  };
}

const fieldLabels: Record<string, string> = {
  machineType: "machine type",
  manufacturer: "manufacturer",
  model: "model",
  serial: "serial number",
  voltage: "voltage",
  phase: "phase",
  fuel: "fuel",
  capacityLb: "capacity (lb)",
};

const reasonLabels: Record<string, string> = {
  accepted: "verified by the available evidence",
  low_confidence: "the text is not clear enough",
  missing_critical_fact: "a critical fact is missing",
  ocr_disagreement: "the independent text check disagreed",
  blur: "the nameplate is blurry",
  glare: "glare hides part of the nameplate",
  cutoff: "the nameplate is cut off",
  small_text: "the text is too small to read",
  unreadable: "the text cannot be read",
  ambiguous_grouping: "the nameplate photo evidence is ambiguous",
  conflicting_evidence: "photos contain conflicting readings",
  provider_unavailable: "automatic recognition is unavailable",
  policy_unconfigured: "automatic acceptance is not configured",
  manual_fallback: "this was entered manually",
  unsupported_evidence: "the evidence format is not supported",
  stale_input: "the photo set changed before recognition finished",
  provider_timeout: "recognition took too long",
  malformed_provider_output: "recognition returned an invalid result",
  output_too_large: "recognition returned too much data",
  checksum_mismatch: "the evidence checksum changed",
  missing_analysis_bytes: "the evidence could not be read",
  ambiguous_characters: "the model or serial contains ambiguous characters",
  invalid_identity_value: "the value is not a valid identity fact",
  missing_evidence: "the proposed value has no OCR evidence",
  invalid_evidence_reference: "the OCR evidence reference is invalid",
};

function recognitionStatusFromDetail(
  detail: IntakeBatchDetail,
): IntakeRecognitionStatus | null {
  const recognition = (
    detail as IntakeBatchDetail & {
      recognition?: IntakeRecognitionStatus;
    }
  ).recognition;
  return recognition ?? null;
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Reading nameplates";
    case "ready":
      return "Ready for review";
    case "needs_recapture":
      return "Needs a clearer photo";
    case "failed":
      return "Recognition failed";
    case "stale":
      return "Recognition needs a refresh";
    case "manual":
      return "Manual review";
    default:
      return "Not started";
  }
}

function recognitionRunIsFreshEnough(
  next: IntakeRecognitionStatus["latestRun"],
  current: IntakeRecognitionStatus["latestRun"],
): boolean {
  if (!current) return true;
  if (!next) return false;
  if (next.id === current.id) return next.updatedAt >= current.updatedAt;
  if (next.inputVersion !== current.inputVersion) {
    return next.inputVersion > current.inputVersion;
  }
  if (next.createdAt !== current.createdAt) {
    return next.createdAt > current.createdAt;
  }
  return next.id > current.id;
}

function CandidateEditor({
  candidate,
  detail,
  onSave,
  onConfirm,
  onAssign,
  onExclude,
  disabled,
}: Readonly<{
  candidate: IntakeCandidate;
  detail: IntakeBatchDetail;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
  onConfirm: () => Promise<void>;
  onAssign: (photoId: string, candidateId: string | null) => Promise<void>;
  onExclude: (photoId: string, excluded: boolean) => Promise<void>;
  disabled: boolean;
}>) {
  const [draft, setDraft] = useState(() => candidateDraft(candidate));
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setDraft(candidateDraft(candidate));
  }, [candidate]);
  const assigned = detail.photos.filter(
    (photo) => photo.candidateId === candidate.id,
  );
  return (
    <section className="panel" data-testid={`candidate-${candidate.id}`}>
      <h3>Candidate {candidate.id.slice(0, 8)}</h3>
      <fieldset disabled={disabled}>
        <legend>Candidate facts</legend>
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const saved = await onSave({
              machineType: draft.machineType || null,
              manufacturer: draft.manufacturer || null,
              model: draft.model || null,
              serial: draft.serial || null,
              voltage: draft.voltage || null,
              phase: draft.phase || null,
              fuel: draft.fuel || null,
              capacityLb: (
                draft.capacityLb === "custom"
                  ? draft.capacityCustom
                  : draft.capacityLb
              )
                ? Number(
                    draft.capacityLb === "custom"
                      ? draft.capacityCustom
                      : draft.capacityLb,
                  )
                : null,
              expectedVersion: detail.batch.version,
            });
            if (saved) dirty.current = false;
          }}
        >
          <label>
            Machine type
            <select
              name="machineType"
              value={draft.machineType}
              onChange={(event) => {
                dirty.current = true;
                setDraft((current) => ({
                  ...current,
                  machineType: event.target.value,
                }));
              }}
            >
              <option value="">Choose type</option>
              <option value="washer">Washer</option>
              <option value="dryer">Dryer</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Manufacturer
            <input
              name="manufacturer"
              value={draft.manufacturer}
              onChange={(event) => {
                dirty.current = true;
                setDraft((current) => ({
                  ...current,
                  manufacturer: event.target.value,
                }));
              }}
            />
          </label>
          <label>
            Model
            <input
              name="model"
              value={draft.model}
              onChange={(event) => {
                dirty.current = true;
                setDraft((current) => ({
                  ...current,
                  model: event.target.value,
                }));
              }}
            />
          </label>
          <label>
            Serial
            <input
              name="serial"
              value={draft.serial}
              onChange={(event) => {
                dirty.current = true;
                setDraft((current) => ({
                  ...current,
                  serial: event.target.value,
                }));
              }}
            />
          </label>
          <label>
            Capacity (lb)
            <select
              name="capacityLb"
              value={draft.capacityLb}
              onChange={(event) => {
                dirty.current = true;
                setDraft((current) => ({
                  ...current,
                  capacityLb: event.target.value,
                }));
              }}
            >
              <option value="">Unknown</option>
              {[20, 30, 40, 50, 60, 80].map((value) => (
                <option key={value} value={value}>
                  {value} lb
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
            {draft.capacityLb === "custom" ? (
              <input
                aria-label="Custom capacity in pounds"
                type="number"
                min={1}
                max={2000}
                value={draft.capacityCustom}
                onChange={(event) => {
                  dirty.current = true;
                  setDraft((current) => ({
                    ...current,
                    capacityCustom: event.target.value,
                  }));
                }}
              />
            ) : null}
          </label>
          <label>
            Voltage
            <input
              name="voltage"
              value={draft.voltage}
              onChange={(event) => {
                dirty.current = true;
                setDraft((current) => ({
                  ...current,
                  voltage: event.target.value,
                }));
              }}
            />
          </label>
          <label>
            Phase
            <select
              name="phase"
              value={draft.phase}
              onChange={(event) => {
                dirty.current = true;
                setDraft((current) => ({
                  ...current,
                  phase: event.target.value,
                }));
              }}
            >
              <option value="">Unknown</option>
              <option value="single_phase">Single phase</option>
              <option value="three_phase">Three phase</option>
            </select>
          </label>
          <label>
            Fuel
            <select
              name="fuel"
              value={draft.fuel}
              onChange={(event) => {
                dirty.current = true;
                setDraft((current) => ({
                  ...current,
                  fuel: event.target.value,
                }));
              }}
            >
              <option value="">Unknown</option>
              <option value="gas">Gas</option>
              <option value="electric">Electric</option>
              <option value="steam">Steam</option>
              <option value="other">Other</option>
            </select>
          </label>
          <button type="submit">Save facts</button>
        </form>
      </fieldset>
      <p>{assigned.length} assigned photo(s)</p>
      <div className="button-row">
        {detail.photos
          .filter((photo) => photo.disposition === "unassigned")
          .map((photo) => (
            <button
              key={photo.id}
              type="button"
              disabled={disabled}
              onClick={() => void onAssign(photo.id, candidate.id)}
            >
              Assign {photo.filename}
            </button>
          ))}
      </div>
      <div className="button-row">
        {assigned.map((photo) => (
          <button
            key={`unassign-${photo.id}`}
            type="button"
            disabled={disabled}
            onClick={() => void onAssign(photo.id, null)}
          >
            Unassign {photo.filename}
          </button>
        ))}
        {detail.photos
          .filter((photo) => photo.disposition === "excluded")
          .map((photo) => (
            <button
              key={`include-${photo.id}`}
              type="button"
              disabled={disabled}
              onClick={() => void onExclude(photo.id, false)}
            >
              Include {photo.filename}
            </button>
          ))}
      </div>
      <button
        type="button"
        disabled={disabled || candidate.state === "confirmed"}
        onClick={() => void onConfirm()}
      >
        Confirm candidate
      </button>
    </section>
  );
}

function RecognitionPanel({
  status,
  detail,
  getExpectedVersion,
  loadId,
  canManage,
  online,
  disabled,
  onRetry,
  onStatus,
  onRefresh,
  onMessage,
}: Readonly<{
  status: IntakeRecognitionStatus | null;
  detail: IntakeBatchDetail;
  getExpectedVersion: () => number;
  loadId: string;
  canManage: boolean;
  online: boolean;
  disabled: boolean;
  onRetry: () => Promise<void>;
  onStatus: (status: IntakeRecognitionStatus) => void;
  onRefresh: () => Promise<IntakeBatchDetail | undefined>;
  onMessage: (message: string) => void;
}>) {
  const [recaptureBusy, setRecaptureBusy] = useState<string>();
  const run = status?.latestRun;
  const photoNames = new Map(
    detail.photos.map((photo) => [photo.id, photo.filename]),
  );
  const enabled = status?.enabled ?? true;
  const active = run?.state === "queued" || run?.state === "running";

  async function uploadRecapture(
    recaptureId: string,
    file: File | undefined,
    input: HTMLInputElement,
  ) {
    if (!file) return;
    setRecaptureBusy(recaptureId);
    try {
      const uploaded = await uploadPhoto(file, loadId);
      const next = await submitIntakeRecaptureEvidence(
        detail.batch.id,
        recaptureId,
        uploaded.fileId,
        getExpectedVersion(),
      );
      onStatus(next);
      await onRefresh();
    } catch {
      onMessage("That recapture could not be uploaded. Try the photo again.");
    } finally {
      input.value = "";
      setRecaptureBusy(undefined);
    }
  }

  return (
    <section className="panel" aria-labelledby="recognition-heading">
      <div className="button-row">
        <div>
          <h2 id="recognition-heading">Automatic photo recognition</h2>
          <p role="status" aria-live="polite">
            {statusLabel(run?.state)}
            {active ? " — this page will update automatically." : ""}
          </p>
        </div>
        {run?.state === "failed" || run?.state === "stale" ? (
          <button
            type="button"
            disabled={disabled || !online || !canManage}
            onClick={() => void onRetry()}
          >
            Retry recognition
          </button>
        ) : null}
      </div>
      {!enabled ? (
        <p>
          Automatic recognition is unavailable. Retry when the configured
          providers are available.
        </p>
      ) : null}
      {run?.state === "failed" ? (
        <p role="alert">
          Recognition could not finish. Your uploaded photos are still safe;
          {run.errorCode
            ? ` ${reasonLabels[run.errorCode] ?? run.errorCode}.`
            : " Retry recognition when the providers are available."}
        </p>
      ) : null}
      {run?.provenance ? (
        <p data-testid="recognition-provenance">
          Source: {run.provenance.provider} {run.provenance.model}; verifier:{" "}
          {run.provenance.verifier} {run.provenance.verifierModel}; policy:{" "}
          {run.provenance.policyVersion}.
        </p>
      ) : null}
      {run?.groups.length ? (
        <div aria-label="Recognized Machines">
          {run.groups.map((group) => (
            <article className="panel" key={group.key}>
              <h3>
                Machine from photo {group.key} —{" "}
                {group.accepted ? "ready" : "needs attention"}
              </h3>
              <p>
                Photos:{" "}
                {group.photoIds
                  .map((photoId) => photoNames.get(photoId) ?? photoId)
                  .join(", ")}
              </p>
              <dl>
                {group.fields.map((field) => {
                  const details = field as typeof field & {
                    confidence?: number;
                  };
                  const confidence = details.confidence;
                  const evidence = field.photoId
                    ? photoNames.get(field.photoId)
                    : undefined;
                  return (
                    <div key={`${group.key}-${field.field}`}>
                      <dt>{fieldLabels[field.field] ?? field.field}</dt>
                      <dd>
                        {field.accepted && field.value ? (
                          <>
                            <strong>{field.value}</strong>{" "}
                            {confidence == null
                              ? null
                              : `(${Math.round(confidence * 100)}% confidence)`}
                          </>
                        ) : (
                          <span>
                            Needs review —{" "}
                            {reasonLabels[field.reason] ?? field.reason}
                          </span>
                        )}
                        <small>
                          {evidence
                            ? ` Evidence: ${evidence}.`
                            : " Evidence photo not available."}
                          {field.verifierAgreement
                            ? " Independent text check agrees."
                            : " Independent text check needs another photo."}
                        </small>
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {group.reasons.length ? (
                <p>
                  <strong>Why:</strong>{" "}
                  {group.reasons
                    .map((reason) => reasonLabels[reason] ?? reason)
                    .join("; ")}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
      {status?.recaptures
        .filter((recapture) => recapture.state === "open")
        .map((recapture) => (
          <article className="panel" key={recapture.id}>
            <h3>Clearer photo needed</h3>
            <p>
              {recapture.instruction} (
              {reasonLabels[recapture.reason] ?? recapture.reason})
            </p>
            <label>
              Upload the requested evidence
              <input
                type="file"
                accept={INTAKE_IMAGE_ACCEPT}
                disabled={
                  disabled || !online || !canManage || recaptureBusy != null
                }
                onChange={(event) =>
                  void uploadRecapture(
                    recapture.id,
                    event.target.files?.[0],
                    event.currentTarget,
                  )
                }
              />
            </label>
          </article>
        ))}
    </section>
  );
}

function MachineIntakeQueue({
  detail,
  recognition,
  canManage,
  online,
  loadId,
  onDetail,
  onRecognition,
  onMessage,
  onUploadMessage,
  onUploadSuccess,
  getActionMessageVersion,
  getExpectedVersion,
  onStagedWorkChange,
}: Readonly<{
  detail: IntakeBatchDetail;
  recognition: IntakeRecognitionStatus | null;
  canManage: boolean;
  online: boolean;
  loadId: string;
  onDetail: (detail: IntakeBatchDetail) => void;
  onRecognition: (status: IntakeRecognitionStatus) => void;
  onMessage: (message: string) => void;
  onUploadMessage: (message: string, actionVersionAtStart?: number) => void;
  onUploadSuccess: () => void;
  getActionMessageVersion: () => number;
  getExpectedVersion: () => number;
  onStagedWorkChange: (hasStagedWork: boolean) => void;
}>) {
  const [busy, setBusy] = useState(false);
  const [typeMutationInFlight, setTypeMutationInFlight] = useState(false);
  const typeMutationInFlightRef = useRef(false);
  const stagedRef = useRef<StagedNameplate[]>([]);
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>(
    {},
  );
  const [customCapacityDrafts, setCustomCapacityDrafts] = useState<
    Record<string, string>
  >({});
  const runs =
    recognition?.runs ??
    (recognition?.latestRun ? [recognition.latestRun] : []);
  const runByCandidate = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (run.candidateId && !runByCandidate.has(run.candidateId))
      runByCandidate.set(run.candidateId, run);
  }
  function updateStaged(
    updater: (current: StagedNameplate[]) => StagedNameplate[],
  ) {
    const next = updater(stagedRef.current);
    stagedRef.current = next;
    onStagedWorkChange(next.length > 0);
  }

  function removeStaged(id: string) {
    updateStaged((current) => current.filter((entry) => entry.id !== id));
  }

  function chooseNameplates(files: FileList | null, input: HTMLInputElement) {
    if (!files || !canManage || !online || detail.batch.state !== "open")
      return;
    const remaining = Math.max(
      0,
      100 - detail.photos.length - stagedRef.current.length,
    );
    const selected = [...files]
      .filter(
        (file) =>
          file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name),
      )
      .slice(0, remaining);
    if (!selected.length) {
      onUploadMessage("Choose one or more image files for the nameplates.");
      input.value = "";
      return;
    }
    const actionMessageVersionAtStart = getActionMessageVersion();
    const items = selected.map((file, index): StagedNameplate => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
    }));
    updateStaged((current) => [...current, ...items]);
    input.value = "";
    if (selected.length < files.length)
      onUploadMessage("Only the remaining 100 nameplate slots were staged.");
    setBusy(true);
    void uploadAndPrepare(items)
      .then((failedCount) => {
        if (failedCount > 0)
          onUploadMessage(
            NAMEPLATE_UPLOAD_FAILURE_MESSAGE,
            actionMessageVersionAtStart,
          );
        else onUploadSuccess();
      })
      .finally(() => setBusy(false));
  }

  async function uploadAndPrepare(items: StagedNameplate[]): Promise<number> {
    const fileIds = new Map<string, string>();
    let failedCount = 0;
    let cursor = 0;
    const uploadWorker = async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        if (!item) return;
        try {
          const uploaded = await uploadPhoto(item.file, loadId);
          fileIds.set(item.id, uploaded.fileId);
        } catch {
          failedCount += 1;
          removeStaged(item.id);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(3, items.length) }, () => uploadWorker()),
    );

    if (fileIds.size === 0) return failedCount;

    let version = detail.batch.version;
    try {
      const current = await getBrowserIntakeBatch(detail.batch.id);
      version = current?.batch.version ?? version;
    } catch {
      // The latest local version remains safe for the normal conflict retry.
    }
    for (const item of items) {
      const fileId = fileIds.get(item.id);
      if (!fileId) continue;
      try {
        let next: IntakeBatchDetail | undefined;
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          try {
            next = await prepareIntakeItem(detail.batch.id, fileId, version);
            break;
          } catch (error) {
            if (
              !(error instanceof IntakeRequestError) ||
              error.code !== "version_conflict" ||
              attempt === 5
            )
              throw error;
            const refreshed = await getBrowserIntakeBatch(detail.batch.id);
            version = refreshed.batch.version;
          }
        }
        if (!next) throw new Error("Nameplate preparation did not complete");
        onDetail(next);
        version = next.batch.version;
        try {
          onRecognition(await getIntakeRecognition(detail.batch.id));
        } catch {
          // The prepared Machine remains visible while recognition polling recovers.
        }
      } catch {
        failedCount += 1;
      } finally {
        removeStaged(item.id);
      }
    }
    return failedCount;
  }
  async function replaceFailedPhoto(
    photoId: string,
    file: File | undefined,
    input: HTMLInputElement,
  ) {
    if (!file || busy || !online || !canManage) return;
    setBusy(true);
    try {
      const uploaded = await uploadPhoto(file, loadId);
      let version = detail.batch.version;
      try {
        const current = await getBrowserIntakeBatch(detail.batch.id);
        version = current.batch.version;
      } catch {
        // The current rendered version remains available for the normal conflict retry.
      }
      let prepared: IntakeBatchDetail;
      try {
        prepared = await prepareIntakeItem(
          detail.batch.id,
          uploaded.fileId,
          version,
        );
      } catch (error) {
        if (
          !(error instanceof IntakeRequestError) ||
          error.code !== "version_conflict"
        )
          throw error;
        const refreshed = await getBrowserIntakeBatch(detail.batch.id);
        prepared = await prepareIntakeItem(
          refreshed.batch.id,
          uploaded.fileId,
          refreshed.batch.version,
        );
      }
      onDetail(prepared);
      try {
        const excluded = await excludeIntakePhoto(
          detail.batch.id,
          photoId,
          true,
          prepared.batch.version,
        );
        onDetail(excluded);
        try {
          onRecognition(await getIntakeRecognition(detail.batch.id));
        } catch {
          // The replacement remains active while polling recovers recognition state.
        }
        onMessage("Replacement nameplate is being read.");
      } catch {
        onMessage(
          "The replacement was added, but the failed image could not be removed. Use Remove failed image to finish cleanup.",
        );
      }
    } catch {
      onMessage(
        "The replacement nameplate could not be prepared. The failed image is still available.",
      );
    } finally {
      input.value = "";
      setBusy(false);
    }
  }
  async function removeFailedPhoto(photoId: string) {
    if (busy || !online || !canManage) return;
    setBusy(true);
    try {
      let version = detail.batch.version;
      try {
        const current = await getBrowserIntakeBatch(detail.batch.id);
        version = current.batch.version;
      } catch {
        // Use the rendered version when refresh is temporarily unavailable.
      }
      const next = await excludeIntakePhoto(
        detail.batch.id,
        photoId,
        true,
        version,
      );
      onDetail(next);
      try {
        onRecognition(await getIntakeRecognition(detail.batch.id));
      } catch {
        // The active queue is already correct; recognition polling may recover later.
      }
      onMessage("Failed image removed from this Intake.");
    } catch {
      onMessage(
        "The failed image could not be removed. Refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function uploadRecapture(
    recaptureId: string,
    file: File | undefined,
    input: HTMLInputElement,
  ) {
    if (!file) return;
    try {
      const uploaded = await uploadPhoto(file, loadId);
      const next = await submitIntakeRecaptureEvidence(
        detail.batch.id,
        recaptureId,
        uploaded.fileId,
        detail.batch.version,
      );
      onRecognition(next);
      onDetail(await getBrowserIntakeBatch(detail.batch.id));
      onMessage("The clearer photo was queued for recognition.");
    } catch {
      onMessage("The clearer photo could not be uploaded. Try again.");
    } finally {
      input.value = "";
    }
  }
  async function saveCapacity(candidateId: string, value: string) {
    const capacityLb = value === "" ? null : Number(value);
    if (
      capacityLb !== null &&
      (!Number.isInteger(capacityLb) || capacityLb < 1 || capacityLb > 2000)
    ) {
      onMessage("Capacity must be a whole number from 1 to 2000 lb.");
      return;
    }
    try {
      onDetail(
        await changeIntakeCandidateCapacity(
          detail.batch.id,
          candidateId,
          capacityLb,
          detail.batch.version,
        ),
      );
      onMessage("Capacity saved.");
    } catch {
      onMessage("Capacity could not be saved. Refresh before trying again.");
    }
  }
  return (
    <section className="panel" aria-labelledby="machine-queue-heading">
      <h2 id="machine-queue-heading">Machine intake queue</h2>
      <p>
        Choose nameplate photos and recognition starts automatically for each
        Machine.
      </p>
      {detail.items !== undefined &&
      detail.batch.state === "open" &&
      canManage ? (
        <div className="intake-nameplate-staging">
          <label className="intake-nameplate-picker">
            Choose nameplates
            <input
              type="file"
              accept={INTAKE_IMAGE_ACCEPT}
              multiple
              disabled={busy || !online}
              onChange={(event) =>
                chooseNameplates(event.target.files, event.currentTarget)
              }
            />
          </label>
        </div>
      ) : null}
      <div className="intake-machine-queue" aria-live="polite">
        {(detail.items ?? []).map((item) => {
          const candidate = detail.candidates.find(
            (entry) => entry.id === item.candidateId,
          );
          const run = runByCandidate.get(item.candidateId);
          const state = item.machineId
            ? "added"
            : (run?.state ?? item.latestRunState ?? "queued");
          const recapture = recognition?.recaptures.find(
            (entry) =>
              entry.candidateId === item.candidateId && entry.state === "open",
          );
          return (
            <article
              className="panel intake-machine-card"
              key={item.candidateId}
            >
              <h3>
                {candidate?.model ??
                  (state === "failed"
                    ? "Needs a clearer nameplate"
                    : "Reading nameplate…")}
              </h3>
              {detail.photos.find((photo) => photo.id === item.photoId) ? (
                <ItemPreview
                  photo={detail.photos.find(
                    (photo) => photo.id === item.photoId,
                  )!}
                />
              ) : null}
              {candidate ? (
                <dl>
                  <div>
                    <dt>Manufacturer</dt>
                    <dd>{candidate.manufacturer ?? "Reading…"}</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{candidate.model ?? "Reading…"}</dd>
                  </div>
                  <div>
                    <dt>Serial</dt>
                    <dd>{candidate.serial ?? "Reading…"}</dd>
                  </div>
                  <div>
                    <dt>Capacity</dt>
                    <dd>
                      {candidate.capacityLb == null
                        ? "Unknown"
                        : `${candidate.capacityLb} lb`}
                    </dd>
                  </div>
                  <div>
                    <dt>Voltage</dt>
                    <dd>{candidate.voltage ?? "Not found"}</dd>
                  </div>
                  <div>
                    <dt>Phase</dt>
                    <dd>{candidate.phase ?? "Not found"}</dd>
                  </div>
                  <div>
                    <dt>Fuel</dt>
                    <dd>{candidate.fuel ?? "Not found"}</dd>
                  </div>
                </dl>
              ) : null}
              {candidate?.catalogEnrichment ? (
                <div className="panel">
                  {candidate.catalogEnrichment.status === "researching" ? (
                    <p role="status">Researching specifications</p>
                  ) : candidate.catalogEnrichment.status ===
                    "no_verified_specs" ? (
                    <p>No verified specifications found</p>
                  ) : candidate.catalogEnrichment.status === "disabled" ? (
                    <p>Specification research is not enabled.</p>
                  ) : candidate.catalogEnrichment.revision ? (
                    <>
                      <p>
                        <strong>Verified specifications</strong>
                      </p>
                      <dl>
                        {(
                          [
                            ["widthIn", "Width", "in"],
                            ["depthIn", "Depth", "in"],
                            ["heightIn", "Height", "in"],
                            ["weightLb", "Weight", "lb"],
                            ["capacityLb", "Capacity", "lb"],
                          ] as const
                        ).map(([field, label, unit]) => (
                          <div key={field}>
                            <dt>{label}</dt>
                            <dd>
                              {candidate.catalogEnrichment!.revision!.specs[
                                field
                              ] == null
                                ? "Unknown"
                                : `${candidate.catalogEnrichment!.revision!.specs[field]} ${unit}`}
                            </dd>
                          </div>
                        ))}
                        <div>
                          <dt>Production range</dt>
                          <dd>
                            {candidate.catalogEnrichment.revision
                              .productionStartYear ?? "Unknown"}
                            –
                            {candidate.catalogEnrichment.revision
                              .productionEndYear ?? "Unknown"}
                          </dd>
                        </div>
                        <div>
                          <dt>Manufacture year</dt>
                          <dd>
                            {candidate.catalogEnrichment.manufactureDate
                              ?.kind === "exact"
                              ? candidate.catalogEnrichment.manufactureDate.year
                              : candidate.catalogEnrichment.manufactureDate
                                    ?.kind === "range"
                                ? `${candidate.catalogEnrichment.manufactureDate.startYear}–${candidate.catalogEnrichment.manufactureDate.endYear}`
                                : "Unknown"}
                          </dd>
                        </div>
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
                              {candidate
                                .catalogEnrichment!.revision!.specs[field].map(
                                  (value) => value.replaceAll("_", " "),
                                )
                                .join(", ") || "Unknown"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {candidate.catalogEnrichment.revision.sources.map(
                        (source) => (
                          <p key={source.id}>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {source.title}
                            </a>
                          </p>
                        ),
                      )}
                    </>
                  ) : null}
                </div>
              ) : null}
              {candidate && !item.machineId ? (
                <div className="button-row">
                  <label>
                    Confirm capacity (lb)
                    <select
                      aria-label="Confirm capacity in pounds"
                      value={
                        capacityDrafts[item.candidateId] ??
                        (candidate.capacityLb == null
                          ? ""
                          : [20, 30, 40, 50, 60, 80].includes(
                                candidate.capacityLb,
                              )
                            ? String(candidate.capacityLb)
                            : "custom")
                      }
                      disabled={
                        !canManage ||
                        !online ||
                        state === "running" ||
                        state === "queued"
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        setCapacityDrafts((current) => ({
                          ...current,
                          [item.candidateId]: value,
                        }));
                        if (value !== "custom")
                          void saveCapacity(item.candidateId, value);
                      }}
                    >
                      <option value="">Unknown</option>
                      {[20, 30, 40, 50, 60, 80].map((value) => (
                        <option key={value} value={value}>
                          {value} lb
                        </option>
                      ))}
                      {candidate.capacityLb != null &&
                      ![20, 30, 40, 50, 60, 80].includes(
                        candidate.capacityLb,
                      ) ? (
                        <option value="custom">
                          Custom ({candidate.capacityLb} lb)
                        </option>
                      ) : (
                        <option value="custom">Custom</option>
                      )}
                    </select>
                  </label>
                  {(capacityDrafts[item.candidateId] ??
                    (candidate.capacityLb != null &&
                    ![20, 30, 40, 50, 60, 80].includes(candidate.capacityLb)
                      ? "custom"
                      : "")) === "custom" ? (
                    <label>
                      Custom capacity in pounds
                      <input
                        aria-label="Custom capacity in pounds"
                        type="number"
                        min={1}
                        max={2000}
                        value={
                          customCapacityDrafts[item.candidateId] ??
                          (candidate.capacityLb == null
                            ? ""
                            : String(candidate.capacityLb))
                        }
                        onChange={(event) =>
                          setCustomCapacityDrafts((current) => ({
                            ...current,
                            [item.candidateId]: event.target.value,
                          }))
                        }
                        onBlur={(event) =>
                          void saveCapacity(
                            item.candidateId,
                            event.target.value,
                          )
                        }
                        disabled={
                          !canManage ||
                          !online ||
                          state === "running" ||
                          state === "queued"
                        }
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              {candidate && !item.machineId && state === "ready" ? (
                <div className="button-row">
                  {candidate.catalogTypeSuggestion ? (
                    <p>
                      Catalog suggests{" "}
                      {
                        { washer: "Washer", dryer: "Dryer", other: "Other" }[
                          candidate.catalogTypeSuggestion.machineType
                        ]
                      }{" "}
                      for {candidate.catalogTypeSuggestion.manufacturer}{" "}
                      {candidate.catalogTypeSuggestion.model} (verified exact
                      match). {candidate.catalogTypeSuggestion.label}
                    </p>
                  ) : null}
                  <label>
                    Machine type
                    <select
                      value={candidate.machineType ?? ""}
                      disabled={!canManage || !online || typeMutationInFlight}
                      onChange={async (event) => {
                        if (typeMutationInFlightRef.current) return;
                        typeMutationInFlightRef.current = true;
                        setTypeMutationInFlight(true);
                        try {
                          onDetail(
                            await changeIntakeCandidateType(
                              detail.batch.id,
                              item.candidateId,
                              event.target.value as
                                "washer" | "dryer" | "other",
                              getExpectedVersion(),
                            ),
                          );
                        } catch {
                          onMessage(
                            "The type could not be changed. Refresh and try again.",
                          );
                        } finally {
                          typeMutationInFlightRef.current = false;
                          setTypeMutationInFlight(false);
                        }
                      }}
                    >
                      <option value="">Choose type</option>
                      <option value="washer">Washer</option>
                      <option value="dryer">Dryer</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>
              ) : null}
              {candidate &&
              !item.machineId &&
              (state === "failed" || state === "stale") ? (
                <div className="button-row">
                  <label>
                    Retake or choose another image
                    <input
                      type="file"
                      accept={INTAKE_IMAGE_ACCEPT}
                      capture="environment"
                      disabled={busy || !canManage || !online}
                      onChange={(event) =>
                        void replaceFailedPhoto(
                          item.photoId,
                          event.target.files?.[0],
                          event.currentTarget,
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || !canManage || !online}
                    onClick={() => void removeFailedPhoto(item.photoId)}
                  >
                    Remove failed image
                  </button>
                </div>
              ) : null}
              {candidate &&
              !item.machineId &&
              state === "needs_recapture" &&
              recapture ? (
                <label>
                  Capture a clearer nameplate
                  <input
                    type="file"
                    accept={INTAKE_IMAGE_ACCEPT}
                    capture="environment"
                    disabled={!canManage || !online}
                    onChange={(event) =>
                      void uploadRecapture(
                        recapture.id,
                        event.target.files?.[0],
                        event.currentTarget,
                      )
                    }
                  />
                </label>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ItemPreview({ photo }: Readonly<{ photo: IntakePhoto }>) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!photo.previewAvailable) return;
    void createIntakePreviewGrant(photo.fileId)
      .then((grant) => setPreview(intakePreviewUrl(photo.fileId, grant.token)))
      .catch(() => undefined);
  }, [photo.fileId, photo.previewAvailable]);
  return preview ? (
    <img
      className="intake-photo-preview"
      src={preview}
      alt={`Private preview of ${photo.filename}`}
    />
  ) : null;
}

export function IntakeReviewView({
  initialDetail,
  canManage,
  loadId,
}: Readonly<{
  initialDetail: IntakeBatchDetail;
  canManage: boolean;
  loadId: string;
}>) {
  const [detail, setDetail] = useServerState(initialDetail);
  const [message, setMessageState] = useState<IntakeMessage>();
  const [busy, setBusy] = useState(false);
  const [approvalInFlight, setApprovalInFlight] = useState(false);
  const [hasStagedNameplates, setHasStagedNameplates] = useState(false);
  const approvalInFlightRef = useRef(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const actionMessageVersion = useRef(0);
  const initialRecognition = recognitionStatusFromDetail(initialDetail);
  const [recognition, setRecognition] =
    useState<IntakeRecognitionStatus | null>(initialRecognition);
  const recognitionRef = useRef<IntakeRecognitionStatus | null>(
    initialRecognition,
  );
  const uploadsRef = useRef<UploadItem[]>([]);
  const detailVersion = useRef(detail.batch.version);
  const online = useOnlineStatus();
  const legacyReview = !Object.prototype.hasOwnProperty.call(
    initialDetail,
    "items",
  );

  function setMessage(text: string | undefined) {
    actionMessageVersion.current += 1;
    setMessageState(text === undefined ? undefined : { text, owner: "action" });
  }

  function setUploadMessage(text: string, actionVersionAtStart?: number) {
    setMessageState((current) =>
      current?.owner === "action" &&
      actionVersionAtStart !== undefined &&
      actionMessageVersion.current > actionVersionAtStart
        ? current
        : { text, owner: "upload" },
    );
  }

  function clearUploadMessage() {
    setMessageState((current) =>
      current?.owner === "upload" ? undefined : current,
    );
  }

  function acceptDetail(nextDetail: IntakeBatchDetail): boolean {
    if (nextDetail.batch.version < detailVersion.current) return false;
    detailVersion.current = nextDetail.batch.version;
    setDetail(nextDetail);
    return true;
  }

  const committedMachines = detail.machineMappings.map(
    (mapping) => mapping.machineId,
  );
  const activeItems = detail.items ?? [];
  const activeIntakeReady =
    !legacyReview &&
    activeItems.length > 0 &&
    !hasStagedNameplates &&
    activeItems.every((item) => {
      if (item.machineId) return true;
      const candidate = detail.candidates.find(
        (entry) => entry.id === item.candidateId,
      );
      return (
        item.latestRunState === "ready" &&
        candidate?.state === "confirmed" &&
        candidate.machineType !== null
      );
    });

  function acceptRecognition(next: IntakeRecognitionStatus): boolean {
    if (
      !recognitionRunIsFreshEnough(
        next.latestRun,
        recognitionRef.current?.latestRun ?? null,
      )
    ) {
      return false;
    }
    recognitionRef.current = next;
    setRecognition(next);
    return true;
  }

  function updateUploads(
    updater: (current: UploadItem[]) => UploadItem[],
  ): void {
    const next = updater(uploadsRef.current);
    uploadsRef.current = next;
    setUploads(next);
  }

  function allVisibleUploadsLinked(): boolean {
    return (
      uploadsRef.current.length > 0 &&
      uploadsRef.current.every((item) => item.status === "linked")
    );
  }

  useEffect(() => {
    detailVersion.current = Math.max(
      detailVersion.current,
      detail.batch.version,
    );
  }, [detail.batch.version]);
  useEffect(() => {
    const runState = recognition?.latestRun?.state;
    const run = recognition?.latestRun;
    const anyRunActive = Boolean(
      recognition?.runs?.some(
        (item) => item.state === "queued" || item.state === "running",
      ),
    );
    if (
      !online ||
      detail.batch.state === "committed" ||
      !run ||
      (runState !== "queued" && runState !== "running" && !anyRunActive)
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await getIntakeRecognition(detail.batch.id);
        const fresh = recognitionRunIsFreshEnough(
          next.latestRun,
          recognitionRef.current?.latestRun ?? null,
        );
        const nextState = next.latestRun?.state;
        const previousRuns = new Map(
          (recognitionRef.current?.runs ?? []).map((item) => [
            item.id,
            item.state,
          ]),
        );
        const anyRunFinished = next.runs
          ? next.runs.some(
              (item) =>
                !["queued", "running"].includes(item.state) &&
                previousRuns.get(item.id) !== item.state,
            )
          : Boolean(nextState && !["queued", "running"].includes(nextState));
        let nextDetail: IntakeBatchDetail | undefined;
        if (fresh && anyRunFinished) {
          try {
            // Fetch the derived candidate state before publishing the terminal
            // recognition state. Publishing first restarts this effect and can
            // cancel the in-flight detail refresh.
            nextDetail = await getBrowserIntakeBatch(detail.batch.id);
          } catch {
            // The recognition result remains visible; the next page refresh
            // can pick up any accepted candidate updates.
          }
        }
        if (!cancelled && fresh) {
          if (nextDetail) acceptDetail(nextDetail);
          acceptRecognition(next);
        }
      } catch {
        // A transient poll failure should not interrupt the manual Intake path.
      }
      if (!cancelled) timer = setTimeout(poll, 1500);
    };
    timer = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    detail.batch.id,
    detail.batch.state,
    online,
    recognition?.latestRun?.id,
    recognition?.latestRun?.inputVersion,
    recognition?.latestRun?.createdAt,
    recognition?.latestRun?.state,
    recognition?.runs
      ?.map((item) => `${item.id}:${item.state}:${item.updatedAt}`)
      .join("|"),
  ]);
  useEffect(() => {
    if (recognition) return;
    void getIntakeRecognition(detail.batch.id)
      .then((next) => acceptRecognition(next))
      .catch(() => undefined);
  }, [detail.batch.id, recognition]);
  async function mutate(
    action: () => Promise<IntakeBatchDetail>,
  ): Promise<boolean> {
    if (!online || !canManage) {
      setMessage(
        "Reconnect and use an Owner or Warehouse account to change Intake.",
      );
      return false;
    }
    setBusy(true);
    try {
      const next = await action();
      acceptDetail(next);
      setMessage(undefined);
      return true;
    } catch {
      setMessage("The Intake changed elsewhere. Refresh before retrying.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function refreshDetailAndRecognition(): Promise<
    IntakeBatchDetail | undefined
  > {
    let nextDetail: IntakeBatchDetail;
    try {
      nextDetail = await getBrowserIntakeBatch(detail.batch.id);
      acceptDetail(nextDetail);
    } catch {
      // Keep the last known values and let the normal poll retry later.
      return undefined;
    }
    try {
      const nextRecognition = await getIntakeRecognition(detail.batch.id);
      acceptRecognition(nextRecognition);
    } catch {
      // Keep the last known recognition state until the next refresh.
    }
    return nextDetail;
  }
  async function startRecognition(retry = false) {
    if (!online || !canManage || detail.batch.state !== "open") return;
    try {
      const next = retry
        ? await requestIntakeRecognition(
            detail.batch.id,
            detailVersion.current,
            true,
          )
        : await requestIntakeRecognition(
            detail.batch.id,
            detailVersion.current,
          );
      acceptRecognition(next);
      setMessage(undefined);
    } catch {
      setMessage(
        "Recognition could not start. Retry recognition or capture a clearer nameplate photo.",
      );
    }
  }
  async function retryRecognition() {
    await startRecognition(true);
  }
  async function processUploads(items: UploadItem[]) {
    const pending = [...items];
    let cursor = 0;
    const completed: Array<{ item: UploadItem; fileId: string }> = [];
    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        if (!item) return;
        updateUploads((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, status: "uploading" } : entry,
          ),
        );
        try {
          const uploaded = await uploadPhoto(item.file, loadId);
          completed.push({ item, fileId: uploaded.fileId });
        } catch (error) {
          const detail =
            error instanceof Error ? error.message : "Upload failed";
          updateUploads((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: "failed", error: detail }
                : entry,
            ),
          );
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(3, pending.length) }, () => worker()),
    );
    let version = detailVersion.current;
    for (const { item, fileId } of completed) {
      try {
        const next = await linkIntakePhoto(detail.batch.id, fileId, version);
        if (acceptDetail(next)) {
          version = next.batch.version;
        } else {
          version = detailVersion.current;
        }
        updateUploads((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, status: "linked" } : entry,
          ),
        );
      } catch {
        updateUploads((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "failed", error: "Link failed; retry" }
              : entry,
          ),
        );
      }
    }
    if (allVisibleUploadsLinked()) await startRecognition();
  }
  async function chooseFiles(files: FileList | null) {
    if (!files || !online || !canManage || detail.batch.state !== "open")
      return;
    const selected = [...files].slice(
      0,
      Math.max(0, 100 - detail.photos.length),
    );
    if (!selected.length) return;
    const items = selected.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      status: "queued" as const,
    }));
    uploadsRef.current = [...uploadsRef.current, ...items];
    setUploads(uploadsRef.current);
    setBusy(true);
    try {
      await processUploads(items);
    } finally {
      setBusy(false);
    }
  }
  async function retryUpload(item: UploadItem) {
    if (!online || !canManage || detail.batch.state !== "open") return;
    const retry: UploadItem = {
      id: item.id,
      file: item.file,
      status: "queued",
    };
    updateUploads((current) =>
      current.map((entry) => (entry.id === item.id ? retry : entry)),
    );
    setBusy(true);
    try {
      await processUploads([retry]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="inventory-stack">
      <section className="panel">
        <p>
          <strong>Status:</strong> {detail.batch.state}
        </p>
        <p>
          <strong>Photos:</strong> {detail.photos.length}/100 ·{" "}
          <strong>Candidates:</strong> {detail.candidates.length}
        </p>
        {legacyReview && canManage && detail.batch.state === "open" ? (
          <label>
            Choose arrival/nameplate photos
            <input
              type="file"
              accept={INTAKE_IMAGE_ACCEPT}
              multiple
              disabled={busy || !online}
              onChange={(event) => void chooseFiles(event.target.files)}
            />
          </label>
        ) : null}
        {message ? (
          <p role="status" className="form-message">
            {message.text}
          </p>
        ) : null}
        {uploads.length ? (
          <ul aria-label="Photo upload queue" aria-live="polite">
            {uploads.map((item) => (
              <li key={item.id}>
                {item.file.name}: {item.status}
                {item.error ? ` (${item.error})` : ""}
                {item.status === "failed" ? (
                  <button
                    type="button"
                    disabled={busy || !online || !canManage}
                    onClick={() => void retryUpload(item)}
                  >
                    Retry
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {committedMachines.length ? (
          <p>
            Created Machines:{" "}
            {committedMachines.map((machineId) => (
              <a key={machineId} href={`/machines/${machineId}`}>
                {machineId}
              </a>
            ))}
            {" · "}
            <a href="/machines">View Inventory</a>
          </p>
        ) : null}
      </section>
      <MachineIntakeQueue
        detail={detail}
        recognition={recognition}
        canManage={canManage}
        online={online}
        loadId={loadId}
        onDetail={(next) => acceptDetail(next)}
        onRecognition={acceptRecognition}
        onMessage={setMessage}
        onUploadMessage={setUploadMessage}
        onUploadSuccess={clearUploadMessage}
        getActionMessageVersion={() => actionMessageVersion.current}
        getExpectedVersion={() => detailVersion.current}
        onStagedWorkChange={setHasStagedNameplates}
      />
      {legacyReview ? (
        <>
          <RecognitionPanel
            status={recognition}
            detail={detail}
            getExpectedVersion={() => detailVersion.current}
            loadId={loadId}
            canManage={canManage}
            online={online}
            disabled={busy || detail.batch.state === "committed"}
            onRetry={retryRecognition}
            onStatus={acceptRecognition}
            onRefresh={refreshDetailAndRecognition}
            onMessage={setMessage}
          />
          <section className="panel">
            <h2>Private evidence review</h2>
            <div className="intake-photo-grid">
              {detail.photos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  detail={detail}
                  canManage={canManage}
                  onExclude={() =>
                    void mutate(() =>
                      excludeIntakePhoto(
                        detail.batch.id,
                        photo.id,
                        photo.disposition !== "excluded",
                        detailVersion.current,
                      ),
                    )
                  }
                  onRemove={() =>
                    void mutate(() =>
                      removeIntakePhoto(
                        detail.batch.id,
                        photo.id,
                        detailVersion.current,
                      ),
                    )
                  }
                />
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="button-row">
              <h2>Candidates</h2>
              <button
                type="button"
                disabled={
                  busy || !canManage || detail.batch.state === "committed"
                }
                onClick={() =>
                  void mutate(() =>
                    createIntakeCandidate(
                      detail.batch.id,
                      detailVersion.current,
                    ),
                  )
                }
              >
                Add Machine candidate
              </button>
            </div>
            {detail.candidates.map((candidate) => (
              <CandidateEditor
                key={candidate.id}
                candidate={candidate}
                disabled={
                  busy ||
                  !canManage ||
                  !online ||
                  detail.batch.state === "committed"
                }
                detail={detail}
                onSave={async (body) => {
                  return mutate(() =>
                    updateIntakeCandidate(detail.batch.id, candidate.id, {
                      ...body,
                      expectedVersion: detailVersion.current,
                    }),
                  );
                }}
                onAssign={async (photoId, candidateId) => {
                  await mutate(() =>
                    assignIntakePhoto(
                      detail.batch.id,
                      photoId,
                      candidateId,
                      detailVersion.current,
                    ),
                  );
                }}
                onExclude={async (photoId, excluded) => {
                  await mutate(() =>
                    excludeIntakePhoto(
                      detail.batch.id,
                      photoId,
                      excluded,
                      detailVersion.current,
                    ),
                  );
                }}
                onConfirm={async () => {
                  await mutate(() =>
                    confirmIntakeCandidate(
                      detail.batch.id,
                      candidate.id,
                      detailVersion.current,
                      [],
                    ),
                  );
                }}
              />
            ))}
          </section>
        </>
      ) : null}
      <section className="panel">
        <h2>{legacyReview ? "Receiving and approval" : "Receiving"}</h2>
        <p>
          {legacyReview
            ? `${detail.candidates.length} total candidate(s) are shown. Approval requires every candidate to be confirmed and adds one provisional Inventory Machine per candidate.`
            : "Wait for every nameplate to finish, choose each Machine type, then add the complete Intake to Inventory."}
        </p>
        <button
          type="button"
          aria-busy={approvalInFlight}
          disabled={
            busy ||
            approvalInFlight ||
            !canManage ||
            !online ||
            (!legacyReview && !activeIntakeReady) ||
            detail.batch.state === "committed"
          }
          onClick={() => {
            if (approvalInFlightRef.current) return;
            if (
              window.confirm(
                legacyReview
                  ? `Approve and add ${detail.candidates.length} Machine(s) to Inventory? This cannot be undone.`
                  : `Add ${activeItems.filter((item) => !item.machineId).length} Machine(s) to Inventory and close this Intake? This cannot be undone.`,
              )
            ) {
              approvalInFlightRef.current = true;
              setApprovalInFlight(true);
              setBusy(true);
              void commitIntakeBatch(
                detail.batch.id,
                detailVersion.current,
                false,
              )
                .then((result) => {
                  const committedVersion =
                    Math.max(detailVersion.current, detail.batch.version) + 1;
                  detailVersion.current = committedVersion;
                  setDetail((current) => ({
                    ...current,
                    machineMappings: result.mappings,
                    batch: {
                      ...current.batch,
                      state: "committed",
                      version: Math.max(
                        current.batch.version,
                        committedVersion,
                      ),
                      updatedAt: new Date().toISOString(),
                    },
                  }));
                  setMessage(
                    legacyReview
                      ? "Intake approved and added to Inventory."
                      : "Machines added to Inventory.",
                  );
                  return refreshDetailAndRecognition();
                })
                .catch(async () => {
                  const authoritative = await refreshDetailAndRecognition();
                  if (authoritative?.batch.state === "committed") {
                    setMessage(
                      legacyReview
                        ? "Intake approved and added to Inventory."
                        : "Machines added to Inventory.",
                    );
                    return;
                  }
                  setMessage(
                    legacyReview
                      ? "Approval blocked. Confirm every candidate and account for every photo before finishing."
                      : "Inventory action blocked. Wait for recognition and choose a type for every Machine.",
                  );
                })
                .finally(() => {
                  approvalInFlightRef.current = false;
                  setApprovalInFlight(false);
                  setBusy(false);
                });
            }
          }}
        >
          {approvalInFlight
            ? "Adding Machines to Inventory…"
            : legacyReview
              ? "Approve and Add to Inventory"
              : "Add Machines to Inventory"}
        </button>
        {detail.batch.state === "committed" && canManage ? (
          <button
            type="button"
            disabled={approvalInFlight || !online}
            onClick={() => {
              setApprovalInFlight(true);
              void downloadIntakeQrLabelSheet(detail.batch.id)
                .then((presentation) => {
                  setMessage(
                    presentation === "opened"
                      ? "QR label sheet opened in a new tab."
                      : "QR label sheet downloaded.",
                  );
                })
                .catch(() => {
                  setMessage(
                    "QR label sheet is not ready. Try again when you are online.",
                  );
                })
                .finally(() => setApprovalInFlight(false));
            }}
          >
            Print all QR labels ({committedMachines.length})
          </button>
        ) : null}
      </section>
    </div>
  );
}

function PhotoCard({
  photo,
  detail,
  canManage,
  onExclude,
  onRemove,
}: Readonly<{
  photo: IntakePhoto;
  detail: IntakeBatchDetail;
  canManage: boolean;
  onExclude: () => void;
  onRemove: () => void;
}>) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!photo.previewAvailable) return;
    void createIntakePreviewGrant(photo.fileId)
      .then((grant) => setPreview(intakePreviewUrl(photo.fileId, grant.token)))
      .catch(() => undefined);
  }, [photo.fileId, photo.previewAvailable]);
  return (
    <article className="panel">
      <strong>{photo.filename}</strong>
      {preview ? (
        <img
          className="intake-photo-preview"
          src={preview}
          alt={`Private preview of ${photo.filename}`}
        />
      ) : (
        <p>Loading private preview…</p>
      )}
      <p>
        {photo.disposition}
        {photo.candidateId ? " · assigned" : ""}
      </p>
      {canManage && detail.batch.state === "open" ? (
        <div className="button-row">
          <button type="button" onClick={onExclude}>
            {photo.disposition === "excluded" ? "Include" : "Exclude"}
          </button>
          <button type="button" onClick={onRemove}>
            Remove from Intake
          </button>
        </div>
      ) : null}
    </article>
  );
}
