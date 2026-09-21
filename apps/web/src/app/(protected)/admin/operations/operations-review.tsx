"use client";

import type { AuditEntry, OutboxJob } from "@simply-clean/contracts";
import { useState } from "react";

import { retryOperationsJob } from "../../../../lib/operations-client";
import { useOnlineStatus } from "../../online-status";
import { useServerState } from "../../use-server-state";

export function OperationsReview({
  initialAudit,
  initialJobs,
}: Readonly<{ initialAudit: AuditEntry[]; initialJobs: OutboxJob[] }>) {
  const [jobs, setJobs] = useServerState(initialJobs);
  const [message, setMessage] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const online = useOnlineStatus();

  async function retry(job: OutboxJob) {
    if (!online) {
      setMessage("Reconnect before retrying this work item.");
      return;
    }
    setBusyId(job.id);
    try {
      const updated = await retryOperationsJob(job.id, job.version);
      setJobs((current) =>
        updated.state === "dead_letter" || updated.state === "retry_wait"
          ? current.map((candidate) =>
              candidate.id === updated.id ? updated : candidate,
            )
          : current.filter((candidate) => candidate.id !== updated.id),
      );
      setMessage("Work item requeued. Its audit history was preserved.");
    } catch {
      setMessage("Retry could not be accepted. Refresh and check its state.");
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <div className="management-grid">
      <section className="panel inventory-list">
        <h2>Recent audit history</h2>
        {initialAudit.length === 0 ? (
          <p className="empty-state">No matching mutations recorded.</p>
        ) : (
          initialAudit.map((entry) => (
            <article className="inventory-row" key={entry.id}>
              <div>
                <strong>{entry.action}</strong>
                <span>
                  {entry.targetType} · {entry.targetId}
                </span>
                <small>
                  {entry.actorKind === "system"
                    ? "System"
                    : `User ${entry.actorUserId}`}{" "}
                  · {new Date(entry.createdAt).toLocaleString()}
                </small>
                <small>Request {entry.requestId}</small>
              </div>
            </article>
          ))
        )}
      </section>
      <section className="panel inventory-list">
        <h2>Retryable and failed work</h2>
        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
        {jobs.length === 0 ? (
          <p className="empty-state">No work items need attention.</p>
        ) : (
          jobs.map((job) => (
            <article className="inventory-row" key={job.id}>
              <div>
                <strong>{job.eventType}</strong>
                <span>
                  {job.targetType} · {job.targetId}
                </span>
                <small>
                  {job.state.replaceAll("_", " ")} · {job.attemptCount} attempts
                  · {job.errorCode ?? "No safe error code"} · updated{" "}
                  {new Date(job.updatedAt).toLocaleString()}
                </small>
              </div>
              {job.state === "dead_letter" ? (
                <button
                  type="button"
                  disabled={busyId === job.id || !online}
                  onClick={() => void retry(job)}
                >
                  Retry
                </button>
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
