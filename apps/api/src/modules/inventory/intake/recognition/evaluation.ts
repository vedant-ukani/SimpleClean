import {
  type IntakeGroupDecision,
  type IntakeOcrResult,
  type IntakeSemanticResult,
} from "@laundrorama/contracts";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

import {
  createIntakeAnalysisImage,
  detectMediaType,
} from "../../../files/content-policy.js";
import {
  DeterministicIntakeConfidencePolicy,
  hasIndependentOcrAgreement,
} from "../recognition.policy.js";
import type {
  IntakeAnalysisImage,
  IntakeOcrVerifier,
  IntakeSemanticRecognizer,
} from "../recognition.ports.js";
import { GeminiSemanticRecognizer } from "./providers/gemini.semantic.adapter.js";
import { OpenAISemanticRecognizer } from "./providers/openai.semantic.adapter.js";
import { PaddleOcrVerifier } from "./providers/paddleocr.verifier.adapter.js";
import { GoogleVisionOcrVerifier } from "./providers/google-vision.verifier.adapter.js";
import {
  DeterministicFakeOcrVerifier,
  DeterministicFakeSemanticRecognizer,
} from "./providers/fake.adapters.js";
import { RecognitionProviderError } from "./providers/provider.errors.js";

const fieldNames = [
  "machineType",
  "manufacturer",
  "model",
  "serial",
  "voltage",
  "phase",
  "fuel",
] as const;
const fieldsSchema = z
  .object(
    Object.fromEntries(
      fieldNames.map((field) => [field, z.string().nullable().optional()]),
    ) as Record<
      (typeof fieldNames)[number],
      z.ZodOptional<z.ZodNullable<z.ZodString>>
    >,
  )
  .strict()
  .default({});

