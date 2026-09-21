"use client";

import type {
  FileAttachment,
  FilePurpose,
  FileTarget,
} from "@simply-clean/contracts";
import { useState, type FormEvent } from "react";

import {
  createFileDownloadUrl,
  createFileUploadGrant,
  getBrowserFiles,
  uploadFileContent,
} from "../../lib/files-client";
import { useOnlineStatus } from "./online-status";
import { useServerState } from "./use-server-state";

const stateLabel: Record<FileAttachment["state"], string> = {
  pending_upload: "Pending upload",
  ready: "Ready",
  failed: "Upload failed — retry with a new attachment",
  abandoned: "Abandoned",
};

export function AttachmentsPanel({
  target,
  initialFiles,
  canUpload,
}: Readonly<{
  target: FileTarget;
  initialFiles: FileAttachment[];
  canUpload: boolean;
}>) {
  const [files, setFiles] = useServerState(initialFiles);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) {
      setMessage("Reconnect before uploading an attachment.");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selected = form.get("file");
    if (!(selected instanceof File) || selected.size === 0) {
      setMessage("Choose a supported image or PDF.");
      return;
    }
    setBusy(true);
    try {
      const purpose = String(form.get("purpose")) as FilePurpose;
      const granted = await createFileUploadGrant({
        target,
        purpose,
        originalFilename: selected.name,
        declaredMediaType: selected.type as
          "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
        declaredByteCount: selected.size,
      });
      setFiles((current) => [granted.file, ...current]);
      const ready = await uploadFileContent(
        granted.file.id,
        granted.grant.token,
        selected,
      );
      setFiles((current) =>
        current.map((file) => (file.id === ready.id ? ready : file)),
      );
      formElement.reset();
      setMessage("Attachment uploaded and verified.");
    } catch {
      try {
        setFiles(await getBrowserFiles(target));
      } catch {
        // The actionable upload message remains useful if refresh also fails.
      }
      setMessage(
        "Upload failed. Confirm the file type and size, then choose the file again to retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function download(fileId: string) {
    if (!online) {
      setMessage("Reconnect before opening this private attachment.");
      return;
    }
    setBusy(true);
    try {
      window.location.assign(await createFileDownloadUrl(fileId));
    } catch {
      setMessage("Download could not start. Refresh and retry.");
      setBusy(false);
    }
  }

  return (
    <section className="panel inventory-list attachments-panel">
      <h2>Attachments</h2>
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      {canUpload ? (
        <form className="inline-form" onSubmit={upload}>
          <label>
            Purpose
            <select name="purpose" required>
              {target.type === "machine" ? (
                <option value="nameplate">Nameplate</option>
              ) : null}
              <option value="arrival_condition">Arrival condition</option>
              <option value="document">Document</option>
              <option value="receipt">Receipt</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Private file
            <input
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              required
            />
          </label>
          <button type="submit" disabled={busy || !online}>
            Upload attachment
          </button>
        </form>
      ) : null}
      {files.length === 0 ? (
        <p className="empty-state">No attachments yet.</p>
      ) : (
        files.map((file) => (
          <article className="inventory-row" key={file.id}>
            <div>
              <strong>{file.originalFilename}</strong>
              <span>
                {file.purpose.replaceAll("_", " ")} · {stateLabel[file.state]}
              </span>
              {file.failureCode ? <small>{file.failureCode}</small> : null}
            </div>
            {file.state === "ready" ? (
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !online}
                onClick={() => void download(file.id)}
              >
                Download
              </button>
            ) : null}
          </article>
        ))
      )}
    </section>
  );
}
