import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OperationsReview } from "../src/app/(protected)/admin/operations/operations-review";
import { OperationsFilters } from "../src/app/(protected)/admin/operations/operations-filters";
import { canReviewOperations } from "../src/lib/navigation";

describe("Operations review UI", () => {
  it("offers an exact target filter paired with target type", () => {
    const markup = renderToStaticMarkup(
      <OperationsFilters targetType="machine" targetId="machine-42" />,
    );
    expect(markup).toContain('name="targetType"');
    expect(markup).toContain('name="targetId"');
    expect(markup).toContain('value="machine-42"');
  });

  it("is Owner-only and exposes safe failed-work retry", () => {
    expect(canReviewOperations("owner_admin")).toBe(true);
    expect(canReviewOperations("warehouse")).toBe(false);
    const timestamp = new Date().toISOString();
    const markup = renderToStaticMarkup(
      <OperationsReview
        initialAudit={[
          {
            id: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
            actorKind: "user",
            actorUserId: "user-1",
            action: "inventory.load.created",
            targetType: "load",
            targetId: "load-1",
            requestId: "request-1",
            summary: { changedFields: ["display_name"], outcome: "completed" },
            createdAt: timestamp,
          },
          {
            id: "6698c172-93d8-4eca-b0f6-0e70fe03516c",
            actorKind: "system",
            actorUserId: null,
            action: "identity.user.provisioned",
            targetType: "user",
            targetId: "user-2",
            requestId: "provision-request-2",
            summary: { changedFields: ["profile"], outcome: "completed" },
            createdAt: timestamp,
          },
        ]}
        initialJobs={[
          {
            id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
            eventType: "inventory.load.created",
            targetType: "load",
            targetId: "load-1",
            state: "dead_letter",
            attemptCount: 5,
            availableAt: timestamp,
            leaseExpiresAt: null,
            errorCode: "handler_failed",
            version: 7,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ]}
      />,
    );
    expect(markup).toContain("Recent audit history");
    expect(markup).toContain("User user-1");
    expect(markup).toContain("System");
    expect(markup).toContain("Request request-1");
    expect(markup).toContain("load · load-1");
    expect(markup).toContain("handler_failed");
    expect(markup).toContain("Retry");
  });
});
