import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IncompleteFilesReview } from "../src/app/(protected)/admin/files/incomplete-files-review";
import { canManageFiles } from "../src/lib/navigation";

describe("incomplete file review UI", () => {
  it("is Owner Admin-only and renders cleanup controls", () => {
    expect(canManageFiles("owner_admin")).toBe(true);
    expect(canManageFiles("warehouse")).toBe(false);
    const timestamp = new Date().toISOString();
    const markup = renderToStaticMarkup(
      <IncompleteFilesReview
        initialFiles={[
          {
            id: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
            target: {
              type: "machine",
              id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
            },
            purpose: "nameplate",
            originalFilename: "failed.jpg",
            declaredMediaType: "image/jpeg",
            detectedMediaType: null,
            declaredByteCount: 4,
            byteCount: null,
            sha256: null,
            uploaderUserId: "user-1",
            state: "failed",
            failureCode: "unsupported_content",
            version: 2,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ]}
      />,
    );
    expect(markup).toContain("Pending and failed");
    expect(markup).toContain("Abandon and clean up");
    expect(markup).toContain("unsupported_content");
  });
});
