import { describe, expect, it } from "vitest";

import {
  AuditEntrySchema,
  AuditListQuerySchema,
  OperationsActionSchema,
  OperationsTargetTypeSchema,
  OutboxJobSchema,
  SafeMutationSummarySchema,
} from "../src/index.js";

describe("operations contracts", () => {
  it("accepts stable actions and privacy-safe summaries", () => {
    expect(OperationsActionSchema.parse("inventory.machine.created")).toBe(
      "inventory.machine.created",
    );
    expect(OperationsActionSchema.parse("inventory.qr_label.reissued")).toBe(
      "inventory.qr_label.reissued",
    );
    expect(OperationsTargetTypeSchema.parse("qr_label")).toBe("qr_label");
    expect(
      SafeMutationSummarySchema.parse({
        changedFields: ["identity_verification_state"],
        outcome: "completed",
      }),
    ).toEqual({
      changedFields: ["identity_verification_state"],
      outcome: "completed",
    });
    expect(() =>
      SafeMutationSummarySchema.parse({
        changedFields: ["serial value"],
        email: "private@example.test",
      }),
    ).toThrow();
  });

  it("validates audit and durable job states", () => {
    const timestamp = new Date().toISOString();
    expect(
      AuditEntrySchema.parse({
        id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
        actorKind: "user",
        actorUserId: "user-1",
        action: "inventory.load.created",
        targetType: "load",
        targetId: "load-1",
        requestId: "request-1",
        summary: { changedFields: ["display_name"], outcome: "completed" },
        createdAt: timestamp,
      }),
    ).toMatchObject({ action: "inventory.load.created" });
    expect(() =>
      OutboxJobSchema.parse({
        id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
        eventType: "inventory.load.created",
        targetType: "load",
        targetId: "load-1",
        state: "lost",
        attemptCount: 0,
        availableAt: timestamp,
        leaseExpiresAt: null,
        errorCode: null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).toThrow();
  });

  it("requires target type for an exact target audit filter", () => {
    expect(
      AuditListQuerySchema.parse({ targetType: "machine", targetId: "m-1" }),
    ).toMatchObject({ targetType: "machine", targetId: "m-1" });
    expect(() => AuditListQuerySchema.parse({ targetId: "m-1" })).toThrow();
  });
});
