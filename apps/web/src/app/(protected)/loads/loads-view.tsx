"use client";

import type { AcquisitionLoad } from "@laundrorama/contracts";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { createLoad } from "../../../lib/inventory-client";
import { useOnlineStatus } from "../online-status";
import { useServerState } from "../use-server-state";
import {
  displayExpectedArrival,
  displayReceivedDate,
  expectedArrivalFromDate,
  filterReceivedLoads,
  groupExpectedLoads,
} from "./load-dates";

export function LoadsView({
  initialLoads,
  canManage,
  expectedOnly = false,
}: Readonly<{
  initialLoads: AcquisitionLoad[];
  canManage: boolean;
  expectedOnly?: boolean;
}>) {
  const [loads, setLoads] = useServerState(initialLoads);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [historyName, setHistoryName] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const online = useOnlineStatus();
  const visibleLoads = expectedOnly
    ? loads.filter((load) => load.receivedAt === null)
    : loads;
  const expectedGroups = expectedOnly ? groupExpectedLoads(visibleLoads) : [];
  const receivedLoads = expectedOnly
    ? filterReceivedLoads(loads, historyName, historyDate)
    : [];
  const hasReceivedLoads =
    expectedOnly && loads.some((load) => load.receivedAt);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) {
      setMessage("Reconnect before creating a Load.");
      return;
    }
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const load = await createLoad({
        displayName: String(form.get("displayName") ?? ""),
        sourceName: String(form.get("sourceName") ?? "") || null,
        sourceReference: String(form.get("sourceReference") ?? "") || null,
        expectedArrivalAt: expectedArrivalFromDate(
          String(form.get("expectedArrivalDate") ?? ""),
        ),
      });
      setLoads((current) => [load, ...current]);
      formElement.reset();
      setMessage("Load created.");
    } catch {
      setMessage("The Load could not be created. Check the details and retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        expectedOnly
          ? "management-grid management-grid--warehouse-loads"
          : "management-grid"
      }
    >
      {canManage ? (
        <section className="panel">
          <h2>Create Load</h2>
          <form className="auth-form" onSubmit={create}>
            <label>
              Display name
              <input name="displayName" required maxLength={160} />
            </label>
            <label>
              Source name
              <input name="sourceName" maxLength={160} />
            </label>
            <label>
              Source reference
              <input name="sourceReference" maxLength={160} />
            </label>
            <label>
              Expected arrival date
              <input name="expectedArrivalDate" type="date" />
            </label>
            <button type="submit" disabled={busy || !online}>
              {busy ? "Creating…" : "Create Load"}
            </button>
          </form>
        </section>
      ) : null}
      <section className="panel inventory-list" aria-labelledby="loads-heading">
        <h2 id="loads-heading">{expectedOnly ? "Expected Loads" : "Loads"}</h2>
        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
        {visibleLoads.length === 0 ? (
          <p className="empty-state">
            {expectedOnly
              ? "No Loads are currently awaiting receipt."
              : "No Loads have been recorded."}
          </p>
        ) : expectedOnly ? (
          <div className="expected-load-groups">
            {expectedGroups
              .filter((group) => group.loads.length > 0)
              .map((group) => (
                <section
                  className="expected-load-group"
                  aria-labelledby={`expected-loads-${group.key}`}
                  key={group.key}
                >
                  <h3 id={`expected-loads-${group.key}`}>{group.label}</h3>
                  {group.loads.map((load) => (
                    <article className="inventory-row" key={load.id}>
                      <div>
                        <strong>{load.displayName}</strong>
                        <span>{group.status}</span>
                        <small>
                          Expected:{" "}
                          {displayExpectedArrival(load.expectedArrivalAt)}
                        </small>
                      </div>
                      <Link href={`/loads/${load.id}`}>View Load</Link>
                    </article>
                  ))}
                </section>
              ))}
          </div>
        ) : (
          visibleLoads.map((load) => (
            <article className="inventory-row" key={load.id}>
              <div>
                <strong>{load.displayName}</strong>
                <span>{load.sourceName ?? "Source not recorded"}</span>
                <small>
                  {load.sourceReference ?? "Reference not recorded"}
                </small>
              </div>
              <Link href={`/loads/${load.id}`}>View Load</Link>
            </article>
          ))
        )}
      </section>
      {expectedOnly ? (
        <section
          className="panel inventory-list"
          aria-labelledby="intake-history-heading"
        >
          <h2 id="intake-history-heading">Intake History</h2>
          {hasReceivedLoads ? (
            <div className="intake-history-filters">
              <label>
                Load name
                <input
                  type="search"
                  value={historyName}
                  onChange={(event) => setHistoryName(event.target.value)}
                  disabled={!online}
                />
              </label>
              <label>
                Received date
                <input
                  type="date"
                  value={historyDate}
                  onChange={(event) => setHistoryDate(event.target.value)}
                  disabled={!online}
                />
              </label>
            </div>
          ) : null}
          {!hasReceivedLoads ? (
            <p className="empty-state">No Loads have been received yet.</p>
          ) : receivedLoads.length === 0 ? (
            <p className="empty-state">
              No received Loads match these filters.
            </p>
          ) : (
            receivedLoads.map((load) => (
              <article className="inventory-row" key={load.id}>
                <div>
                  <strong>{load.displayName}</strong>
                  <small>
                    Received: {displayReceivedDate(load.receivedAt!)}
                  </small>
                </div>
                <Link
                  href={`/loads/${load.id}`}
                  aria-disabled={!online}
                  tabIndex={online ? undefined : -1}
                  onClick={(event) => {
                    if (!online) event.preventDefault();
                  }}
                >
                  View Load
                </Link>
              </article>
            ))
          )}
        </section>
      ) : null}
    </div>
  );
}
