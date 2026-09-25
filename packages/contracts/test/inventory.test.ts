import { describe, expect, it } from "vitest";

import {
  CreateQrLabelRequestSchema,
  CreateMachineRequestSchema,
  MachineSchema,
  MachineDetailSchema,
  MachineSearchQuerySchema,
  QrLabelActivitySchema,
  QrLabelSchema,
  ResolveQrLabelRequestSchema,
  UpdateMachineIdentityRequestSchema,
} from "../src/index.js";

describe("inventory contracts", () => {
  it("accepts a minimal provisional machine and bounded search defaults", () => {
    expect(
      CreateMachineRequestSchema.parse({
        machineType: "washer",
        sourceLoadId: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
      }),
    ).toMatchObject({
      machineType: "washer",
      sourceKind: "manual",
      inventoryState: "expected",
    });
    expect(MachineSearchQuerySchema.parse({})).toEqual({
      query: "",
      page: 1,
      pageSize: 25,
    });
  });

  it("does not expose Location in Machine or Intake-facing contracts", () => {
    const created = CreateMachineRequestSchema.parse({
      machineType: "washer",
      sourceLoadId: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
      currentLocationId: "4498c172-93d8-4eca-b0f6-0e70fe03516c",
    });
    expect(created).not.toHaveProperty("currentLocationId");
    expect(MachineSchema.keyof().options).not.toContain("currentLocationId");
    expect(MachineDetailSchema.keyof().options).not.toContain(
      "locationHistory",
    );
  });

  it("rejects unknown controlled values and identity edits without changes", () => {
    expect(
      CreateMachineRequestSchema.safeParse({
        machineType: "washer_dryer",
        sourceLoadId: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
      }).success,
    ).toBe(false);
    expect(
      UpdateMachineIdentityRequestSchema.safeParse({ expectedVersion: 1 })
        .success,
    ).toBe(false);
    expect(
      MachineSchema.safeParse({
        id: "not-a-uuid",
        productionState: "testing",
      }).success,
    ).toBe(false);
  });

  it("validates privacy-safe QR label lifecycle and lookup contracts", () => {
    expect(CreateQrLabelRequestSchema.parse({})).toEqual({});
    expect(
      CreateQrLabelRequestSchema.safeParse({ machineId: "not-in-body" })
        .success,
    ).toBe(false);
    const activeLabel = {
      id: "4498c172-93d8-4eca-b0f6-0e70fe03516c",
      machineId: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
      fallbackCode: "0123456789ABCDEF",
      state: "active",
      version: 1,
      issuedByUserId: "user-1",
      revokedByUserId: null,
      issuedAt: new Date().toISOString(),
      revokedAt: null,
    };
    expect(QrLabelSchema.parse(activeLabel)).toMatchObject({
      state: "active",
      fallbackCode: "0123456789ABCDEF",
    });
    expect(
      QrLabelSchema.safeParse({
        ...activeLabel,
        state: "revoked",
      }).success,
    ).toBe(false);
    expect(
      QrLabelActivitySchema.parse({
        id: "5498c172-93d8-4eca-b0f6-0e70fe03516c",
        labelId: activeLabel.id,
        machineId: activeLabel.machineId,
        action: "resolved",
        actorUserId: "user-2",
        requestId: "request-1",
        createdAt: new Date().toISOString(),
      }),
    ).toMatchObject({ action: "resolved" });

    const token =
      "v1.4498c172-93d8-4eca-b0f6-0e70fe03516c.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
    expect(ResolveQrLabelRequestSchema.parse({ token })).toEqual({ token });
    expect(
      ResolveQrLabelRequestSchema.parse({
        fallbackCode: activeLabel.fallbackCode,
      }),
    ).toEqual({ fallbackCode: activeLabel.fallbackCode });
    expect(
      ResolveQrLabelRequestSchema.safeParse({
        token,
        fallbackCode: activeLabel.fallbackCode,
      }).success,
    ).toBe(false);
    expect(
      ResolveQrLabelRequestSchema.safeParse({
        fallbackCode: "O0I1-L2",
      }).success,
    ).toBe(false);
  });
});
