"use client";

import type { TestSession } from "@laundrorama/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  changeTestSessionItemState,
  changeTestSessionState,
} from "../../../../../lib/production-client";
import { useOnlineStatus } from "../../../online-status";
import { useServerState } from "../../../use-server-state";

function clock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

export function SessionView({
  initialSession,
  owner,
  highlightMachineId,
}: {
  initialSession: TestSession;
  owner: boolean;
  highlightMachineId?: string;
}) {
  const [session, setSession] = useServerState(initialSession);
  const [now, setNow] = useState(0);
  const [receivedAt, setReceivedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const online = useOnlineStatus(() => router.refresh());
  const router = useRouter();
  useEffect(() => {
    setReceivedAt(performance.now());
  }, [session]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const live =
    session.state === "active" && receivedAt
      ? Math.max(0, Math.floor((now - receivedAt) / 1000))
      : 0;
  async function mutate(action: () => Promise<TestSession>) {
    if (!online || busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      setSession(await action());
      router.refresh();
    } catch {
      setMessage(
        "The session changed or could not be saved. Refresh and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">
          {session.specialty === "washer" ? "Washer" : "Dryer"} Technician
        </p>
        <h1>
          {session.state === "completed"
            ? "Completed Session"
            : "Active Session"}
        </h1>
        <p className="lede">
          Each Machine has its own Test checklist and evidence. Session time is
          recorded on the server.
        </p>
      </div>
      <p>
        <Link href="/work">Back to My Work</Link>
      </p>
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      {!online ? (
        <p className="form-message" role="status">
          Reconnect before changing this session.
        </p>
      ) : null}
      <section className="panel session-summary" aria-label="Session time">
        <p className="eyebrow">
          {session.state === "paused"
            ? "Paused"
            : session.state === "completed"
              ? "Finished"
              : "Timing"}
        </p>
        <p className="session-clock" aria-label="Total elapsed time">
          {clock(session.elapsedSeconds + live)}
        </p>
        <p>Unallocated time: {clock(session.unallocatedSeconds)}</p>
        <small>Server as of {new Date(session.asOf).toLocaleString()}</small>
        {!owner && session.state !== "completed" ? (
          <div className="session-controls">
            <button
              type="button"
              disabled={busy || !online}
              onClick={() =>
                void mutate(() =>
                  changeTestSessionState(
                    session.id,
                    session.version,
                    session.state === "paused" ? "resume" : "pause",
                  ),
                )
              }
            >
              {session.state === "paused" ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy || !online}
              onClick={() =>
                void mutate(() =>
                  changeTestSessionState(session.id, session.version, "finish"),
                )
              }
            >
              Finish Session
            </button>
          </div>
        ) : null}
      </section>
      <section aria-label="Session Machines">
        <h2>Machines in this session</h2>
        <div className="work-card-grid">
          {session.items.map((item) => {
            const { order, machine } = item.order;
            const current =
              item.state !== "completed" && item.state !== "removed";
            return (
              <article
                key={order.id}
                className={`dashboard-card work-card session-machine${machine.id === highlightMachineId ? " session-machine--highlight" : ""}`}
              >
                <span className="eyebrow">
                  {order.machineType === "washer" ? "Washer" : "Dryer"} ·{" "}
                  {item.state.replaceAll("_", " ")}
                </span>
                <strong>
                  {machine.manufacturer ?? "Manufacturer not recorded"}{" "}
                  {machine.model ?? "Model not recorded"}
                </strong>
                <span>Serial: {machine.serial ?? "Not recorded"}</span>
                <span>Allocated time: {clock(item.allocatedSeconds)}</span>
                <Link className="button-link" href={`/work/${order.id}`}>
                  {current ? "Open individual Test" : "View Test history"}
                </Link>
                {!owner && current && session.state !== "completed" ? (
                  <div
                    className="session-item-controls"
                    aria-label={`Work state for ${machine.serial ?? machine.id}`}
                  >
                    {(["working", "running_cycle", "waiting"] as const).map(
                      (state) => (
                        <button
                          type="button"
                          key={state}
                          className={
                            item.state === state
                              ? "session-status-selected"
                              : "secondary-button"
                          }
                          aria-pressed={item.state === state}
                          disabled={busy || !online || item.state === state}
                          onClick={() =>
                            void mutate(() =>
                              changeTestSessionItemState(
                                session.id,
                                order.id,
                                session.version,
                                state,
                              ),
                            )
                          }
                        >
                          {state === "running_cycle"
                            ? "Running cycle"
                            : state === "working"
                              ? "Working"
                              : "Waiting"}
                        </button>
                      ),
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      {!owner && session.state !== "completed" ? (
        <p>
          <Link href="/work">Add another matching Machine</Link>
        </p>
      ) : null}
    </>
  );
}
