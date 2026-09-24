import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  AssignIntakePhotoRequestSchema,
  CommitIntakeBatchRequestSchema,
  ConfirmIntakeCandidateRequestSchema,
  CreateIntakeBatchRequestSchema,
  CreateIntakeCandidateRequestSchema,
  ExcludeIntakePhotoRequestSchema,
  RemoveIntakePhotoRequestSchema,
  IntakeBatchDetailSchema,
  LinkIntakePhotoRequestSchema,
  SetIntakeDestinationRequestSchema,
  UpdateIntakeCandidateRequestSchema,
  PrepareIntakeItemRequestSchema,
  ChangeIntakeCandidateTypeRequestSchema,
  ChangeIntakeCandidateCapacityRequestSchema,
  CommitIntakeCandidateRequestSchema,
  IdempotencyKeySchema,
  roleHasPermission,
  suggestedMachineType,
  type IdentityUser,
  type IntakeBatch,
  type IntakeBatchDetail,
  type Machine,
} from "@simply-clean/contracts";
import { IntakeRepository } from "./intake.repository.js";
import type { InventoryActorContext } from "../inventory.repository.js";
import type { ServerConfig } from "@simply-clean/config";
import { SERVER_CONFIG } from "../../../platform/logging.js";
import {
  CATALOG_OPERATIONS,
  type CatalogOperations,
} from "../../catalog/catalog.service.js";

export const INTAKE_OPERATIONS = Symbol("INTAKE_OPERATIONS");

@Injectable()
export class IntakeService {
  constructor(
    @Inject(IntakeRepository) private readonly repository: IntakeRepository,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Optional()
    @Inject(CATALOG_OPERATIONS)
    private readonly catalog?: CatalogOperations,
  ) {}

  async create(
    rawLoadId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatch> {
    this.manage(identity);
    this.requireKey(context);
    const loadId = this.id(rawLoadId);
    const input = CreateIntakeBatchRequestSchema.safeParse(
      rawInput ?? { loadId },
    );
    if (!input.success || input.data.loadId !== loadId)
      throw new BadRequestException("Invalid Intake batch request");
    try {
      return await this.repository.create(loadId, context);
    } catch (error) {
      throw this.map(error);
    }
  }

  async get(rawId: string, identity: IdentityUser): Promise<IntakeBatchDetail> {
    this.read(identity);
    const detail = await this.repository.find(this.id(rawId));
    if (!detail) throw new NotFoundException("Intake batch not found");
    const parsed = IntakeBatchDetailSchema.parse(detail);
    if (!this.catalog) return parsed;
    for (const candidate of parsed.candidates) {
      const item = parsed.items?.find(
        (item) => item.candidateId === candidate.id,
      );
      if (item?.latestRunState !== "ready" || candidate.state !== "confirmed")
        continue;
      try {
        const enrichment = await this.catalog.enrichmentForIdentity(candidate);
        candidate.catalogEnrichment = enrichment;
        if (enrichment.status === "verified" && enrichment.revision) {
          candidate.catalogTypeSuggestion = {
            machineType: suggestedMachineType(
              enrichment.revision.equipmentClass,
            ),
            revisionId: enrichment.revision.revisionId,
            manufacturer: enrichment.revision.manufacturer,
            model: enrichment.revision.model,
            label:
              "Verified exact model match — confirm the observed Machine type",
          };
        }
      } catch {
        // Catalog enrichment is advisory; recognition and receiving remain usable.
      }
    }
    return parsed;
  }

  async committedMachines(rawId: string): Promise<Machine[]> {
    let machines: Machine[] | undefined;
    try {
      machines = await this.repository.committedMachines(this.id(rawId));
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "INTAKE_BATCH_NOT_COMMITTED"
      )
        throw new ConflictException({
          statusCode: 409,
          code: "intake_not_finished",
        });
      throw error;
    }
    if (!machines) throw new NotFoundException("Intake batch not found");
    return machines;
  }

