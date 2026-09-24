import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import type { ServerConfig } from "@simply-clean/config";
import type { DatabaseConnection } from "@simply-clean/database";
import {
  IntakeRecognitionStatusSchema,
  IntakeRecognitionAttemptMetricSchema,
  RequestIntakeRecognitionSchema,
  IntakeRecaptureEvidenceSchema,
  roleHasPermission,
  type IdentityUser,
  type IntakeRecognitionStatus,
  type IntakeRecognitionField,
  type IntakeOcrResult,
  type IntakeSemanticResult,
  type IntakeRecognitionAttemptMetric,
} from "@simply-clean/contracts";
import { SERVER_CONFIG } from "../../../platform/logging.js";
import { DATABASE_CONNECTION } from "../../../platform/database.module.js";
import {
  FILES_OPERATIONS,
  type FilesOperations,
} from "../../files/files.service.js";
import { FilePolicyError } from "../../files/content-policy.js";
import type { InternalEventHandlerRegistry } from "../../operations/internal-event-dispatcher.js";
import type { DispatchableInternalEvent } from "../../operations/operations.ports.js";
import type { InventoryActorContext } from "../inventory.repository.js";
import { IntakeService } from "./intake.service.js";
import { DeterministicIntakeConfidencePolicy } from "./recognition.policy.js";
import {
  DeterministicFakeOcrVerifier,
  DeterministicFakeSemanticRecognizer,
  GoogleVisionOcrVerifier,
  OpenAISemanticRecognizer,
  PaddleOcrVerifier,
  RecognitionProviderError,
} from "./recognition/providers/index.js";
import { IntakeRecognitionRepository } from "./recognition.repository.js";
import {
  INTAKE_OCR_VERIFIER,
  INTAKE_SEMANTIC_RECOGNIZER,
  type IntakeOcrVerifier,
  type IntakeSemanticRecognizer,
} from "./recognition.ports.js";

export const INTAKE_RECOGNITION_REGISTRY = Symbol(
  "INTAKE_RECOGNITION_REGISTRY",
);

function withStableOcrLineIds(ocr: IntakeOcrResult): IntakeOcrResult {
  return {
    ...ocr,
    lines: ocr.lines.map((line, index) => ({
      ...line,
      lineId: line.lineId ?? `${line.photoId}:line-${index + 1}`,
    })),
  };
}

function ocrLineIdsForImage(ocr: IntakeOcrResult | undefined, photoId: string) {
  return (ocr?.lines ?? [])
    .filter((line) => line.photoId === photoId && line.lineId)
    .slice(0, 20)
    .map((line) => line.lineId as string);
}

