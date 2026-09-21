"use client";

import type { FileAttachment } from "@simply-clean/contracts";
import { useState } from "react";

import { abandonIncompleteFile } from "../../../../lib/files-client";
import { useOnlineStatus } from "../../online-status";

export function IncompleteFilesReview({
  initialFiles,
}: Readonly<{ initialFiles: FileAttachment[] }>) {
  const [files, setFiles] = useState(initialFiles);
  const [message, setMessage] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const online = useOnlineStatus();

  async function abandon(fileId: string) {
    if (!online) {
      setMessage("Reconnect before cleaning up this attachment.");
      return;
    }
    setBusyId(fileId);
    try {
      await abandonIncompleteFile(fileId);
      setFiles((current) => current.filter((file) => file.id !== fileId));
      setMessage("Incomplete attachment abandoned and partial bytes removed.");
    } catch {
      setMessage(
        "Cleanup could not finish. The upload may still be active; refresh before retrying.",
      );
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section className="panel inventory-list">
      <h2>Pending and failed</h2>
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      {files.length === 0 ? (
        <p className="empty-state">No incomplete attachments need review.</p>
      ) : (
        files.map((file) => (
          <article className="inventory-row" key={file.id}>
            <div>
              <strong>{file.originalFilename}</strong>
              <span>
                {file.target.type} · {file.purpose.replaceAll("_", " ")} ·{" "}
                {file.state.replaceAll("_", " ")}
              </span>
              <small>{file.failureCode ?? file.createdAt}</small>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={busyId === file.id || !online}
              onClick={() => void abandon(file.id)}
            >
              Abandon and clean up
            </button>
          </article>
        ))
      )}
    </section>
  );
}
