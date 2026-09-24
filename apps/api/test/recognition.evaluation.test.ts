import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  IntakeOcrResult,
  IntakeSemanticResult,
} from "@simply-clean/contracts";

import {
  calculateIntakeEvaluationMetrics,
  calculateIntakeOcrEvaluationMetrics,
  runIntakeRecognitionEvaluation,
} from "../src/modules/inventory/intake/recognition/evaluation.js";

const photoId = "00000000-0000-4000-8000-000000000001";
const box = { x: 0, y: 0, width: 0.5, height: 0.5 };

describe("intake recognition evaluation metrics", () => {
  it("scores OCR-only target fields without invoking semantic decisions", () => {
    const metrics = calculateIntakeOcrEvaluationMetrics([
      {
        id: "ocr-1",
        images: [
          {
            photoId,
            path: "fixture.heic",
            groupKey: "machine-1",
            fields: { manufacturer: "Maytag", serial: "ABC-123" },
          },
        ],
        ocr: {
          provider: "fake",
          model: "fixture",
          lines: [
            { photoId, text: "MAY-TAG", confidence: 0.9, box },
            { photoId, text: "MODEL DL2X300Q", confidence: 0.9, box },
            { photoId, text: "SERIAL ABC-123", confidence: 0.9, box },
            { photoId, text: "unreadable", confidence: 0.2, box },
          ],
        },
        latencyMs: 12,
      },
    ]);
    expect(metrics.requests).toBe(1);
    expect(metrics.images).toBe(1);
    expect(metrics.fields.manufacturer).toMatchObject({
      matched: 1,
      eligible: 1,
      rate: 1,
    });
    expect(metrics.fields.serial).toMatchObject({
      matched: 1,
      eligible: 1,
      unreadable: 0,
    });
    expect(metrics.exactFieldMatch).toEqual({
      matched: 2,
      eligible: 2,
      rate: 1,
    });
    expect(metrics.unreadableMissing).toEqual({ count: 0, rate: 0 });

    const containment = calculateIntakeOcrEvaluationMetrics([
      {
        id: "ocr-2",
        images: [
          {
            photoId,
            path: "fixture.heic",
            groupKey: "machine-1",
            fields: { model: "DL2X300Q", serial: "ABC-123" },
          },
        ],
        ocr: {
          provider: "fake",
          model: "fixture",
          lines: [
            { photoId, text: "MODEL DL2X300Q", confidence: 0.9, box },
            { photoId, text: "SERIAL ABC-123", confidence: 0.9, box },
          ],
        },
        latencyMs: 1,
      },
    ]);
    expect(containment.fields.model.matched).toBe(1);
    expect(containment.fields.serial.matched).toBe(1);
  });

  it("calculates exact fields, grouping purity, false accepts, recapture, and latency", () => {
    const metrics = calculateIntakeEvaluationMetrics([
      {
        id: "case-1",
        images: [
          {
            photoId,
            path: "fixture.jpg",
            groupKey: "machine-1",
            fields: { manufacturer: "Maytag", serial: null },
          },
        ],
        semantic: {
          provider: "fake",
          model: "fixture",
          schemaVersion: "intake-v1",
          requestId: null,
          groups: [],
        },
        ocr: { provider: "fake", model: "fixture", lines: [] },
        decisions: [
          {
            key: "machine-1",
            photoIds: [photoId],
            accepted: true,
            reasons: ["accepted"],
            fields: [
              {
                field: "manufacturer",
                value: "MAY-TAG",
                accepted: true,
                reason: "accepted",
                photoId,
                box,
                verifierAgreement: true,
              },
            ],
          },
        ],
        latencyMs: 10,
      },
      {
        id: "case-2",
        images: [
          {
            photoId: "00000000-0000-4000-8000-000000000002",
            path: "fixture-2.jpg",
            groupKey: "machine-2",
            fields: { manufacturer: "Speed Queen" },
          },
        ],
        semantic: {
          provider: "fake",
          model: "fixture",
          schemaVersion: "intake-v1",
          requestId: null,
          groups: [],
        },
        ocr: { provider: "fake", model: "fixture", lines: [] },
        decisions: [
          {
            key: "machine-2",
            photoIds: ["00000000-0000-4000-8000-000000000002"],
            accepted: false,
            reasons: ["ocr_disagreement"],
            fields: [
              {
                field: "manufacturer",
                value: "Unknown",
                accepted: false,
                reason: "ocr_disagreement",
                photoId: "00000000-0000-4000-8000-000000000002",
                box,
                verifierAgreement: false,
              },
            ],
          },
        ],
        latencyMs: 30,
      },
    ]);
    expect(metrics.exactFieldMatch).toEqual({
      matched: 1,
      eligible: 2,
      rate: 0.5,
    });
    expect(metrics.groupingPurity).toEqual({
      correctAssignments: 2,
      assignments: 2,
      rate: 1,
    });
    expect(metrics.falseAutoAccepts).toBe(0);
    expect(metrics.recaptureRate).toEqual({ cases: 1, rate: 0.5 });
    expect(metrics.latencyMs).toMatchObject({
      total: 40,
      average: 20,
      p95: 30,
    });
  });

  it("counts a mismatched accepted group as a false auto-accept", () => {
    const metrics = calculateIntakeEvaluationMetrics([
      {
        id: "case-1",
        images: [
          { photoId, path: "fixture.jpg", groupKey: "machine-1", fields: {} },
        ],
        semantic: {
          provider: "fake",
          model: "fixture",
          schemaVersion: "intake-v1",
          requestId: null,
          groups: [],
        },
        ocr: { provider: "fake", model: "fixture", lines: [] },
        decisions: [
          {
            key: "wrong",
            photoIds: ["00000000-0000-4000-8000-000000000099"],
            accepted: true,
            reasons: ["accepted"],
            fields: [],
          },
        ],
        latencyMs: 1,
      },
    ]);
    expect(metrics.falseAutoAccepts).toBe(1);
  });

  it("runs OCR before semantic assignment and forwards its evidence", async () => {
    const manifestDirectory = await mkdtemp(
      join(tmpdir(), "simply-clean-recognition-evaluation-"),
    );
    const manifestPath = join(manifestDirectory, "manifest.json");
    const imagePath = fileURLToPath(
      new URL(
        "../../../assets/presentation/intake-qr-warehouse.png",
        import.meta.url,
      ),
    );
    const evaluationPhotoId = "00000000-0000-4000-8000-000000000002";
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        cases: [
          {
            id: "order-1",
            images: [
              {
                photoId: evaluationPhotoId,
                path: imagePath,
                groupKey: "machine-1",
                fields: {},
              },
            ],
          },
        ],
      }),
      "utf8",
    );

    const order: string[] = [];
    const ocr: IntakeOcrResult = {
      provider: "google-vision",
      model: "fixture",
      lines: [
        {
          photoId: evaluationPhotoId,
          text: "MODEL TEST-123",
          confidence: 0.99,
          box,
        },
      ],
    };
    const semantic: IntakeSemanticResult = {
      provider: "fake",
      model: "fixture",
      schemaVersion: "intake-nameplate-v2",
      requestId: null,
      groups: [
        {
          key: "machine-1",
          photoIds: [evaluationPhotoId],
          confidence: 1,
          fields: [],
          quality: [],
        },
      ],
    };

    try {
      await runIntakeRecognitionEvaluation({
        manifestPath,
        settings: {
          semanticProvider: "fake",
          semanticModel: "fixture",
          verifierProvider: "fake",
          verifierModel: "fixture",
          timeoutMs: 1_000,
          maxImageBytes: 8 * 1024 * 1024,
          maxBatchBytes: 40 * 1024 * 1024,
          maxPixels: 20_000_000,
          maxOutputBytes: 2 * 1024 * 1024,
          policyVersion: "intake-nameplate-policy-v2",
        },
        adapters: {
          ocr: {
            verify: async () => {
              order.push("ocr");
              return ocr;
            },
          },
          semantic: {
            recognize: async (_images, evidence) => {
              order.push("semantic");
              expect(evidence).toBe(ocr);
              return semantic;
            },
          },
        },
      });
    } finally {
      await rm(manifestDirectory, { recursive: true, force: true });
    }

    expect(order).toEqual(["ocr", "semantic"]);
  });
});
