"use client";

import type {
  ImportRow,
  ImportRowListResponse,
  ImportRun,
} from "@simply-clean/contracts";
import Link from "next/link";
import { useState } from "react";

import {
  approveInventoryImport,
  commitInventoryImport,
  getBrowserImportRows,
  importReportUrl,
  importSourceUrl,
} from "../../../../../lib/imports-client";
import { useOnlineStatus } from "../../../online-status";
import { useServerState } from "../../../use-server-state";

const classificationLabel: Record<ImportRow["classification"], string> = {
  ready: "Ready",
  warning: "Warning — review required",
  error: "Error — cannot approve",
};

function findingLabel(code: string): string {
  return code.replaceAll("_", " ");
}

function recorded(value: string | null): string {
  return value ?? "Not recorded";
}

export function ImportReview({
  run: initialRun,
  rowResult,
  classification,
}: Readonly<{
  run: ImportRun;
  rowResult: ImportRowListResponse;
  classification?: ImportRow["classification"];
}>) {
  const [run, setRun] = useServerState(initialRun);
  const [pageResult, setPageResult] = useServerState(rowResult);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmCommit, setConfirmCommit] = useState(false);
  const [machineIds, setMachineIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  function toggle(rowId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  async function approve() {
    if (!online) {
      setMessage("Reconnect before approving source rows.");
      return;
    }
    if (selected.size === 0) {
      setMessage("Select at least one ready or reviewed warning row.");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const rowIds = [...selected];
      const updated = await approveInventoryImport(run.id, run.version, rowIds);
      setRun(updated);
      setPageResult((current) => ({
        ...current,
        rows: current.rows.map((row) =>
          selected.has(row.id) ? { ...row, approved: true } : row,
        ),
      }));
      setSelected(new Set());
      setMessage(
        `${updated.approvedRows} rows approved. Commit is still required before Machines are created.`,
      );
    } catch {
      setMessage(
        "Approval could not be recorded. Refresh to check the run version and findings.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!online) {
      setMessage("Reconnect before committing approved Machines.");
      return;
    }
    if (!confirmCommit) {
      setMessage("Confirm the approved selection before committing.");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await commitInventoryImport(run.id, run.version);
      setRun(result.run);
      setMachineIds(result.machineIds);
      setMessage(
        `${result.machineIds.length} provisional Machines created with source-row traceability.`,
      );
    } catch {
      setMessage(
        "Commit did not complete. No partial result should be assumed; refresh before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changePage(page: number) {
    if (!online) {
      setMessage("Reconnect before loading more source rows.");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      setPageResult(
        await getBrowserImportRows(run.id, {
          ...(classification ? { classification } : {}),
          page,
          pageSize: pageResult.pageSize,
        }),
      );
    } catch {
      setMessage("The next source rows could not be loaded. Retry or refresh.");
    } finally {
      setBusy(false);
    }
  }

  const pageCount = Math.max(
    1,
    Math.ceil(pageResult.total / pageResult.pageSize),
  );
  const canCommit =
    run.state === "approved" ||
    (run.state === "commit_failed" && run.failureCode === "commit_failed");

  return (
    <div className="inventory-stack">
      <section className="panel detail-grid">
        <dl>
          <div>
            <dt>State</dt>
            <dd>{run.state.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>Source Load</dt>
            <dd>{run.sourceLoadDisplayName}</dd>
          </div>
          <div>
            <dt>Source rows</dt>
            <dd>{run.totalRows}</dd>
          </div>
          <div>
            <dt>Ready</dt>
            <dd>{run.readyRows}</dd>
          </div>
          <div>
            <dt>Warnings</dt>
            <dd>{run.warningRows}</dd>
          </div>
          <div>
            <dt>Errors</dt>
            <dd>{run.errorRows}</dd>
          </div>
          <div>
            <dt>Approved</dt>
            <dd>{run.approvedRows}</dd>
          </div>
          <div>
            <dt>Committed</dt>
            <dd>{run.committedRows}</dd>
          </div>
        </dl>
        {run.failureCode ? (
          <p className="form-error">Safe failure code: {run.failureCode}</p>
        ) : null}
        <div className="row-actions">
          <a className="button-link" href={importSourceUrl(run.id)}>
            Download source
          </a>
          <a className="button-link" href={importReportUrl(run.id)}>
            Download result report
          </a>
        </div>
      </section>

      <section className="panel">
        <form className="search-form" method="get">
          <label>
            Row classification
            <select name="classification" defaultValue={classification ?? ""}>
              <option value="">All rows</option>
              <option value="ready">Ready</option>
              <option value="warning">Warnings</option>
              <option value="error">Errors</option>
            </select>
          </label>
          <button type="submit">Filter rows</button>
        </form>
      </section>

      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}

      <section
        className="panel import-table-wrap"
        aria-labelledby="rows-heading"
      >
        <div className="section-heading-row">
          <div>
            <h2 id="rows-heading">Source row preview</h2>
            <p className="empty-state">
              {pageResult.total} matching rows · page {pageResult.page} of{" "}
              {pageCount}
            </p>
          </div>
          {run.state === "staged" ? (
            <button
              type="button"
              disabled={busy || !online}
              onClick={() => void approve()}
            >
              Approve {selected.size} selected
            </button>
          ) : null}
        </div>
        {pageResult.rows.length === 0 ? (
          <p className="empty-state">No rows match this filter.</p>
        ) : (
          <table className="import-table">
            <thead>
              <tr>
                <th scope="col">Approve</th>
                <th scope="col">Source</th>
                <th scope="col">Candidate identity</th>
                <th scope="col">Classification and findings</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {pageResult.rows.map((row) => {
                const selectable =
                  run.state === "staged" && row.classification !== "error";
                return (
                  <tr key={row.id}>
                    <td>
                      {row.approved ? (
                        <span className="status status--success">Approved</span>
                      ) : (
                        <label className="checkbox-hit-target">
                          <input
                            aria-label={`Approve source row ${row.sourceRowNumber}`}
                            type="checkbox"
                            disabled={!selectable || busy || !online}
                            checked={selected.has(row.id)}
                            onChange={() => toggle(row.id)}
                          />
                        </label>
                      )}
                    </td>
                    <td>
                      <strong>{row.sheetName}</strong>
                      <small>Row {row.sourceRowNumber}</small>
                    </td>
                    <td>
                      <strong>{recorded(row.candidate.manufacturer)}</strong>
                      <span>
                        Model {recorded(row.candidate.model)} · Serial{" "}
                        {recorded(row.candidate.serial)}
                      </span>
                      <small>
                        {row.candidate.machineType} ·{" "}
                        {row.candidate.inventoryState.replaceAll("_", " ")}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`status ${
                          row.classification === "ready"
                            ? "status--success"
                            : row.classification === "error"
                              ? "status--danger"
                              : "status--warning"
                        }`}
                      >
                        {classificationLabel[row.classification]}
                      </span>
                      {row.findings.length === 0 ? (
                        <small>No findings</small>
                      ) : (
                        <ul className="findings-list">
                          {row.findings.map((finding) => (
                            <li key={finding}>{findingLabel(finding)}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>
                      {row.machineId ? (
                        <Link
                          className="button-link"
                          href={`/machines/${row.machineId}`}
                        >
                          View Machine
                        </Link>
                      ) : (
                        <span>Not committed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <nav className="pagination" aria-label="Import row pages">
          {pageResult.page > 1 ? (
            <button
              type="button"
              className="secondary-button"
              disabled={busy || !online}
              onClick={() => void changePage(pageResult.page - 1)}
            >
              Previous
            </button>
          ) : null}
          {pageResult.page < pageCount ? (
            <button
              type="button"
              className="secondary-button"
              disabled={busy || !online}
              onClick={() => void changePage(pageResult.page + 1)}
            >
              Next
            </button>
          ) : null}
        </nav>
      </section>

      {run.state === "commit_failed" &&
      run.failureCode === "duplicate_state_changed" ? (
        <section className="panel commit-panel">
          <h2>Inventory matches changed</h2>
          <p>
            This approval is no longer valid because matching Machines changed
            after review. Stage a new Import Run and review its current matches.
          </p>
          <Link className="button-link" href="/admin/imports">
            Start a new import
          </Link>
        </section>
      ) : null}

      {canCommit ? (
        <section className="panel commit-panel">
          <h2>Commit approved selection</h2>
          <p>
            This creates {run.approvedRows} provisional Machines in one atomic
            operation. It does not verify identity or migrate historical sales,
            testing, cleaning, repair, or pricing.
          </p>
          <label className="confirmation-control">
            <input
              type="checkbox"
              checked={confirmCommit}
              onChange={(event) => setConfirmCommit(event.target.checked)}
            />
            I confirm this exact approved selection may create Machines.
          </label>
          <button
            type="button"
            disabled={!confirmCommit || busy || !online}
            onClick={() => void commit()}
          >
            {busy ? "Committing…" : "Create provisional Machines"}
          </button>
        </section>
      ) : null}

      {machineIds.length > 0 ? (
        <section className="panel inventory-list">
          <h2>Created Machines</h2>
          {machineIds.map((machineId) => (
            <article className="inventory-row" key={machineId}>
              <div>
                <strong>{machineId}</strong>
                <small>Provisional identity from this Import Run</small>
              </div>
              <Link href={`/machines/${machineId}`}>View Machine</Link>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
