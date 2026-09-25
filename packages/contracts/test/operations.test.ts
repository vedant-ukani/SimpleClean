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
    for (const legacyAction of [
      "inventory.location.created",
      "inventory.location.updated",
      "inventory.location.deactivated",
      "inventory.machine.relocated",
    ]) {
      expect(OperationsActionSchema.parse(legacyAction)).toBe(legacyAction);
    }
    expect(OperationsTargetTypeSchema.parse("location")).toBe("location");
    expect(OperationsActionSchema.parse("inventory.machine.created")).toBe(
      "inventory.machine.created",
    );
    expect(OperationsActionSchema.parse("inventory.qr_label.reissued")).toBe(
      "inventory.qr_label.reissued",
    );
    expect(OperationsTargetTypeSchema.parse("qr_label")).toBe("qr_label");
    expect(OperationsActionSchema.parse("catalog.discovery.requested")).toBe(
      "catalog.discovery.requested",
    );
    expect(OperationsActionSchema.parse("catalog.discovery.completed")).toBe(
      "catalog.discovery.completed",
    );
    expect(OperationsTargetTypeSchema.parse("catalog_discovery_run")).toBe(
      "catalog_discovery_run",
    );
    expect(
      OperationsActionSchema.parse(
        "production.preliminary_inspection.recorded",
      ),
    ).toBe("production.preliminary_inspection.recorded");
    expect(
      OperationsActionSchema.parse("production.disposition.recorded"),
    ).toBe("production.disposition.recorded");
    expect(
      OperationsActionSchema.parse("inventory.machine.lifecycle_updated"),
    ).toBe("inventory.machine.lifecycle_updated");
    expect(OperationsTargetTypeSchema.parse("preliminary_disposition")).toBe(
      "preliminary_disposition",
    );
    for (const action of [
      "production.test_session.created",
      "production.test_session.item_state_changed",
      "production.test_session.finished",
      "production.test.bearing_concern_reported",
    ]) {
      expect(OperationsActionSchema.parse(action)).toBe(action);
    }
    expect(OperationsTargetTypeSchema.parse("production_test_session")).toBe(
      "production_test_session",
    );
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
