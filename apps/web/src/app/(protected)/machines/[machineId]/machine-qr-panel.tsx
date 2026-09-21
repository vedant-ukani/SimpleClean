"use client";

import type { QrLabel } from "@simply-clean/contracts";
import { useState } from "react";

export function MachineQrPanel({
  machineId,
  initialLabels,
  canManage,
}: Readonly<{
  machineId: string;
  initialLabels: QrLabel[];
  canManage: boolean;
}>) {
  const [labels, setLabels] = useState(initialLabels);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const activeLabel = labels.find((label) => label.state === "active");
  const history = labels.filter((label) => label.state === "revoked");

  async function refreshLabels() {
    const { listMachineQrLabelsInBrowser } =
      await import("../../../../lib/qr-client");
    setLabels(await listMachineQrLabelsInBrowser(machineId));
  }

  async function run(
    action: () => Promise<unknown>,
    successMessage: string,
    refresh = true,
  ) {
    setBusy(true);
    setMessage(undefined);
    try {
      await action();
      if (refresh) await refreshLabels();
      setMessage(successMessage);
    } catch {
      setMessage(
        "The QR label action could not be completed. Refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const { createQrLabel } = await import("../../../../lib/qr-client");
    await run(() => createQrLabel(machineId), "QR label created.");
  }

  async function revoke(label: QrLabel) {
    const { revokeQrLabel } = await import("../../../../lib/qr-client");
    await run(
      () => revokeQrLabel(label.id, label.version),
      "QR label revoked. It can no longer be resolved or printed.",
    );
  }

  async function reissue(label: QrLabel) {
    const { reissueQrLabel } = await import("../../../../lib/qr-client");
    await run(
      () => reissueQrLabel(machineId, label.version),
      "QR label reissued. The previous label is revoked.",
    );
  }

  async function download(label: QrLabel) {
    const { downloadQrLabel } = await import("../../../../lib/qr-client");
    await run(
      () => downloadQrLabel(label.id),
      "Printable QR label downloaded.",
      false,
    );
  }

  return (
    <section className="panel qr-label-panel">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Durable equipment identity</p>
          <h2>QR label</h2>
        </div>
        {!activeLabel && canManage ? (
          <button disabled={busy} type="button" onClick={() => void create()}>
            Create label
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}

      {activeLabel ? (
        <article className="qr-label-current">
          <div>
            <span className="status status--success">Active label</span>
            <strong className="fallback-code">
              {activeLabel.fallbackCode}
            </strong>
            <small>Issued {activeLabel.issuedAt.slice(0, 10)}</small>
          </div>
          {canManage ? (
            <div className="row-actions">
              <button
                className="secondary-button"
                disabled={busy}
                type="button"
                onClick={() => void download(activeLabel)}
              >
                Download / Print
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                type="button"
                onClick={() => void revoke(activeLabel)}
              >
                Revoke
              </button>
              <button
                disabled={busy}
                type="button"
                onClick={() => void reissue(activeLabel)}
              >
                Reissue
              </button>
            </div>
          ) : null}
        </article>
      ) : (
        <p className="empty-state">No active QR label.</p>
      )}

      <div className="qr-label-history">
        <h3>Label history</h3>
        {history.length === 0 ? (
          <p className="empty-state">No revoked labels.</p>
        ) : (
          history.map((label) => (
            <article className="history-row" key={label.id}>
              <div className="section-heading-row">
                <strong className="fallback-code">{label.fallbackCode}</strong>
                <span className="status status--danger">Revoked</span>
              </div>
              <small>
                Issued {label.issuedAt.slice(0, 10)} · Revoked{" "}
                {label.revokedAt?.slice(0, 10) ?? "date unavailable"}
              </small>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