export const IntakeEvaluationManifestSchema = z
  .object({
    version: z.literal(1),
    cases: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(120),
            images: z
              .array(
                z
                  .object({
                    photoId: z.uuid(),
                    path: z.string().trim().min(1).max(1_000),
                    groupKey: z.string().trim().min(1).max(80),
                    fields: fieldsSchema,
                  })
                  .strict(),
              )
              .min(1)
              .max(100),
            cost: z
              .object({
                currency: z.string().trim().min(3).max(8),
                usd: z.number().nonnegative().optional(),
                inputTokens: z.number().int().nonnegative().optional(),
                outputTokens: z.number().int().nonnegative().optional(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(1_000),
  })
  .strict();

export type IntakeEvaluationManifest = z.infer<
  typeof IntakeEvaluationManifestSchema
>;

/** OCR-only benchmarks intentionally use the same bounded manifest shape. */
export const IntakeOcrEvaluationManifestSchema = IntakeEvaluationManifestSchema;
export type IntakeOcrEvaluationManifest = IntakeEvaluationManifest;

export interface IntakeEvaluationSettings {
  semanticProvider: "fake" | "openai" | "gemini" | "disabled";
  semanticModel: string;
  semanticEndpoint?: string;
  semanticApiKey?: string;
  verifierProvider: "fake" | "paddleocr" | "google-vision" | "disabled";
  verifierModel: string;
  verifierEndpoint?: string;
  verifierApiKey?: string;
  timeoutMs: number;
  maxImageBytes: number;
  maxBatchBytes: number;
  maxPixels: number;
  maxOutputBytes: number;
  policyVersion: string;
  groupFloor?: number;
  fieldFloor?: number;
  ocrFloor?: number;
}

export interface IntakeEvaluationCost {
  currency: string;
  usd?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface IntakeEvaluationCaseObservation {
  id: string;
  images: IntakeEvaluationManifest["cases"][number]["images"];
  semantic: IntakeSemanticResult;
  ocr: IntakeOcrResult;
  decisions: IntakeGroupDecision[];
  latencyMs: number;
  cost?: IntakeEvaluationCost;
}

export interface IntakeEvaluationMetrics {
  cases: number;
  images: number;
  exactFieldMatch: { matched: number; eligible: number; rate: number | null };
  falseAutoAccepts: number;
  groupingPurity: {
    correctAssignments: number;
    assignments: number;
    rate: number | null;
  };
  recaptureRate: { cases: number; rate: number | null };
  latencyMs: { total: number; average: number | null; p95: number | null };
  cost?: IntakeEvaluationCost;
}

export interface IntakeEvaluationReport {
  manifestVersion: 1;
  generatedAt: string;
  semanticProvider: string;
  semanticModel: string;
  verifierProvider: string;
  verifierModel: string;
  policyVersion: string;
  metrics: IntakeEvaluationMetrics;
}

export interface IntakeOcrFieldMetrics {
  matched: number;
  eligible: number;
  missing: number;
  unreadable: number;
  rate: number | null;
}

export interface IntakeOcrEvaluationObservation {
  id: string;
  images: IntakeEvaluationManifest["cases"][number]["images"];
  ocr: IntakeOcrResult;
  latencyMs: number;
  cost?: IntakeEvaluationCost;
}

export interface IntakeOcrEvaluationMetrics {
  cases: number;
  images: number;
  requests: number;
  imageCount: number;
  requestCount: number;
  fields: Record<(typeof fieldNames)[number], IntakeOcrFieldMetrics>;
  exactFieldMatch: { matched: number; eligible: number; rate: number | null };
  overallExactMatch: {
    matched: number;
    eligible: number;
    rate: number | null;
  };
  unreadableMissing: { count: number; rate: number | null };
  unreadableRate: number | null;
  latencyMs: { total: number; average: number | null; p95: number | null };
  cost?: IntakeEvaluationCost;
}

export interface IntakeOcrEvaluationReport {
  manifestVersion: 1;
  generatedAt: string;
  verifierProvider: string;
  verifierModel: string;
  metrics: IntakeOcrEvaluationMetrics;
}

function normalized(value: string | null | undefined): string | null {
  if (!value) return null;
  const result = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return result || null;
}

function expectedGroups(
  images: IntakeEvaluationCaseObservation["images"],
): Map<string, typeof images> {
  const groups = new Map<string, typeof images>();
  for (const image of images)
    groups.set(image.groupKey, [...(groups.get(image.groupKey) ?? []), image]);
  return groups;
}

function exactPhotoSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((photoId) => right.includes(photoId))
  );
}

export function calculateIntakeEvaluationMetrics(
  observations: readonly IntakeEvaluationCaseObservation[],
): IntakeEvaluationMetrics {
  let imageCount = 0;
  let matchedFields = 0;
  let eligibleFields = 0;
  let falseAutoAccepts = 0;
  let recaptureCases = 0;
  let assignments = 0;
  let correctAssignments = 0;
  const latencies = observations
    .map((observation) => observation.latencyMs)
    .sort((a, b) => a - b);
  let cost: IntakeEvaluationCost | undefined;

  for (const observation of observations) {
    imageCount += observation.images.length;
    const expected = expectedGroups(observation.images);
    const expectedByPhoto = new Map(
      observation.images.map((image) => [image.photoId, image]),
    );
    if (observation.decisions.some((decision) => !decision.accepted))
      recaptureCases += 1;

    for (const decision of observation.decisions) {
      const counts = new Map<string, number>();
      for (const photoId of decision.photoIds) {
        const groupKey = expectedByPhoto.get(photoId)?.groupKey;
        if (groupKey) counts.set(groupKey, (counts.get(groupKey) ?? 0) + 1);
      }
      const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      assignments += decision.photoIds.length;
      correctAssignments += majority?.[1] ?? 0;

      const expectedGroup = majority ? expected.get(majority[0]) : undefined;
      const expectedFields = new Map<string, string | null>();
      for (const image of expectedGroup ?? []) {
        for (const field of fieldNames) {
          const value = image.fields[field];
          if (
            value !== undefined &&
            (!expectedFields.has(field) || expectedFields.get(field) === null)
          )
            expectedFields.set(field, value);
        }
      }
      for (const [field, expectedValue] of expectedFields) {
        if (expectedValue === null) continue;
        eligibleFields += 1;
        const actual =
          decision.fields.find(
            (candidate) => candidate.field === field && candidate.accepted,
          )?.value ?? null;
        if (normalized(actual) === normalized(expectedValue))
          matchedFields += 1;
      }

      if (
        decision.accepted &&
        (!expectedGroup ||
          !exactPhotoSet(
            decision.photoIds,
            expectedGroup.map((image) => image.photoId),
          ))
      ) {
        falseAutoAccepts += 1;
      } else if (decision.accepted) {
        const hasWrongAcceptedField = decision.fields.some((field) => {
          const expectedValue = expectedFields.get(field.field);
          return (
            field.accepted &&
            expectedValue !== undefined &&
            normalized(field.value) !== normalized(expectedValue)
          );
        });
        if (hasWrongAcceptedField) falseAutoAccepts += 1;
      }
    }
    if (observation.cost) {
      cost ??= { currency: observation.cost.currency };
      if (cost.currency !== observation.cost.currency) cost.currency = "mixed";
      if (observation.cost.usd !== undefined)
        cost.usd = (cost.usd ?? 0) + observation.cost.usd;
      if (observation.cost.inputTokens !== undefined)
        cost.inputTokens =
          (cost.inputTokens ?? 0) + observation.cost.inputTokens;
      if (observation.cost.outputTokens !== undefined)
        cost.outputTokens =
          (cost.outputTokens ?? 0) + observation.cost.outputTokens;
    }
  }

  const percentile95 = latencies.length
    ? (latencies[
        Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)
      ] ?? null)
    : null;
  return {
    cases: observations.length,
    images: imageCount,
    exactFieldMatch: {
      matched: matchedFields,
      eligible: eligibleFields,
      rate: eligibleFields ? matchedFields / eligibleFields : null,
    },
    falseAutoAccepts,
    groupingPurity: {
      correctAssignments,
      assignments,
      rate: assignments ? correctAssignments / assignments : null,
    },
    recaptureRate: {
      cases: recaptureCases,
      rate: observations.length ? recaptureCases / observations.length : null,
    },
    latencyMs: {
      total: latencies.reduce((total, latency) => total + latency, 0),
      average: observations.length
        ? latencies.reduce((total, latency) => total + latency, 0) /
          observations.length
        : null,
      p95: percentile95,
    },
    ...(cost ? { cost } : {}),
  };
}

function emptyOcrFieldMetrics(): IntakeOcrFieldMetrics {
  return { matched: 0, eligible: 0, missing: 0, unreadable: 0, rate: null };
}

function mergeEvaluationCost(
  current: IntakeEvaluationCost | undefined,
  next: IntakeEvaluationCost | undefined,
): IntakeEvaluationCost | undefined {
  if (!next) return current;
  const output = current ?? { currency: next.currency };
  if (output.currency !== next.currency) output.currency = "mixed";
  if (next.usd !== undefined) output.usd = (output.usd ?? 0) + next.usd;
  if (next.inputTokens !== undefined)
    output.inputTokens = (output.inputTokens ?? 0) + next.inputTokens;
  if (next.outputTokens !== undefined)
    output.outputTokens = (output.outputTokens ?? 0) + next.outputTokens;
  return output;
}

export function calculateIntakeOcrEvaluationMetrics(
  observations: readonly IntakeOcrEvaluationObservation[],
): IntakeOcrEvaluationMetrics {
  const fields = Object.fromEntries(
    fieldNames.map((field) => [field, emptyOcrFieldMetrics()]),
  ) as Record<(typeof fieldNames)[number], IntakeOcrFieldMetrics>;
  const latencies = observations
    .map((observation) => observation.latencyMs)
    .sort((a, b) => a - b);
  let matched = 0;
  let eligible = 0;
  let unreadableMissing = 0;
  let overallMatched = 0;
  let overallEligible = 0;
  let cost: IntakeEvaluationCost | undefined;

  for (const observation of observations) {
    const linesByPhoto = new Map<string, string[]>();
    for (const line of observation.ocr.lines) {
      linesByPhoto.set(line.photoId, [
        ...(linesByPhoto.get(line.photoId) ?? []),
        line.text,
      ]);
    }
    for (const image of observation.images) {
      let imageEligible = 0;
      let imageMatched = 0;
      const texts = linesByPhoto.get(image.photoId) ?? [];
      for (const field of fieldNames) {
        const expected = image.fields[field];
        if (expected === undefined || expected === null) continue;
        const metric = fields[field];
        metric.eligible += 1;
        eligible += 1;
        imageEligible += 1;
        const actual = hasIndependentOcrAgreement(
          field,
          expected,
          image.photoId,
          observation.ocr,
          0,
        );
        if (actual) {
          metric.matched += 1;
          matched += 1;
          imageMatched += 1;
        } else if (texts.length === 0) {
          metric.missing += 1;
          unreadableMissing += 1;
        } else {
          metric.unreadable += 1;
          unreadableMissing += 1;
        }
      }
      if (imageEligible > 0) {
        overallEligible += 1;
        if (imageMatched === imageEligible) overallMatched += 1;
      }
    }
    cost = mergeEvaluationCost(cost, observation.cost);
  }

  for (const field of fieldNames) {
    const metric = fields[field];
    metric.rate = metric.eligible ? metric.matched / metric.eligible : null;
  }
  const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
  const p95 = latencies.length
    ? (latencies[
        Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)
      ] ?? null)
    : null;
  return {
    cases: observations.length,
    images: observations.reduce(
      (count, observation) => count + observation.images.length,
      0,
    ),
    requests: observations.length,
    imageCount: observations.reduce(
      (count, observation) => count + observation.images.length,
      0,
    ),
    requestCount: observations.length,
    fields,
    exactFieldMatch: {
      matched,
      eligible,
      rate: eligible ? matched / eligible : null,
    },
    overallExactMatch: {
      matched: overallMatched,
      eligible: overallEligible,
      rate: overallEligible ? overallMatched / overallEligible : null,
    },
    unreadableMissing: {
      count: unreadableMissing,
      rate: eligible ? unreadableMissing / eligible : null,
    },
    unreadableRate: eligible ? unreadableMissing / eligible : null,
    latencyMs: {
      total: totalLatency,
      average: observations.length ? totalLatency / observations.length : null,
      p95,
    },
    ...(cost ? { cost } : {}),
  };
}

