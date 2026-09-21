"use client";

import type { AcquisitionLoad, ImportRun } from "@simply-clean/contracts";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { uploadInventoryImport } from "../../../../lib/imports-client";

function runStateLabel(state: ImportRun["state"]): string {
  return state.replaceAll("_", " ");
}

export function ImportsDashboard({
  initialRuns,
  loads,
}: Readonly<{
  initialRuns: ImportRun[];
  loads: AcquisitionLoad[];
}>) {
  const [runs, setRuns] = useState(initialRuns);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");
    const loadId = String(form.get("loadId") ?? "");
    if (!(file instanceof File) || file.size === 0) {
      setMessage("Choose a non-empty .xlsx or .csv inventory file.");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const run = await uploadInventoryImport(file, loadId);
      setRuns((current) => [
        run,
        ...current.filter((candidate) => candidate.id !== run.id),
      ]);
      formElement.reset();
      setMessage(
        `Import staged with ${run.totalRows} source rows. Review it before approval.`,
      );
    } catch {
      setMessage(
        "The inventory file could not be staged. Check its type, size, and selected Load before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="management-grid imports-layout">
      <section className="panel">
        <h2>Stage inventory file</h2>
        <p className="empty-state">
          The source stays private and unchanged. Nothing enters authoritative
          inventory until a reviewed selection is approved and committed.
        </p>
        {loads.length === 0 ? (
          <p className="form-message">
            Create an Acquisition Load before staging an import.
          </p>
        ) : (
          <form className="auth-form" onSubmit={upload}>
            <label>
              Source Load
              <select name="loadId" required defaultValue="">
                <option value="" disabled>
                  Select a Load
                </option>
                {loads.map((load) => (
                  <option key={load.id} value={load.id}>
                    {load.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Inventory file
              <input
                name="file"
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Staging…" : "Stage for review"}
            </button>
          </form>
        )}
        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
      </section>

      <section className="panel inventory-list" aria-labelledby="runs-heading">
        <h2 id="runs-heading">Import runs</h2>
        {runs.length === 0 ? (
          <p className="empty-state">No inventory files have been staged.</p>
        ) : (
          runs.map((run) => (
            <article className="inventory-row" key={run.id}>
              <div>
                <strong>{run.originalFilename}</strong>
                <span>
                  {run.sourceLoadDisplayName} · {runStateLabel(run.state)}
                </span>
                <small>
                  {run.totalRows} rows · {run.readyRows} ready ·{" "}
                  {run.warningRows} warning · {run.errorRows} error
                </small>
              </div>
              <Link href={`/admin/imports/${run.id}`}>Review</Link>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
