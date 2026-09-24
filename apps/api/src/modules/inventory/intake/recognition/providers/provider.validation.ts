import {
  IntakeOcrResultSchema,
  IntakeSemanticResultSchema,
} from "@simply-clean/contracts";
import type {
  IntakeOcrResult,
  IntakeSemanticResult,
} from "@simply-clean/contracts";
import type { ZodType } from "zod";

import { RecognitionProviderError } from "./provider.errors.js";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RecognitionProviderError(
      "invalid_response",
      "Recognition provider returned an invalid result",
    );
  }
  return value as RecordValue;
}

function only(value: unknown, keys: readonly string[]): RecordValue {
  const output = record(value);
  const allowed = new Set(keys);
  for (const key of Object.keys(output)) {
    if (!allowed.has(key)) {
      throw new RecognitionProviderError(
        "invalid_response",
        "Recognition provider returned an unsupported result",
      );
    }
  }
  return output;
}

function strictSemanticShape(value: unknown): void {
  const top = only(value, [
    "provider",
    "model",
    "schemaVersion",
    "requestId",
    "groups",
  ]);
  if (top.groups !== undefined) {
    if (!Array.isArray(top.groups))
      throw new RecognitionProviderError(
        "invalid_response",
        "Invalid recognition groups",
      );
    for (const group of top.groups) {
      const g = only(group, [
        "key",
        "photoIds",
        "confidence",
        "fields",
        "quality",
      ]);
      if (g.fields !== undefined) {
        if (!Array.isArray(g.fields))
          throw new RecognitionProviderError(
            "invalid_response",
            "Invalid recognition fields",
          );
        for (const field of g.fields) {
          only(field, [
            "field",
            "value",
            "confidence",
            "photoId",
            "box",
            "ocrLineIds",
          ]);
          const box = (field as RecordValue).box;
          only(box, ["x", "y", "width", "height"]);
          const lineIds = (field as RecordValue).ocrLineIds;
          if (lineIds !== undefined && !Array.isArray(lineIds))
            throw new RecognitionProviderError(
              "invalid_response",
              "Invalid OCR evidence references",
            );
        }
      }
      if (g.quality !== undefined) {
        if (!Array.isArray(g.quality))
          throw new RecognitionProviderError(
            "invalid_response",
            "Invalid recognition quality",
          );
        for (const finding of g.quality) only(finding, ["photoId", "reason"]);
      }
    }
  }
}

function strictOcrShape(value: unknown): void {
  const top = only(value, ["provider", "model", "lines"]);
  if (top.lines !== undefined) {
    if (!Array.isArray(top.lines))
      throw new RecognitionProviderError(
        "invalid_response",
        "Invalid OCR lines",
      );
    for (const line of top.lines) {
      const item = only(line, [
        "lineId",
        "photoId",
        "text",
        "confidence",
        "box",
      ]);
      only(item.box, ["x", "y", "width", "height"]);
    }
  }
}

function parse<T>(schema: ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new RecognitionProviderError("invalid_response", message);
  return result.data;
}

export function validateSemanticResult(
  value: unknown,
  identity: {
    provider: string;
    model: string;
    requestId?: string | null;
    schemaVersion?: "intake-v1" | "intake-nameplate-v2";
  },
): IntakeSemanticResult {
  const candidate = record(value);
  strictSemanticShape(candidate);
  const wrapped = {
    provider: identity.provider,
    model: identity.model,
    schemaVersion: identity.schemaVersion ?? ("intake-v1" as const),
    requestId: identity.requestId ?? null,
    groups: candidate.groups,
  };
  return parse(
    IntakeSemanticResultSchema,
    wrapped,
    "Recognition provider returned an invalid semantic result",
  );
}

export function validateOcrResult(
  value: unknown,
  identity: { provider: string; model: string },
): IntakeOcrResult {
  const candidate = record(value);
  strictOcrShape(candidate);
  return parse(
    IntakeOcrResultSchema,
    {
      provider: identity.provider,
      model: identity.model,
      lines: candidate.lines,
    },
    "OCR verifier returned an invalid result",
  );
}