export function settingsFromEnvironment(
  environment: Record<string, string | undefined>,
): IntakeEvaluationSettings {
  const number = (name: string, fallback: number): number => {
    const value = environment[name];
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1)
      throw new Error(`Invalid ${name}`);
    return parsed;
  };
  const optionalFloor = (name: string): number | undefined => {
    const value = environment[name];
    if (value === undefined || value === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1)
      throw new Error(`Invalid ${name}`);
    return parsed;
  };
  const groupFloor = optionalFloor("INTAKE_RECOGNITION_GROUP_FLOOR");
  const fieldFloor = optionalFloor("INTAKE_RECOGNITION_FIELD_FLOOR");
  const ocrFloor = optionalFloor("INTAKE_RECOGNITION_OCR_FLOOR");
  return {
    semanticProvider: (environment.INTAKE_RECOGNITION_SEMANTIC_PROVIDER ??
      "fake") as IntakeEvaluationSettings["semanticProvider"],
    semanticModel:
      environment.INTAKE_RECOGNITION_SEMANTIC_MODEL ?? "gpt-6-luna",
    ...(environment.INTAKE_RECOGNITION_SEMANTIC_ENDPOINT
      ? { semanticEndpoint: environment.INTAKE_RECOGNITION_SEMANTIC_ENDPOINT }
      : {}),
    ...(environment.INTAKE_RECOGNITION_SEMANTIC_API_KEY
      ? { semanticApiKey: environment.INTAKE_RECOGNITION_SEMANTIC_API_KEY }
      : {}),
    verifierProvider: (environment.INTAKE_RECOGNITION_VERIFIER_PROVIDER ??
      "fake") as IntakeEvaluationSettings["verifierProvider"],
    verifierModel: environment.INTAKE_RECOGNITION_VERIFIER_MODEL ?? "paddleocr",
    ...(environment.INTAKE_RECOGNITION_VERIFIER_ENDPOINT
      ? { verifierEndpoint: environment.INTAKE_RECOGNITION_VERIFIER_ENDPOINT }
      : {}),
    ...(environment.INTAKE_RECOGNITION_VERIFIER_API_KEY
      ? { verifierApiKey: environment.INTAKE_RECOGNITION_VERIFIER_API_KEY }
      : {}),
    timeoutMs: number("INTAKE_RECOGNITION_TIMEOUT_MS", 60_000),
    maxImageBytes: number(
      "INTAKE_RECOGNITION_MAX_IMAGE_BYTES",
      8 * 1024 * 1024,
    ),
    maxBatchBytes: number(
      "INTAKE_RECOGNITION_MAX_BATCH_BYTES",
      40 * 1024 * 1024,
    ),
    maxPixels: number("INTAKE_RECOGNITION_MAX_PIXELS", 20_000_000),
    maxOutputBytes: number(
      "INTAKE_RECOGNITION_MAX_OUTPUT_BYTES",
      2 * 1024 * 1024,
    ),
    policyVersion:
      environment.INTAKE_RECOGNITION_POLICY_VERSION ??
      "intake-nameplate-policy-v3",
    ...(groupFloor === undefined ? {} : { groupFloor }),
    ...(fieldFloor === undefined ? {} : { fieldFloor }),
    ...(ocrFloor === undefined ? {} : { ocrFloor }),
  };
}

