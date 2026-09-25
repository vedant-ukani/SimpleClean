"use client";

import type {
  TestQueueResponse,
  TestWorkDetail,
} from "@laundrorama/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addTestSessionOrders,
  createTestSession,
} from "../../../lib/production-client";
import { useOnlineStatus } from "../online-status";
import { useServerState } from "../use-server-state";

function WorkCard({
  detail,
  action,
}: {
  detail: TestWorkDetail;
  action?: React.ReactNode;
}) {
  const { order, machine } = detail;
  return (
    <article className="dashboard-card work-card" key={order.id}>
      <span className="eyebrow">
        {order.machineType === "washer" ? "Washer" : "Dryer"} Test
      </span>
      <strong>
        {machine.manufacturer ?? "Manufacturer not recorded"}{" "}
        {machine.model ?? "Model not recorded"}
      </strong>
      <span>Serial: {machine.serial ?? "Not recorded"}</span>
      <span>State: {order.state.replaceAll("_", " ")}</span>
      <span>Assignment: {order.assignedUserId ? "Claimed" : "Unclaimed"}</span>
      <Link href={`/work/${order.id}`}>Open Test Work Order</Link>
      {action}
    </article>
  );
}

export function WorkQueueView({
  initialQueue,
  owner,
}: {
  initialQueue: TestQueueResponse;
  owner: boolean;
}) {
  const [queue] = useServerState(initialQueue);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const online = useOnlineStatus();
  const router = useRouter();
  const selectable = [
    ...queue.availableTests,
    ...queue.myActiveMachines.filter((item) => !item.order.activeSessionId),
  ];
  const uniqueSelectable = [
    ...new Map(selectable.map((item) => [item.order.id, item])).values(),
  ];
  async function submitSelection() {
    if (!online || busy || selected.length === 0) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const orders = selected.map((orderId) => {
        const detail = uniqueSelectable.find(
          (item) => item.order.id === orderId,
        )!;
        return { orderId, expectedVersion: detail.order.version };
      });
      const session = queue.activeSession
        ? await addTestSessionOrders(
            queue.activeSession.id,
            queue.activeSession.version,
            orders,
          )
        : await createTestSession(orders);
      router.push(`/work/session/${session.id}`);
      router.refresh();
    } catch {
      setMessage(
        "The selection changed or could not be started. Refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      {!owner && queue.specialties.length !== 1 ? (
        <p className="empty-state">
          {queue.specialties.length > 1
            ? "Owner must choose one testing assignment before you start new work."
            : "Cleaner / no testing assignment. No Test work is assigned to this workspace."}
        </p>
      ) : null}
      {!owner && queue.specialties.length === 1 ? (
        <>
          <section aria-label="Active Session">
            <h2>Active Session</h2>
            {queue.activeSession ? (
              <p>
                <Link
                  className="button-link"
                  href={`/work/session/${queue.activeSession.id}`}
                >
                  Resume{" "}
                  {queue.activeSession.state === "paused" ? "paused" : "active"}{" "}
                  session ·{" "}
                  {
                    queue.activeSession.items.filter(
                      (item) =>
                        item.state !== "completed" && item.state !== "removed",
                    ).length
                  }{" "}
                  Machines
                </Link>
              </p>
            ) : (
              <p className="empty-state">
                No active session. Select available Tests below to start one.
              </p>
            )}
          </section>
          <section aria-label="My Active Machines">
            <h2>My Active Machines</h2>
            {queue.myActiveMachines.length ? (
              <div className="work-card-grid">
                {queue.myActiveMachines.map((detail) => (
                  <WorkCard
                    key={detail.order.id}
                    detail={detail}
                    action={
                      !detail.order.activeSessionId ? (
                        <label className="work-selection">
                          <input
                            type="checkbox"
                            checked={selected.includes(detail.order.id)}
                            disabled={busy || !online}
                            onChange={(event) =>
                              setSelected((current) =>
                                event.target.checked
                                  ? [...current, detail.order.id]
                                  : current.filter(
                                      (id) => id !== detail.order.id,
                                    ),
                              )
                            }
                          />
                          Add to group
                        </label>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="empty-state">No claimed Machines.</p>
            )}
          </section>
          <section aria-label="Initial checks">
            <h2>Initial checks</h2>
            {queue.initialChecks.length ? (
              <div className="work-card-grid">
                {queue.initialChecks.map((machine) => (
                  <Link
                    className="dashboard-card work-card"
                    href={`/work/initial-check/${machine.id}`}
                    key={machine.id}
                  >
                    <span className="eyebrow">
                      {machine.machineType === "washer" ? "Washer" : "Dryer"}{" "}
                      initial check
                    </span>
                    <strong>
                      {machine.manufacturer ?? "Manufacturer not recorded"}{" "}
                      {machine.model ?? "Model not recorded"}
                    </strong>
                    <span>Serial: {machine.serial ?? "Not recorded"}</span>
                    <span className="dashboard-card-action">Check bearing</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="empty-state">No Machines need an initial check.</p>
            )}
          </section>
        </>
      ) : null}
      <section aria-label={owner ? "Production Tests" : "Available Tests"}>
        <h2>{owner ? "Production Tests" : "Available Tests"}</h2>
        {(owner ? queue.orders : queue.availableTests).length ? (
          <div className="work-card-grid">
            {(owner ? queue.orders : queue.availableTests).map((detail) => (
              <WorkCard
                key={detail.order.id}
                detail={detail}
                action={
                  !owner && queue.specialties.length === 1 ? (
                    <label className="work-selection">
                      <input
                        type="checkbox"
                        checked={selected.includes(detail.order.id)}
                        disabled={busy || !online}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, detail.order.id]
                              : current.filter((id) => id !== detail.order.id),
                          )
                        }
                      />
                      Add to group
                    </label>
                  ) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <p className="empty-state">No Test Work Orders are available.</p>
        )}
        {!owner && queue.specialties.length === 1 ? (
          <button
            type="button"
            disabled={!online || busy || !selected.length}
            onClick={() => void submitSelection()}
          >
            {busy
              ? "Starting…"
              : queue.activeSession
                ? `Add ${selected.length} to Session`
                : `Start Session with ${selected.length} Machines`}
          </button>
        ) : null}
      </section>
      {owner && queue.otherMachineCount > 0 ? (
        <p className="form-message" role="status">
          {queue.otherMachineCount} Other Machines need an Owner-selected
          testing path.
        </p>
      ) : null}
    </>
  );
}
