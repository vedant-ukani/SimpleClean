import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AttachmentsPanel } from "../src/app/(protected)/attachments-panel";

const timestamp = new Date().toISOString();
const base = {
  id: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
  target: {
    type: "machine" as const,
    id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
  },
  purpose: "nameplate" as const,
  originalFilename: "plate.jpg",
  declaredMediaType: "image/jpeg" as const,
  detectedMediaType: null,
  declaredByteCount: 4,
  byteCount: null,
  sha256: null,
  uploaderUserId: "user-1",
  failureCode: null,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("attachments UI", () => {
  it("shows role-aware actions and useful lifecycle labels", () => {
    const markup = renderToStaticMarkup(
      <AttachmentsPanel
        target={base.target}
        canUpload
        initialFiles={[
          { ...base, state: "pending_upload" },
          {
            ...base,
            id: "f13fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
            state: "failed",
            failureCode: "media_type_mismatch",
          },
          {
            ...base,
            id: "2c74c8a4-b4db-4c31-91f4-16c4d941fef8",
            state: "ready",
            detectedMediaType: "image/jpeg",
            byteCount: 4,
            sha256: "a".repeat(64),
          },
        ]}
      />,
    );
    expect(markup).toContain("Upload attachment");
    expect(markup).toContain("Pending upload");
    expect(markup).toContain("Upload failed — retry");
    expect(markup).toContain("Download");
  });

  it("hides upload actions and labels an empty list", () => {
    const markup = renderToStaticMarkup(
      <AttachmentsPanel
        target={base.target}
        canUpload={false}
        initialFiles={[]}
      />,
    );
    expect(markup).toContain("No attachments yet.");
    expect(markup).not.toContain("Upload attachment");
  });
});