function createAdapters(
  settings: IntakeEvaluationSettings,
  allowLive: boolean,
): { semantic: IntakeSemanticRecognizer; ocr: IntakeOcrVerifier } {
  const limits = {
    timeoutMs: settings.timeoutMs,
    maxImageBytes: settings.maxImageBytes,
    maxTotalImageBytes: settings.maxBatchBytes,
    maxImagePixels: settings.maxPixels,
    maxResponseBytes: settings.maxOutputBytes,
  };
  if (
    !allowLive &&
    (settings.semanticProvider === "openai" ||
      settings.semanticProvider === "gemini" ||
      settings.verifierProvider === "paddleocr" ||
      settings.verifierProvider === "google-vision")
  ) {
    throw new Error("Live providers require --allow-live");
  }
  const semantic =
    settings.semanticProvider === "openai"
      ? new OpenAISemanticRecognizer({
          ...limits,
          model: settings.semanticModel,
          ...(settings.semanticEndpoint
            ? { endpoint: settings.semanticEndpoint }
            : {}),
          apiKey: settings.semanticApiKey ?? "",
        })
      : settings.semanticProvider === "gemini"
        ? new GeminiSemanticRecognizer({
            ...limits,
            model: settings.semanticModel,
            ...(settings.semanticEndpoint
              ? { endpoint: settings.semanticEndpoint }
              : {}),
            apiKey: settings.semanticApiKey ?? "",
          })
        : settings.semanticProvider === "fake"
          ? new DeterministicFakeSemanticRecognizer(limits)
          : null;
  const ocr =
    settings.verifierProvider === "paddleocr"
      ? new PaddleOcrVerifier({
          ...limits,
          model: settings.verifierModel,
          ...(settings.verifierEndpoint
            ? { endpoint: settings.verifierEndpoint }
            : {}),
          ...(settings.verifierApiKey
            ? { apiKey: settings.verifierApiKey }
            : {}),
        })
      : settings.verifierProvider === "google-vision"
        ? new GoogleVisionOcrVerifier({
            ...limits,
            model: settings.verifierModel,
            ...(settings.verifierEndpoint
              ? { endpoint: settings.verifierEndpoint }
              : {}),
            ...(settings.verifierApiKey
              ? { apiKey: settings.verifierApiKey }
              : {}),
          })
        : settings.verifierProvider === "fake"
          ? new DeterministicFakeOcrVerifier(limits)
          : null;
  if (!semantic || !ocr)
    throw new Error(
      "Recognition evaluation requires enabled semantic and verifier providers",
    );
  return { semantic, ocr };
}

