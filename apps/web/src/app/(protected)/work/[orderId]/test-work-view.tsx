"use client";

import type {
  TestWorkDetail,
  TestStepResult,
  TestSession,
} from "@laundrorama/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createFileUploadGrant,
  createFileDownloadUrl,
  uploadFileContent,
} from "../../../../lib/files-client";
import {
  assignTest,
  addTestSessionOrders,
  createTestSession,
  finishTest,
  recordTestStep,
  reportNewBearingConcern,
} from "../../../../lib/production-client";
import { useOnlineStatus } from "../../online-status";
import { useServerState } from "../../use-server-state";

export function TestWorkView({
  initialDetail,
  actorUserId,
  owner,
  assignable,
  activeSession = null,
}: Readonly<{
  initialDetail: TestWorkDetail;
  actorUserId: string;
  owner: boolean;
  assignable: { id: string; name: string }[];
  activeSession?: TestSession | null;
}>) {
  const [detail, setDetail] = useServerState(initialDetail);
  const [position, setPosition] = useState(() => {
    const steps = initialDetail.run?.template.steps ?? [];
    const completed = new Set(
      initialDetail.run?.results.map((result) => result.stepKey) ?? [],
    );
    const next = steps.findIndex((step) => !completed.has(step.key));
    return next < 0 ? 0 : next;
  });
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const router = useRouter();
  const online = useOnlineStatus(() => router.refresh());
  const { order, machine, run } = detail;
  const steps = run?.template.steps ?? [];
  const step = steps[position];
  const latest = new Map<string, TestStepResult>();
  for (const result of run?.results ?? []) latest.set(result.stepKey, result);
  const complete =
    steps.length > 0 &&
    steps.every((candidate) => {
      const result = latest.get(candidate.key);
      return (
        result &&
        (result.result !== "na" || candidate.allowNa) &&
        (!candidate.photoRequired || result.fileId)
      );
    });
  const claimant = order.assignedUserId === actorUserId;
  const failed = steps.filter(
    (candidate) => latest.get(candidate.key)?.result === "fail",
  );
  const needsVideo = complete && failed.length === 0;

  async function beginSession() {
    if (!online || busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const selected = [{ orderId: order.id, expectedVersion: order.version }];
      const session = activeSession
        ? await addTestSessionOrders(
            activeSession.id,
            activeSession.version,
            selected,
          )
        : await createTestSession(selected);
      router.push(`/work/session/${session.id}?machine=${machine.id}`);
      router.refresh();
    } catch {
      setMessage("This Test could not join a session. Refresh and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function apply(
    action: () => Promise<TestWorkDetail>,
    success?: string,
  ) {
    if (!online || busy) {
      setMessage("Reconnect before saving Test work.");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const updated = await action();
      setDetail(updated);
      if (success) setMessage(success);
      router.refresh();
    } catch {
      setMessage(
        "The Work Order changed or could not be saved. Refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveResult(result: "pass" | "fail" | "na") {
    if (!step) return;
    await apply(async () => {
      let fileId: string | null = null;
      if (step.photoRequired) {
        if (!selectedPhoto) throw new Error("photo_required");
        const granted = await createFileUploadGrant({
          target: { type: "machine", id: order.machineId },
          purpose: "production_test_evidence",
          originalFilename: selectedPhoto.name,
          declaredMediaType: selectedPhoto.type as
            "image/jpeg" | "image/png" | "image/webp",
          declaredByteCount: selectedPhoto.size,
        });
        const ready = await uploadFileContent(
          granted.file.id,
          granted.grant.token,
          selectedPhoto,
        );
        if (ready.state !== "ready") throw new Error("photo_not_ready");
        fileId = ready.id;
      }
      const updated = await recordTestStep(
        order.id,
        order.version,
        step.key,
        result,
        fileId,
      );
      setSelectedPhoto(null);
      if (position < steps.length - 1) setPosition(position + 1);
      return updated;
    }, "Step saved.");
  }

  async function finish() {
    if (!activeSession) {
      setMessage("Return to My Work and resume this Test in a timed session.");
      return;
    }
    await apply(async () => {
      let videoFileId: string | null = null;
      if (needsVideo) {
        if (!selectedVideo) throw new Error("video_required");
        const granted = await createFileUploadGrant({
          target: { type: "machine", id: order.machineId },
          purpose: "production_test_video",
          originalFilename: selectedVideo.name,
          declaredMediaType: selectedVideo.type as
            "video/mp4" | "video/quicktime" | "video/webm",
          declaredByteCount: selectedVideo.size,
        });
        const ready = await uploadFileContent(
          granted.file.id,
          granted.grant.token,
          selectedVideo,
        );
        if (ready.state !== "ready") throw new Error("video_not_ready");
        videoFileId = ready.id;
      }
      const updated = await finishTest(
        order.id,
        order.version,
        activeSession.version,
        videoFileId,
      );
      setSelectedVideo(null);
      return updated;
    }, "Test completed.");
  }

  async function openVideo(fileId: string) {
    if (!online) return;
    try {
      window.location.assign(await createFileDownloadUrl(fileId));
    } catch {
      setMessage("Private video could not be opened. Refresh and retry.");
    }
  }

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">
          {order.machineType === "washer" ? "Washer" : "Dryer"} Test
        </p>
        <h1>Test Work Order</h1>
        <p className="lede">
          Confirm this Machine before starting or recording results.
        </p>
      </div>
      <p>
        <Link href="/work">Back to My Work</Link>
      </p>
      {order.activeSessionId ? (
        <p>
          <Link
            href={`/work/session/${order.activeSessionId}?machine=${machine.id}`}
          >
            Return to active session
          </Link>
        </p>
      ) : null}
      <section
        className="panel work-machine-summary"
        aria-label="Machine identity"
      >
        <h2>
          {machine.manufacturer ?? "Manufacturer not recorded"}{" "}
          {machine.model ?? "Model not recorded"}
        </h2>
        <dl>
          <div>
            <dt>Serial</dt>
            <dd>{machine.serial ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt>Machine type</dt>
            <dd>{machine.machineType}</dd>
          </div>
          <div>
            <dt>Inventory</dt>
            <dd>{machine.inventoryState}</dd>
          </div>
          <div>
            <dt>Production</dt>
            <dd>{machine.productionState.replaceAll("_", " ")}</dd>
          </div>
        </dl>
        <Link href={`/machines/${machine.id}`}>View Machine record</Link>
      </section>
      {detail.initialBearingCheck ? (
        <section className="panel" aria-label="Initial Bearing Check">
          <h2>Initial Bearing Check</h2>
          <p>
            No concern observed · {detail.initialBearingCheck.actorUserId} ·{" "}
            {new Date(detail.initialBearingCheck.createdAt).toLocaleString()}
          </p>
        </section>
      ) : null}
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      {!online ? (
        <p className="form-message" role="status">
          Reconnect before saving Test work.
        </p>
      ) : null}
      {owner && !order.completedAt ? (
        <section className="panel work-assignment">
          <h2>Assignment</h2>
          <p>
            {order.assignedUserId
              ? "This Test is claimed."
              : "This Test is unclaimed."}
          </p>
          <label>
            Reassign to
            <select
              defaultValue=""
              disabled={busy || !online}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value)
                  void apply(
                    () => assignTest(order.id, order.version, value),
                    "Assignment updated.",
                  );
              }}
            >
              <option value="">Choose technician</option>
              {assignable.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          {order.assignedUserId ? (
            <button
              type="button"
              className="secondary-button"
              disabled={busy || !online}
              onClick={() =>
                void apply(
                  () => assignTest(order.id, order.version, null),
                  "Claim released.",
                )
              }
            >
              Release claim
            </button>
          ) : null}
        </section>
      ) : null}
      {!owner &&
      !order.completedAt &&
      !order.activeSessionId &&
      (!order.assignedUserId || claimant) ? (
        <section className="panel work-start">
          <h2>{run ? "Resume this test?" : "Ready to test?"}</h2>
          <p>
            {run
              ? "Add this Test to a session. Earlier results and the checklist version are retained."
              : "Add this Machine to a timed session and pin the approved checklist version."}
          </p>
          <button
            type="button"
            disabled={
              busy || !online || Boolean(order.assignedUserId && !claimant)
            }
            onClick={() => void beginSession()}
          >
            {activeSession
              ? "Add to Active Session"
              : run
                ? "Resume in Session"
                : "Start Session"}
          </button>
        </section>
      ) : null}
      {run ? (
        <section className="panel work-checklist">
          <div className="work-step-heading">
            <div>
              <p className="eyebrow">
                Checklist version {run.template.version}
              </p>
              <h2>
                {order.completedAt
                  ? "Test results"
                  : `Step ${position + 1} of ${steps.length}`}
              </h2>
            </div>
            <span>
              {latest.size} of {steps.length} recorded
            </span>
          </div>
          {step ? (
            <div className="work-step">
              <p className="work-instruction">{step.instruction}</p>
              {latest.get(step.key) ? (
                <p className="status">
                  Latest: {latest.get(step.key)?.result.toUpperCase()}
                </p>
              ) : null}
              {step.photoRequired && !order.completedAt ? (
                <label>
                  Required private Machine photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    disabled={busy || !online || !claimant}
                    onChange={(event) =>
                      setSelectedPhoto(event.currentTarget.files?.[0] ?? null)
                    }
                  />
                </label>
              ) : null}
              {!order.completedAt && claimant && activeSession ? (
                <div
                  className="work-result-actions"
                  aria-label="Record step result"
                >
                  <button
                    type="button"
                    disabled={
                      busy || !online || (step.photoRequired && !selectedPhoto)
                    }
                    onClick={() => void saveResult("pass")}
                  >
                    Pass
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy || !online || (step.photoRequired && !selectedPhoto)
                    }
                    onClick={() => void saveResult("fail")}
                  >
                    Fail
                  </button>
                  {step.allowNa ? (
                    <button
                      type="button"
                      disabled={
                        busy ||
                        !online ||
                        (step.photoRequired && !selectedPhoto)
                      }
                      onClick={() => void saveResult("na")}
                    >
                      N/A
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="work-step-navigation">
            <button
              type="button"
              className="secondary-button"
              disabled={position === 0}
              onClick={() => setPosition(position - 1)}
            >
              Previous step
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={position >= steps.length - 1}
              onClick={() => setPosition(position + 1)}
            >
              Next step
            </button>
          </div>
          {!order.completedAt && claimant && activeSession ? (
            <>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !online}
                onClick={() =>
                  void apply(
                    () =>
                      reportNewBearingConcern(
                        order.id,
                        order.version,
                        activeSession.version,
                      ),
                    "Bearing concern reported. Repair required.",
                  )
                }
              >
                Report new bearing concern
              </button>
              {needsVideo ? (
                <div className="work-video-capture">
                  <h3>Record proof of operation</h3>
                  <p>
                    Start on the manufacturer nameplate, then show the Machine
                    operating.
                  </p>
                  <label>
                    Private Machine video
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      capture="environment"
                      disabled={busy || !online}
                      onChange={(event) =>
                        setSelectedVideo(event.currentTarget.files?.[0] ?? null)
                      }
                    />
                  </label>
                  <p>MP4, MOV, or WebM · up to 100 MiB.</p>
                </div>
              ) : null}
              <button
                type="button"
                disabled={
                  !complete || busy || !online || (needsVideo && !selectedVideo)
                }
                onClick={() => void finish()}
              >
                Finish Test
              </button>
            </>
          ) : null}
          {order.completedAt ? (
            <div className="work-outcome" role="status">
              <h2>
                {order.state === "awaiting_clean"
                  ? "Ready for cleaning"
                  : "Repair required"}
              </h2>
              {failed.length > 0 ? (
                <ul>
                  {failed.map((item) => (
                    <li key={item.key}>{item.instruction}</li>
                  ))}
                </ul>
              ) : null}
              {run.videoFileId ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!online}
                  onClick={() => void openVideo(run.videoFileId!)}
                >
                  Open private test video
                </button>
              ) : null}
            </div>
          ) : null}
          <details>
            <summary>Result history</summary>
            <ol>
              {run.results.map((result) => (
                <li key={result.id}>
                  {result.stepKey}: {result.result.toUpperCase()} ·{" "}
                  {result.actorUserId} ·{" "}
                  {new Date(result.createdAt).toLocaleString()}
                </li>
              ))}
            </ol>
          </details>
        </section>
      ) : null}
    </>
  );
}
