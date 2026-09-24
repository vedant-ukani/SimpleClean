import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  CreatePreliminaryInspectionRequestSchema,
  IdempotencyKeySchema,
  InventoryIdSchema,
  PreliminaryInspectionHistoryResponseSchema,
  RecordPreliminaryDispositionRequestSchema,
  roleHasPermission,
  type IdentityUser,
  type PreliminaryInspectionHistoryResponse,
} from "@simply-clean/contracts";
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