export async function readAnalysisImage(
  manifestDirectory: string,
  entry: IntakeEvaluationManifest["cases"][number]["images"][number],
  settings: IntakeEvaluationSettings,
): Promise<IntakeAnalysisImage> {
  const filePath = resolve(manifestDirectory, entry.path);
  const source = await stat(filePath);
  if (!source.isFile() || source.size > settings.maxImageBytes)
    throw new Error("image exceeds configured evaluation limit");
  const sourceBytes = await readFile(filePath);
  const checksum = createHash("sha256").update(sourceBytes).digest("hex");
  const mediaType = detectMediaType(sourceBytes);
  const converted = await createIntakeAnalysisImage(
    sourceBytes,
    mediaType ?? null,
    {
      maxImageBytes: settings.maxImageBytes,
      maxBatchBytes: settings.maxBatchBytes,
      maxPixels: settings.maxPixels,
      allowDownscaleToPixelLimit: true,
    },
  );
  return {
    photoId: entry.photoId,
    sourceChecksum: checksum,
    bytes: converted.bytes,
    mediaType: "image/jpeg",
    width: converted.width,
    height: converted.height,
  };
}

export async function loadIntakeEvaluationManifest(
  path: string,
): Promise<IntakeEvaluationManifest> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  const result = IntakeEvaluationManifestSchema.safeParse(raw);
  if (!result.success)
    throw new Error("Invalid intake recognition evaluation manifest");
  return result.data;
}