  async linkPhoto(
    rawId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(LinkIntakePhotoRequestSchema, rawInput);
    try {
      return await this.repository.linkPhoto(
        this.id(rawId),
        input.fileId,
        input.order,
        input.expectedVersion,
        context,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async createCandidate(
    rawId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(CreateIntakeCandidateRequestSchema, rawInput);
    try {
      return await this.repository.createCandidate(
        this.id(rawId),
        input.expectedVersion,
        context,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async prepareItem(
    rawId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(PrepareIntakeItemRequestSchema, rawInput);
    try {
      return await this.repository.prepareItem(
        this.id(rawId),
        input.fileId,
        input.expectedVersion,
        context,
        {
          provider: this.config.intakeRecognitionSemanticProvider,
          model: this.config.intakeRecognitionSemanticModel,
          verifier: this.config.intakeRecognitionVerifierProvider,
          verifierModel: this.config.intakeRecognitionVerifierModel,
          policyVersion: this.config.intakeRecognitionPolicyVersion,
        },
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async changeCandidateType(
    rawBatchId: string,
    rawCandidateId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(ChangeIntakeCandidateTypeRequestSchema, rawInput);
    try {
      return await this.repository.changeCandidateType(
        this.id(rawBatchId),
        this.id(rawCandidateId),
        input.machineType,
        input.expectedVersion,
        context,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async changeCandidateCapacity(
    rawBatchId: string,
    rawCandidateId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(
      ChangeIntakeCandidateCapacityRequestSchema,
      rawInput,
    );
    try {
      return await this.repository.changeCandidateCapacity(
        this.id(rawBatchId),
        this.id(rawCandidateId),
        input.capacityLb,
        input.expectedVersion,
        context,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async commitCandidate(
    rawBatchId: string,
    rawCandidateId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ) {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(CommitIntakeCandidateRequestSchema, rawInput);
    try {
      return await this.repository.commitCandidate(
        this.id(rawBatchId),
        this.id(rawCandidateId),
        input.expectedVersion,
        input.acknowledgedWarningKinds,
        context,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async updateCandidate(
    rawId: string,
    rawCandidateId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(UpdateIntakeCandidateRequestSchema, rawInput);
    const { expectedVersion, ...changes } = input;
    try {
      return await this.repository.updateCandidate(
        this.id(rawId),
        this.id(rawCandidateId),
        changes,
        expectedVersion,
        context,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async assignPhoto(
    rawId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(AssignIntakePhotoRequestSchema, rawInput);
    try {
      return await this.repository.assignPhoto(
        this.id(rawId),
        input.photoId,
        input.candidateId,
        input.expectedVersion,
        context,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async excludePhoto(
    rawId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(ExcludeIntakePhotoRequestSchema, rawInput);
    try {
      return await this.repository.excludePhoto(
        this.id(rawId),
        input.photoId,
        input.excluded,
        input.expectedVersion,
        context,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async removePhoto(
    rawId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(RemoveIntakePhotoRequestSchema, rawInput);
    try {
      return await this.repository.removePhoto(
        this.id(rawId),
        input.photoId,
        input.expectedVersion,
        context,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async confirmCandidate(
    rawBatchId: string,
    rawCandidateId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(ConfirmIntakeCandidateRequestSchema, rawInput);
    try {
      return await this.repository.confirmCandidate(
        this.id(rawBatchId),
        this.id(rawCandidateId),
        input.expectedVersion,
        input.acknowledgedWarningKinds,
        context,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async setDestination(
    rawId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(SetIntakeDestinationRequestSchema, rawInput);
    try {
      return await this.repository.setDestination(
        this.id(rawId),
        input.locationId,
        input.expectedVersion,
        context,
      );
    } catch (error) {
      throw this.map(error);
    }
  }
  async commit(
    rawId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ) {
    this.manage(identity);
    this.requireKey(context);
    const input = this.parse(CommitIntakeBatchRequestSchema, rawInput);
    try {
      const result = await this.repository.commit(
        this.id(rawId),
        input.expectedVersion,
        context,
        input.finishOnly,
      );
      return {
        ...result,
        machines: result.mappings.map((mapping) => mapping.machineId),
      };
    } catch (error) {
      throw this.map(error);
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
  private requireKey(context: InventoryActorContext): void {
    if (
      !context.idempotencyKey ||
      !IdempotencyKeySchema.safeParse(context.idempotencyKey).success
    )
      throw new BadRequestException({
        statusCode: 400,
        code: "idempotency_key_required",
      });
  }
  private id(raw: string): string {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        raw,
      )
    )
      throw new BadRequestException("Invalid Intake ID");
    return raw;
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
      throw new BadRequestException("Invalid Intake request");
    return result.data;
  }
  private map(error: unknown): Error {
    const code = error instanceof Error ? error.message : "";
    if (code.includes("NOT_FOUND"))
      return new NotFoundException("Intake resource not found");
    if (
      code.includes("VERSION_CONFLICT") ||
      code.includes("ALREADY_LINKED") ||
      code.includes("EXACT_IDENTITY") ||
      code.includes("BATCH_COMMITTED") ||
      code.includes("DESTINATION_LOCKED") ||
      code.includes("CANDIDATE_COMMITTED")
    )
      return new ConflictException({
        statusCode: 409,
        code: this.finding(code),
      });
    if (code.includes("IDEMPOTENCY"))
      return new ConflictException({
        statusCode: 409,
        code: this.finding(code),
      });
    if (code.startsWith("INTAKE_"))
      return new BadRequestException({
        statusCode: 400,
        code: this.finding(code),
      });
    return error instanceof Error ? error : new BadRequestException();
  }

  private finding(code: string): string {
    const values: Record<string, string> = {
      INTAKE_BATCH_NOT_FOUND: "batch_not_found",
      INTAKE_BATCH_COMMITTED: "batch_committed",
      INTAKE_LOAD_NOT_FOUND: "batch_not_found",
      INTAKE_FILE_INVALID: "file_invalid",
      INTAKE_FILE_ALREADY_LINKED: "file_already_linked",
      INTAKE_PHOTO_LIMIT: "photo_limit",
      INTAKE_CANDIDATE_NOT_FOUND: "candidate_not_found",
      INTAKE_CANDIDATE_NOT_CONFIRMED: "candidate_not_confirmed",
      INTAKE_CANDIDATE_COMMITTED: "candidate_committed",
      INTAKE_CANDIDATE_REVISION_CONFLICT: "candidate_revision_conflict",
      INTAKE_TARGET_NOT_FOUND: "target_not_found",
      INTAKE_FINISH_NOT_READY: "finish_not_ready",
      INTAKE_PHOTO_NOT_FOUND: "photo_not_found",
      INTAKE_PHOTO_REQUIRED: "photo_required",
      INTAKE_MACHINE_TYPE_REQUIRED: "machine_type_required",
      INTAKE_PHOTO_NOT_ACCOUNTED: "photo_not_accounted_for",
      INTAKE_DESTINATION_REQUIRED: "destination_required",
      INTAKE_DESTINATION_INVALID: "destination_inactive",
      INTAKE_DESTINATION_LOCKED: "destination_locked",
      INTAKE_EXACT_IDENTITY_MATCH: "exact_identity_match",
      INTAKE_WARNING_ACK_REQUIRED: "warning_acknowledgement_required",
      INTAKE_VERSION_CONFLICT: "version_conflict",
      INTAKE_MACHINE_CREATE_FAILED: "machine_create_failed",
      IDEMPOTENCY_KEY_REQUIRED: "idempotency_key_required",
      IDEMPOTENCY_KEY_REUSED: "idempotency_key_reused",
      IDEMPOTENCY_IN_PROGRESS: "idempotency_in_progress",
    };
    return values[code] ?? "batch_not_found";
  }
}