@Injectable()
export class IntakeRecognitionService implements OnModuleInit {
  private readonly policy = new DeterministicIntakeConfidencePolicy();
  constructor(
    @Inject(IntakeRecognitionRepository)
    private readonly repository: IntakeRecognitionRepository,
    @Inject(DATABASE_CONNECTION) private readonly database: DatabaseConnection,
    @Inject(FILES_OPERATIONS) private readonly files: FilesOperations,
    @Inject(INTAKE_RECOGNITION_REGISTRY)
    private readonly registry: InternalEventHandlerRegistry,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(INTAKE_SEMANTIC_RECOGNIZER)
    private readonly semantic: IntakeSemanticRecognizer,
    @Inject(INTAKE_OCR_VERIFIER) private readonly ocr: IntakeOcrVerifier,
    @Inject(IntakeService) private readonly intake: IntakeService,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      "inventory.intake.recognition.requested",
      async (event) => this.handle(event),
    );
  }

  async status(
    batchId: string,
    identity: IdentityUser,
  ): Promise<IntakeRecognitionStatus> {
    this.read(identity);
    try {
      return IntakeRecognitionStatusSchema.parse(
        await this.repository.status(
          batchId,
          this.config.intakeRecognitionEnabled,
        ),
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async request(
    batchId: string,
    raw: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeRecognitionStatus> {
    this.manage(identity);
    const input = this.parse(RequestIntakeRecognitionSchema, raw);
    if (!this.config.intakeRecognitionEnabled)
      throw new ConflictException({
        statusCode: 409,
        code: "provider_unavailable",
      });
    try {
      await this.repository.request(
        batchId,
        input.expectedVersion,
        input.retry,
        context,
        {
          provider: this.config.intakeRecognitionSemanticProvider,
          model: this.config.intakeRecognitionSemanticModel,
          verifier: this.config.intakeRecognitionVerifierProvider,
          verifierModel: this.config.intakeRecognitionVerifierModel,
          policyVersion: this.config.intakeRecognitionPolicyVersion,
        },
        input.photoId && input.candidateId
          ? { photoId: input.photoId, candidateId: input.candidateId }
          : undefined,
      );
      return this.repository.status(
        batchId,
        this.config.intakeRecognitionEnabled,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async recapture(
    batchId: string,
    recaptureId: string,
    raw: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeRecognitionStatus> {
    this.manage(identity);
    const input = this.parse(IntakeRecaptureEvidenceSchema, raw);
    try {
      let detail = await this.intake.get(batchId, identity);
      const alreadyLinked = detail.photos.some(
        (photo) => photo.fileId === input.fileId,
      );
      if (alreadyLinked && detail.batch.version !== input.expectedVersion)
        throw new Error("INTAKE_VERSION_CONFLICT");
      if (!alreadyLinked)
        detail = await this.intake.linkPhoto(
          batchId,
          { fileId: input.fileId, expectedVersion: input.expectedVersion },
          identity,
          context,
        );
      const photoId =
        detail.photos.find((photo) => photo.fileId === input.fileId)?.id ??
        input.fileId;
      const recaptureStatus = await this.repository.status(
        batchId,
        this.config.intakeRecognitionEnabled,
      );
      const recapture = recaptureStatus.recaptures.find(
        (item) => item.id === recaptureId,
      );
      if (recapture?.candidateId && photoId !== input.fileId) {
        detail = await this.intake.assignPhoto(
          batchId,
          {
            photoId,
            candidateId: recapture.candidateId,
            expectedVersion: detail.batch.version,
          },
          identity,
          context,
        );
      }
      await this.repository.resolveRecapture(
        recaptureId,
        batchId,
        photoId,
        context.actorUserId,
      );
      await this.repository.request(
        batchId,
        detail.batch.version,
        true,
        context,
        {
          provider: this.config.intakeRecognitionSemanticProvider,
          model: this.config.intakeRecognitionSemanticModel,
          verifier: this.config.intakeRecognitionVerifierProvider,
          verifierModel: this.config.intakeRecognitionVerifierModel,
          policyVersion: this.config.intakeRecognitionPolicyVersion,
        },
        recapture?.candidateId
          ? { photoId, candidateId: recapture.candidateId }
          : undefined,
      );
      return this.repository.status(
        batchId,
        this.config.intakeRecognitionEnabled,
      );
    } catch (error) {
      throw this.map(error);
    }
  }

  async handle(event: DispatchableInternalEvent): Promise<void> {
    const attemptCount = event.attemptCount ?? 1;
    const workerClaim = `${event.id}:${attemptCount}`;
    const claimed = await this.repository.claim(event.targetId, {
      recoverAbandonedRunning: attemptCount > 1,
      workerClaim,
    });
    if (!claimed) return;
    const started = performance.now();
    let preparationMs = 0;
    let ocrMs = 0;
    let semanticMs = 0;
    let ocrBytes = 0;
    let semanticBytes = 0;
    const elapsed = (from: number) =>
      Math.min(600_000, Math.max(0, Math.round(performance.now() - from)));
    const metric = (
      outcome: IntakeRecognitionAttemptMetric["outcome"],
      errorCode: IntakeRecognitionAttemptMetric["errorCode"],
    ) =>
      IntakeRecognitionAttemptMetricSchema.parse({
        attempt: attemptCount,
        preparationMs,
        ocrMs,
        semanticMs,
        totalMs: elapsed(started),
        ocrBytes,
        semanticBytes,
        outcome,
        errorCode,
      });
    try {
      const preparationStarted = performance.now();
      let images: Awaited<
        ReturnType<FilesOperations["getIntakeRecognitionImages"]>
      >;
      try {
        images = await this.files.getIntakeRecognitionImages(
          this.database.database,
          claimed.photos,
          claimed.loadId,
          {
            maxImageBytes: this.config.intakeRecognitionMaxImageBytes,
            maxBatchBytes: this.config.intakeRecognitionMaxBatchBytes,
            maxPixels: this.config.intakeRecognitionMaxPixels,
          },
        );
      } finally {
        preparationMs = elapsed(preparationStarted);
      }
      ocrBytes = images.ocr.reduce(
        (sum, image) => sum + image.bytes.byteLength,
        0,
      );
      semanticBytes = images.semantic.reduce(
        (sum, image) => sum + image.bytes.byteLength,
        0,
      );
      const ocrStarted = performance.now();
      let ocr: IntakeOcrResult;
      try {
        ocr = withStableOcrLineIds(await this.ocr.verify(images.ocr));
      } finally {
        ocrMs = elapsed(ocrStarted);
      }
      const semanticStarted = performance.now();
      let semantic: IntakeSemanticResult;
      try {
        semantic = await this.semantic.recognize(images.semantic, ocr);
      } finally {
        semanticMs = elapsed(semanticStarted);
      }
      const policyConfig = {
        version: this.config.intakeRecognitionPolicyVersion,
        ...(this.config.intakeRecognitionGroupFloor === undefined
          ? {}
          : { groupFloor: this.config.intakeRecognitionGroupFloor }),
        ...(this.config.intakeRecognitionFieldFloor === undefined
          ? {}
          : { fieldFloor: this.config.intakeRecognitionFieldFloor }),
        ...(this.config.intakeRecognitionOcrFloor === undefined
          ? {}
          : { ocrFloor: this.config.intakeRecognitionOcrFloor }),
      };
      const decisions = this.policy.evaluate({
        images: images.ocr,
        semantic,
        ocr,
        config: policyConfig,
      });
      const sourceChecksums = Object.fromEntries(
        images.ocr.map((image) => [image.photoId, image.sourceChecksum]),
      );
      await this.repository.apply(
        claimed.run.id,
        claimed.batchId,
        decisions,
        {
          provider: semantic.provider,
          model: semantic.model,
          verifier: ocr.provider,
          verifierModel: ocr.model,
          schemaVersion: semantic.schemaVersion,
          policyVersion: this.config.intakeRecognitionPolicyVersion,
          inputFingerprint: claimed.run.provenance?.inputFingerprint ?? "",
          sourceChecksums,
        },
        sourceChecksums,
        {
          actorUserId: event.actorUserId ?? "system",
          requestId: event.requestId,
        },
        workerClaim,
        metric(
          decisions.every((decision) => decision.accepted)
            ? "ready"
            : claimed.run.photoId
              ? "failed"
              : "needs_recapture",
          decisions.every((decision) => decision.accepted)
            ? null
            : (decisions.find((decision) => !decision.accepted)?.reasons[0] ??
                "missing_critical_fact"),
        ),
      );
    } catch (error) {
      const policyCodes: Record<string, string> = {
        missing_analysis_bytes: "missing_analysis_bytes",
        checksum_mismatch: "checksum_mismatch",
        size_exceeded: "output_too_large",
        dimensions_exceeded: "output_too_large",
        preview_failed: "malformed_provider_output",
        media_type_mismatch: "provider_unavailable",
        purpose_mismatch: "provider_unavailable",
        size_mismatch: "provider_unavailable",
        storage_failed: "provider_unavailable",
        unsupported_content: "provider_unavailable",
      };
      const code =
        error instanceof FilePolicyError
          ? (policyCodes[error.code] ?? "provider_unavailable")
          : error instanceof RecognitionProviderError
            ? ({
                timeout: "provider_timeout",
                response_too_large: "output_too_large",
                invalid_response: "malformed_provider_output",
                unavailable: "provider_unavailable",
                rate_limited: "provider_unavailable",
                input_too_large: "output_too_large",
                invalid_configuration: "provider_unavailable",
              }[error.code] ?? "provider_unavailable")
            : "provider_unavailable";
      const transient =
        (error instanceof RecognitionProviderError &&
          ["timeout", "unavailable", "rate_limited"].includes(error.code)) ||
        (error instanceof FilePolicyError && error.code === "storage_failed");
      if (transient && attemptCount < this.config.operationsWorkerMaxAttempts) {
        await this.repository.requeue(
          claimed.run.id,
          code,
          workerClaim,
          metric("retry", code as IntakeRecognitionAttemptMetric["errorCode"]),
        );
        throw new Error("Transient Intake recognition failure; retry queued", {
          cause: error,
        });
      }
      await this.repository.fail(
        claimed.run.id,
        code,
        workerClaim,
        metric("failed", code as IntakeRecognitionAttemptMetric["errorCode"]),
      );
    }
  }

  private read(identity: IdentityUser): void {
    if (!roleHasPermission(identity.role, "intake.read"))
      throw new ForbiddenException();
  }
  private manage(identity: IdentityUser): void {
    if (!roleHasPermission(identity.role, "intake.manage"))
      throw new ForbiddenException();
  }
  private parse<T>(
    schema: {
      safeParse(
        input: unknown,
      ): { success: true; data: T } | { success: false };
    },
    input: unknown,
  ): T {
    const result = schema.safeParse(input);
    if (!result.success)
      throw new BadRequestException("Invalid recognition request");
    return result.data;
  }
  private map(error: unknown): Error {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("NOT_FOUND"))
      return new NotFoundException("Recognition resource not found");
    if (message.includes("VERSION_CONFLICT") || message.includes("IDEMPOTENCY"))
      return new ConflictException({
        statusCode: 409,
        code: message.toLowerCase(),
      });
    return error instanceof Error ? error : new BadRequestException();
  }
}

export function createSemanticRecognizer(
  config: ServerConfig,
): IntakeSemanticRecognizer {
  if (!config.intakeRecognitionEnabled)
    return {
      recognize: async () => {
        throw new RecognitionProviderError(
          "invalid_configuration",
          "Recognition is disabled",
        );
      },
    };
  const limits = {
    timeoutMs: config.intakeRecognitionTimeoutMs,
    maxResponseBytes: config.intakeRecognitionMaxOutputBytes,
    maxImageBytes: config.intakeRecognitionMaxImageBytes,
    maxTotalImageBytes: config.intakeRecognitionMaxBatchBytes,
    maxImagePixels: config.intakeRecognitionMaxPixels,
  };
  if (config.intakeRecognitionSemanticProvider === "openai")
    return new OpenAISemanticRecognizer({
      apiKey: config.intakeRecognitionSemanticApiKey ?? "",
      ...(config.intakeRecognitionSemanticEndpoint
        ? { endpoint: config.intakeRecognitionSemanticEndpoint }
        : {}),
      model: config.intakeRecognitionSemanticModel,
      ...limits,
    });
  if (config.intakeRecognitionSemanticProvider === "gemini")
    return {
      recognize: async () => {
        throw new RecognitionProviderError(
          "invalid_configuration",
          "Gemini semantic assignment is not supported for nameplate recognition",
        );
      },
    };
  if (config.intakeRecognitionSemanticProvider === "fake")
    return new DeterministicFakeSemanticRecognizer({
      ...limits,
      result: (images, ocr) => ({
        provider: "fake",
        model: config.intakeRecognitionSemanticModel,
        schemaVersion: "intake-nameplate-v2",
        requestId: null,
        groups: images.map((image) => {
          const serial = `FAKE-${image.photoId.slice(0, 8)}`;
          const model = `FAKE-MODEL-${image.photoId.slice(0, 8)}`;
          const fields: ReadonlyArray<
            readonly [IntakeRecognitionField, string]
          > = [
            ["machineType", "other"],
            ["manufacturer", "FAKE"],
            ["model", model],
            ["serial", serial],
            ["voltage", "120V"],
            ["phase", "single_phase"],
            ["fuel", "electric"],
          ];
          return {
            key: `photo-${image.photoId}`,
            photoIds: [image.photoId],
            confidence: 0.99,
            fields: fields.map(([field, value]) => ({
              field,
              value,
              confidence: 0.99,
              photoId: image.photoId,
              box: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
              ocrLineIds: ocrLineIdsForImage(ocr, image.photoId),
            })),
            quality: [],
          };
        }),
      }),
    });
  return {
    recognize: async () => {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "Recognition is disabled",
      );
    },
  };
}
export function createOcrVerifier(config: ServerConfig): IntakeOcrVerifier {
  if (!config.intakeRecognitionEnabled)
    return {
      verify: async () => {
        throw new RecognitionProviderError(
          "invalid_configuration",
          "Recognition is disabled",
        );
      },
    };
  const limits = {
    timeoutMs: config.intakeRecognitionTimeoutMs,
    maxResponseBytes: config.intakeRecognitionMaxOutputBytes,
    maxImageBytes: config.intakeRecognitionMaxImageBytes,
    maxTotalImageBytes: config.intakeRecognitionMaxBatchBytes,
    maxImagePixels: config.intakeRecognitionMaxPixels,
  };
  if (config.intakeRecognitionVerifierProvider === "paddleocr")
    return new PaddleOcrVerifier({
      ...(config.intakeRecognitionVerifierEndpoint
        ? { endpoint: config.intakeRecognitionVerifierEndpoint }
        : {}),
      ...(config.intakeRecognitionVerifierApiKey
        ? { apiKey: config.intakeRecognitionVerifierApiKey }
        : {}),
      model: config.intakeRecognitionVerifierModel,
      ...limits,
    });
  if (config.intakeRecognitionVerifierProvider === "google-vision")
    return new GoogleVisionOcrVerifier({
      ...(config.intakeRecognitionVerifierEndpoint
        ? { endpoint: config.intakeRecognitionVerifierEndpoint }
        : {}),
      ...(config.intakeRecognitionVerifierApiKey
        ? { apiKey: config.intakeRecognitionVerifierApiKey }
        : {}),
      model: config.intakeRecognitionVerifierModel,
      ...limits,
    });
  if (config.intakeRecognitionVerifierProvider === "fake")
    return new DeterministicFakeOcrVerifier({
      ...limits,
      result: (images) => ({
        provider: "fake",
        model: "deterministic-v1",
        lines: images.flatMap((image) => {
          const serial = `FAKE-${image.photoId.slice(0, 8)}`;
          const model = `FAKE-MODEL-${image.photoId.slice(0, 8)}`;
          return [
            "other",
            "FAKE",
            model,
            serial,
            "120V",
            "single_phase",
            "electric",
          ].map((text) => ({
            photoId: image.photoId,
            text,
            confidence: 0.99,
            box: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
          }));
        }),
      }),
    });
  return {
    verify: async () => {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "Recognition is disabled",
      );
    },
  };
}