export async function runIntakeRecognitionEvaluation(options: {
  manifestPath: string;
  settings: IntakeEvaluationSettings;
  allowLive?: boolean;
  /** Test seam for deterministic evaluation-order coverage. */
  adapters?: { semantic: IntakeSemanticRecognizer; ocr: IntakeOcrVerifier };
}): Promise<IntakeEvaluationReport> {
  const manifest = await loadIntakeEvaluationManifest(options.manifestPath);
  const adapters =
    options.adapters ??
    createAdapters(options.settings, options.allowLive ?? false);
  const manifestDirectory = resolve(options.manifestPath, "..");
  const policy = new DeterministicIntakeConfidencePolicy();
  const observations: IntakeEvaluationCaseObservation[] = [];
  for (const testCase of manifest.cases) {
    const images = [];
    let totalBytes = 0;
    for (const entry of testCase.images) {
      const image = await readAnalysisImage(
        manifestDirectory,
        entry,
        options.settings,
      );
      totalBytes += image.bytes.byteLength;
      if (totalBytes > options.settings.maxBatchBytes)
        throw new Error("case exceeds configured batch limit");
      images.push(image);
    }
    const startedAt = performance.now();
    const ocr = await adapters.ocr.verify(images);
    const semantic = await adapters.semantic.recognize(images, ocr);
    const policyConfig = {
      version: options.settings.policyVersion,
      ...(options.settings.groupFloor === undefined
        ? {}
        : { groupFloor: options.settings.groupFloor }),
      ...(options.settings.fieldFloor === undefined
        ? {}
        : { fieldFloor: options.settings.fieldFloor }),
      ...(options.settings.ocrFloor === undefined
        ? {}
        : { ocrFloor: options.settings.ocrFloor }),
    };
    const decisions = policy.evaluate({
      images,
      semantic,
      ocr,
      config: policyConfig,
    });
    const cost: IntakeEvaluationCost | undefined = testCase.cost
      ? {
          currency: testCase.cost.currency,
          ...(testCase.cost.usd === undefined
            ? {}
            : { usd: testCase.cost.usd }),
          ...(testCase.cost.inputTokens === undefined
            ? {}
            : { inputTokens: testCase.cost.inputTokens }),
          ...(testCase.cost.outputTokens === undefined
            ? {}
            : { outputTokens: testCase.cost.outputTokens }),
        }
      : undefined;
    observations.push({
      id: testCase.id,
      images: testCase.images,
      semantic,
      ocr,
      decisions,
      latencyMs: performance.now() - startedAt,
      ...(cost ? { cost } : {}),
    });
  }
  return {
    manifestVersion: manifest.version,
    generatedAt: new Date().toISOString(),
    semanticProvider: options.settings.semanticProvider,
    semanticModel: options.settings.semanticModel,
    verifierProvider: options.settings.verifierProvider,
    verifierModel: options.settings.verifierModel,
    policyVersion: options.settings.policyVersion,
    metrics: calculateIntakeEvaluationMetrics(observations),
  };
}

