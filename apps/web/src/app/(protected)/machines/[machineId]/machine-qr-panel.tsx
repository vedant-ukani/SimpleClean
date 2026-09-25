"use client";

import type { QrLabel } from "@laundrorama/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { useOnlineStatus } from "../../online-status";
import { useServerState } from "../../use-server-state";

export function MachineQrPanel({
  machineId,
  initialLabels,
  canManage,
}: Readonly<{
  machineId: string;
  initialLabels: QrLabel[];
  canManage: boolean;
}>) {
  const [labels, setLabels] = useServerState(initialLabels);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [viewer, setViewer] = useState<{ labelId: string; url: string } | null>(
    null,
  );
  const [printReady, setPrintReady] = useState(false);
  const viewerUrl = useRef<string | null>(null);
  const viewerRequest = useRef(0);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const online = useOnlineStatus();
  const activeLabel = labels.find((label) => label.state === "active");
  const history = labels.filter((label) => label.state === "revoked");

  const closeViewer = useCallback(() => {
    viewerRequest.current += 1;
    if (viewerUrl.current) URL.revokeObjectURL(viewerUrl.current);
    viewerUrl.current = null;
    setViewer(null);
    setPrintReady(false);
  }, []);

  useEffect(() => {
    return () => {
      viewerRequest.current += 1;
      if (viewerUrl.current) URL.revokeObjectURL(viewerUrl.current);
      viewerUrl.current = null;
    };
  }, []);

  useEffect(() => {
    if (viewer && viewer.labelId !== activeLabel?.id) closeViewer();
  }, [activeLabel?.id, viewer, closeViewer]);

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
    if (!online) {
      setMessage("Reconnect before changing or viewing a QR label.");
      return;
    }
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
    closeViewer();
    const { revokeQrLabel } = await import("../../../../lib/qr-client");
    await run(
      () => revokeQrLabel(label.id, label.version),
      "QR label revoked. It can no longer be resolved or printed.",
    );
  }

  async function reissue(label: QrLabel) {
    closeViewer();
    const { reissueQrLabel } = await import("../../../../lib/qr-client");
    await run(
      () => reissueQrLabel(machineId, label.id, label.version),
      "QR label reissued. The previous label is revoked.",
    );
  }

  async function viewLabel(label: QrLabel) {
    if (!online) {
      setMessage("Reconnect before viewing a QR label.");
      return;
    }
    closeViewer();
    const request = viewerRequest.current;
    setBusy(true);
    setMessage(undefined);
    try {
      const { getPrintableQrLabel } = await import("../../../../lib/qr-client");
      const printable = await getPrintableQrLabel(label.id);
      if (request !== viewerRequest.current) return;
      const url = URL.createObjectURL(printable.blob);
      viewerUrl.current = url;
      setViewer({ labelId: label.id, url });
    } catch {
      if (request === viewerRequest.current) {
        setMessage("The printable label could not be opened. Try again.");
      }
    } finally {
      if (request === viewerRequest.current) setBusy(false);
    }
  }

  function printLabel() {
    if (!printReady) return;
    previewRef.current?.contentWindow?.focus();
    previewRef.current?.contentWindow?.print();
  }

  return (
    <section className="panel qr-label-panel">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Durable equipment identity</p>
          <h2>QR label</h2>
        </div>
        {!activeLabel && canManage ? (
          <button
            disabled={busy || !online}
            type="button"
            onClick={() => void create()}
          >
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
                disabled={busy || !online}
                type="button"
                onClick={() => void viewLabel(activeLabel)}
              >
                View / Print
              </button>
              <button
                className="secondary-button"
                disabled={busy || !online}
                type="button"
                onClick={() => void revoke(activeLabel)}
              >
                Revoke
              </button>
              <button
                disabled={busy || !online}
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

      {viewer ? (
        <section
          aria-label="Printable Machine QR label"
          className="qr-label-viewer"
        >
          <h3>Printable Machine QR label</h3>
          <iframe
            className="qr-label-preview"
            onLoad={() => setPrintReady(true)}
            ref={previewRef}
            sandbox="allow-same-origin allow-modals"
            src={viewer.url}
            title="Printable Machine QR label preview"
          />
          <div className="row-actions">
            <button disabled={!printReady} type="button" onClick={printLabel}>
              Print label
            </button>
            <button className="secondary-button" type="button" onClick={closeViewer}>
              Close
            </button>
          </div>
        </section>
      ) : null}

      {history.length > 0 ? (
        <details className="qr-label-history">
          <summary>Label history</summary>
          {history.map((label) => (
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
          ))}
        </details>
      ) : null}
    </section>
  );
}
