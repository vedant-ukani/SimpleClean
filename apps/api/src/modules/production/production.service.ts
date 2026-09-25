import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  CreatePreliminaryInspectionRequestSchema,
  RecordInitialCheckRequestSchema,
  IdempotencyKeySchema,
  InventoryIdSchema,
  PreliminaryInspectionHistoryResponseSchema,
  RecordPreliminaryDispositionRequestSchema,
  roleHasPermission,
  type IdentityUser,
  type PreliminaryInspectionHistoryResponse,
  type CreatePreliminaryInspectionRequest,
} from "@laundrorama/contracts";
import { ProductionRepository } from "./production.repository.js";

@Injectable()
export class ProductionService {
  constructor(
    @Inject(ProductionRepository)
    private readonly repository: ProductionRepository,
  ) {}

  async history(
    machineId: string,
    identity: IdentityUser,
  ): Promise<PreliminaryInspectionHistoryResponse> {
    this.authorize(identity, "production.read");
    return PreliminaryInspectionHistoryResponseSchema.parse(
      await this.repository.history(this.id(machineId)),
    );
  }

  async create(
    machineId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: { requestId: string; idempotencyKey: string | undefined },
  ): Promise<PreliminaryInspectionHistoryResponse> {
    this.authorize(identity, "production.manage");
    const input = CreatePreliminaryInspectionRequestSchema.safeParse(rawInput);
    if (!input.success)
      throw new BadRequestException("Invalid preliminary inspection");
    return PreliminaryInspectionHistoryResponseSchema.parse(
      await this.repository.create(this.id(machineId), input.data, {
        actorUserId: identity.id,
        requestId: context.requestId,
        idempotencyKey: this.key(context.idempotencyKey),
        canApprove: roleHasPermission(
          identity.role,
          "production.disposition.approve",
        ),
      }),
    );
  }

  async initialCheck(
    machineId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: { requestId: string; idempotencyKey: string | undefined },
  ): Promise<PreliminaryInspectionHistoryResponse> {
    this.authorize(identity, "production.manage");
    const result = RecordInitialCheckRequestSchema.safeParse(rawInput);
    if (!result.success) throw new BadRequestException("Invalid initial check");
    const choice = result.data.choice;
    const input: CreatePreliminaryInspectionRequest = {
      expectedMachineVersion: result.data.expectedMachineVersion,
      condition:
        choice === "smooth"
          ? "Drum spins smoothly; no bearing concern observed."
          : choice === "bearing_concern"
            ? "Bearing noise or movement detected during drum check."
            : "Drum and bearing could not be assessed.",
      bearingAssessment:
        choice === "smooth"
          ? "no_concern_observed"
          : choice === "bearing_concern"
            ? "concern_observed"
            : "unable_to_assess",
      bearingNotes: "",
      missingParts: "",
      damage: "",
      recommendation: choice === "smooth" ? "repairable" : "owner_review",
      reason:
        choice === "smooth"
          ? "Initial bearing check passed; proceed to full testing."
          : choice === "bearing_concern"
            ? "Bearing concern requires Owner review before further testing."
            : "Unable to assess bearing; Owner review required.",
      evidenceFileIds: [],
    };
    return PreliminaryInspectionHistoryResponseSchema.parse(
      await this.repository.create(
        this.id(machineId),
        input,
        {
          actorUserId: identity.id,
          requestId: context.requestId,
          idempotencyKey: this.key(context.idempotencyKey),
          canApprove: roleHasPermission(
            identity.role,
            "production.disposition.approve",
          ),
        },
        identity,
      ),
    );
  }

  async finalize(
    machineId: string,
    inspectionId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: { requestId: string; idempotencyKey: string | undefined },
  ): Promise<PreliminaryInspectionHistoryResponse> {
    this.authorize(identity, "production.disposition.approve");
    const input = RecordPreliminaryDispositionRequestSchema.safeParse(rawInput);
    if (!input.success)
      throw new BadRequestException("Invalid disposition decision");
    return PreliminaryInspectionHistoryResponseSchema.parse(
      await this.repository.finalize(
        this.id(machineId),
        this.id(inspectionId),
        input.data,
        {
          actorUserId: identity.id,
          requestId: context.requestId,
          idempotencyKey: this.key(context.idempotencyKey),
          canApprove: true,
        },
      ),
    );
  }

  private authorize(
    identity: IdentityUser,
    permission: Parameters<typeof roleHasPermission>[1],
  ): void {
    if (!roleHasPermission(identity.role, permission))
      throw new ForbiddenException();
  }
  private id(value: string): string {
    const result = InventoryIdSchema.safeParse(value);
    if (!result.success) throw new BadRequestException("Invalid ID");
    return result.data;
  }
  private key(value: string | undefined): string {
    const result = IdempotencyKeySchema.safeParse(value);
    if (!result.success)
      throw new BadRequestException("A valid Idempotency-Key is required");
    return result.data;
  }
}