function createOcrAdapter(
  settings: IntakeEvaluationSettings,
  allowLive: boolean,
): IntakeOcrVerifier {
  if (
    !allowLive &&
    (settings.verifierProvider === "paddleocr" ||
      settings.verifierProvider === "google-vision")
  ) {
    throw new Error("Live providers require --allow-live");
  }
  const limits = {
    timeoutMs: settings.timeoutMs,
    maxImageBytes: settings.maxImageBytes,
    maxTotalImageBytes: settings.maxBatchBytes,
    maxImagePixels: settings.maxPixels,
    maxResponseBytes: settings.maxOutputBytes,
  };
  if (settings.verifierProvider === "paddleocr")
    return new PaddleOcrVerifier({
      ...limits,
      model: settings.verifierModel,
      ...(settings.verifierEndpoint
        ? { endpoint: settings.verifierEndpoint }
        : {}),
      ...(settings.verifierApiKey ? { apiKey: settings.verifierApiKey } : {}),
    });
  if (settings.verifierProvider === "google-vision")
    return new GoogleVisionOcrVerifier({
      ...limits,
      model: settings.verifierModel,
      ...(settings.verifierEndpoint
        ? { endpoint: settings.verifierEndpoint }
        : {}),
      ...(settings.verifierApiKey ? { apiKey: settings.verifierApiKey } : {}),
    });
  if (settings.verifierProvider === "fake")
    return new DeterministicFakeOcrVerifier(limits);
  throw new Error("OCR evaluation requires an enabled verifier provider");
}

export async function runIntakeOcrEvaluation(options: {
  manifestPath: string;
  settings: IntakeEvaluationSettings;
  allowLive?: boolean;
  detailedOutputPath?: string;
  requireNonEmptyLines?: boolean;
}): Promise<IntakeOcrEvaluationReport> {
  const manifest = await loadIntakeEvaluationManifest(options.manifestPath);
  const adapter = createOcrAdapter(
    options.settings,
    options.allowLive ?? false,
  );
  const manifestDirectory = resolve(options.manifestPath, "..");
  const observations: IntakeOcrEvaluationObservation[] = [];
  for (const testCase of manifest.cases) {
    if (testCase.images.length !== 1) {
      throw new Error("OCR benchmark cases must contain exactly one image");
    }
    const entry = testCase.images[0];
    if (!entry) throw new Error("OCR benchmark case is missing its image");
    const image = await readAnalysisImage(
      manifestDirectory,
      entry,
      options.settings,
    );
    const startedAt = performance.now();
    const ocr = await adapter.verify([image]);
    if (
      options.requireNonEmptyLines &&
      !ocr.lines.some((line) => line.text.trim().length > 0)
    ) {
      throw new Error("OCR smoke fixture returned no non-empty lines");
    }
    const cost: IntakeEvaluationCost | undefined = testCase.cost
      ? {
          currency: testCase.cost.currency,
          ...(testCase.cost.usd === undefined
            ? {}
            : { usd: testCase.cost.usd }),
          ...(testCase.cost.inputTokens === undefined
            ? {}
            : { inputTokens: testCase.cost.inputTokens }),
          ...(testCase.cost.outputTokens === undefined
            ? {}
            : { outputTokens: testCase.cost.outputTokens }),
        }
      : undefined;
    observations.push({
      id: testCase.id,
      images: testCase.images,
      ocr,
      latencyMs: performance.now() - startedAt,
      ...(cost ? { cost } : {}),
    });
  }
  const report: IntakeOcrEvaluationReport = {
    manifestVersion: manifest.version,
    generatedAt: new Date().toISOString(),
    verifierProvider: options.settings.verifierProvider,
    verifierModel: options.settings.verifierModel,
    metrics: calculateIntakeOcrEvaluationMetrics(observations),
  };
  if (options.detailedOutputPath) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(resolve(options.detailedOutputPath, ".."), {
      recursive: true,
    });
    await writeFile(
      options.detailedOutputPath,
      JSON.stringify(
        {
          ...report,
          observations,
        },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
  }
  return report;
}

export const calculateOcrEvaluationMetrics =
  calculateIntakeOcrEvaluationMetrics;
export const runOcrEvaluation = runIntakeOcrEvaluation;

export function isProviderError(
  error: unknown,
): error is RecognitionProviderError {
  return error instanceof RecognitionProviderError;
}
