import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import {
  CreateQrLabelRequestSchema,
  IdempotencyKeySchema,
  InventoryIdSchema,
  ReissueQrLabelRequestSchema,
  ResolveQrLabelRequestSchema,
  RevokeQrLabelRequestSchema,
  roleHasPermission,
  type ApplicationRole,
  type MachineDetail,
  type QrLabel,
} from "@simply-clean/contracts";

import {
  IdempotencyKeyReuseError,
  IdempotencyRequestInProgressError,
} from "../../operations/operations.ports.js";
import { isUniqueViolation } from "../inventory.repository.js";
import { InventoryService } from "../inventory.service.js";
import { IntakeService } from "../intake/intake.service.js";
import {
  QrLabelRepository,
  type QrActorContext,
  type QrLabelMutationResult,
} from "./qr-label.repository.js";
import { QrLabelRenderer, type RenderedQrLabel } from "./qr-label.renderer.js";
import { QrLabelSigner } from "./qr-label.signer.js";

export const QR_PLATFORM_PUBLIC_ORIGIN = Symbol("QR_PLATFORM_PUBLIC_ORIGIN");

export interface AuthorizedQrActorContext extends QrActorContext {
  role: ApplicationRole;
}

@Injectable()
export class QrLabelService {
  constructor(
    @Inject(QrLabelRepository)
    private readonly repository: QrLabelRepository,
    @Inject(QrLabelSigner) private readonly signer: QrLabelSigner,
    @Inject(QrLabelRenderer) private readonly renderer: QrLabelRenderer,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(IntakeService) private readonly intake: IntakeService,
    @Inject(QR_PLATFORM_PUBLIC_ORIGIN)
    private readonly platformPublicOrigin: string,
  ) {}

  async listForMachine(
    rawMachineId: string,
    context: AuthorizedQrActorContext,
  ): Promise<QrLabel[]> {
    this.authorizeRead(context);
    const machineId = this.id(rawMachineId);
    await this.inventory.getMachine(machineId);
    return this.repository.listForMachine(machineId);
  }

  async create(
    rawMachineId: string,
    rawInput: unknown,
    context: AuthorizedQrActorContext,
  ): Promise<QrLabel> {
    this.authorizeManage(context);
    const machineId = this.id(rawMachineId);
    this.parse(CreateQrLabelRequestSchema, rawInput);
    this.requireIdempotencyKey(context.idempotencyKey);
    await this.inventory.getMachine(machineId);
    try {
      return this.resolveMutation(
        await this.repository.create(
          {
            machineId,
            labelId: this.signer.createLabelId(),
            fallbackCode: this.signer.createFallbackCode(),
          },
          context,
        ),
      );
    } catch (error) {
      return this.handleMutationError(error);
    }
  }

  async revoke(
    rawLabelId: string,
    rawInput: unknown,
    context: AuthorizedQrActorContext,
  ): Promise<QrLabel> {
    this.authorizeManage(context);
    const labelId = this.id(rawLabelId);
    const input = this.parse(RevokeQrLabelRequestSchema, rawInput);
    try {
      return this.resolveMutation(
        await this.repository.revoke(labelId, input.expectedVersion, context),
      );
    } catch (error) {
      return this.handleMutationError(error);
    }
  }

  async reissue(
    rawMachineId: string,
    rawInput: unknown,
    context: AuthorizedQrActorContext,
  ): Promise<QrLabel> {
    this.authorizeManage(context);
    const machineId = this.id(rawMachineId);
    const input = this.parse(ReissueQrLabelRequestSchema, rawInput);
    this.requireIdempotencyKey(context.idempotencyKey);
    await this.inventory.getMachine(machineId);
    try {
      return this.resolveMutation(
        await this.repository.reissue(
          {
            machineId,
            expectedLabelId: input.expectedLabelId,
            expectedVersion: input.expectedVersion,
            labelId: this.signer.createLabelId(),
            fallbackCode: this.signer.createFallbackCode(),
          },
          context,
        ),
      );
    } catch (error) {
      return this.handleMutationError(error);
    }
  }

  async print(
    rawLabelId: string,
    context: AuthorizedQrActorContext,
  ): Promise<RenderedQrLabel> {
    this.authorizeManage(context);
    const labelId = this.id(rawLabelId);
    let label: QrLabel | undefined;
    try {
      label = await this.repository.findActiveById(labelId);
    } catch (error) {
      throw this.safeFailure(error);
    }
    if (!label) throw new NotFoundException("QR Label not found");
    let rendered: RenderedQrLabel;
    let recorded: QrLabel | undefined;
    try {
      rendered = await this.renderer.render({
        url: this.scanUrl(this.signer.sign(label.id)),
        fallbackCode: label.fallbackCode,
      });
      recorded = await this.repository.recordPrintedIfActive(label.id, context);
    } catch (error) {
      throw this.safeFailure(error);
    }
    if (!recorded) throw new NotFoundException("QR Label not found");
    return rendered;
  }

  async printIntakeSheet(
    rawBatchId: string,
    context: AuthorizedQrActorContext,
  ): Promise<{ pdf: Buffer; filename: string }> {
    this.authorizeManage(context);
    const machines = await this.intake.committedMachines(rawBatchId);
    if (!machines.length)
      throw new BadRequestException("Intake has no committed Machines");
    const labels = [];
    const labelIds: string[] = [];
    for (const machine of machines) {
      let label = await this.repository.findActiveLabelForMachine(machine.id);
      if (!label) {
        try {
          const result = await this.repository.create(
            {
              machineId: machine.id,
              labelId: this.signer.createLabelId(),
              fallbackCode: this.signer.createFallbackCode(),
            },
            {
              ...context,
              idempotencyKey: `${context.idempotencyKey ?? context.requestId}:${machine.id}`,
            },
          );
          label = this.resolveMutation(result);
        } catch (error) {
          if (isUniqueViolation(error))
            label = await this.repository.findActiveLabelForMachine(machine.id);
          if (!label) throw this.handleMutationError(error);
        }
      }
      if (!label)
        throw new InternalServerErrorException("QR label could not be created");
      labelIds.push(label.id);
      labels.push({
        url: this.scanUrl(this.signer.sign(label.id)),
        fallbackCode: label.fallbackCode,
        manufacturer: machine.manufacturer,
        capacityLb: machine.capacityLb ?? null,
        machineType: machine.machineType,
        serial: machine.serial,
      });
    }
    const rendered = await this.renderer.renderSheet({ labels });
    for (const labelId of labelIds) {
      const recorded = await this.repository.recordPrintedIfActive(
        labelId,
        context,
      );
      if (!recorded)
        throw new ConflictException(
          "A QR label became inactive while printing",
        );
    }
    return rendered;
  }

  async resolve(
    rawInput: unknown,
    context: AuthorizedQrActorContext,
  ): Promise<MachineDetail> {
    this.authorizeRead(context);
    const parsed = ResolveQrLabelRequestSchema.safeParse(rawInput);
    if (!parsed.success) throw this.lookupFailure();
    let reference: { labelId?: string; fallbackCode?: string };
    if ("token" in parsed.data) {
      const verified = this.signer.verify(parsed.data.token);
      if (!verified) throw this.lookupFailure();
      reference = { labelId: verified.labelId };
    } else {
      const fallbackCode = this.signer.normalizeFallbackCode(
        parsed.data.fallbackCode,
      );
      if (!fallbackCode) throw this.lookupFailure();
      reference = { fallbackCode };
    }
    let resolved: { labelId: string; machineId: string } | undefined;
    try {
      resolved = await this.repository.resolveActive(reference, context);
    } catch (error) {
      throw this.safeFailure(error);
    }
    if (!resolved) throw this.lookupFailure();
    try {
      return await this.inventory.getMachine(resolved.machineId);
    } catch {
      throw this.lookupFailure();
    }
  }

  static parseIdempotencyKey(input: unknown): string {
    const result = IdempotencyKeySchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException("A valid Idempotency-Key is required");
    }
    return result.data;
  }

  private scanUrl(token: string): string {
    const url = new URL("/scan", this.platformPublicOrigin);
    url.hash = token;
    return url.toString();
  }

  private id(input: string): string {
    const result = InventoryIdSchema.safeParse(input);
    if (!result.success) throw new BadRequestException("Invalid ID");
    return result.data;
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
    if (!result.success) throw new BadRequestException("Invalid request");
    return result.data;
  }

  private resolveMutation(result: QrLabelMutationResult): QrLabel {
    if (result.status === "updated") return result.value;
    if (result.status === "not_found") {
      throw new NotFoundException("QR Label not found");
    }
    if (result.status === "active_label_exists") {
      throw new ConflictException("Machine already has an active QR Label");
    }
    throw new ConflictException("QR Label was changed by another request");
  }

  private handleMutationError(error: unknown): never {
    if (error instanceof IdempotencyKeyReuseError) {
      throw new ConflictException(
        "Idempotency-Key was already used for a different request",
      );
    }
    if (error instanceof IdempotencyRequestInProgressError) {
      throw new ConflictException("The original request is still in progress");
    }
    if (isUniqueViolation(error)) {
      throw new ConflictException("Machine already has an active QR Label");
    }
    throw this.safeFailure(error);
  }

  private requireIdempotencyKey(
    input: string | undefined,
  ): asserts input is string {
    if (!input) {
      throw new BadRequestException("A valid Idempotency-Key is required");
    }
  }

  private authorizeRead(context: AuthorizedQrActorContext): void {
    if (!roleHasPermission(context.role, "inventory.machines.read")) {
      throw new ForbiddenException();
    }
  }

  private authorizeManage(context: AuthorizedQrActorContext): void {
    if (!roleHasPermission(context.role, "inventory.qr_labels.manage")) {
      throw new ForbiddenException();
    }
  }

  private lookupFailure(): NotFoundException {
    return new NotFoundException("QR Label not found");
  }

  private safeFailure(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    return new InternalServerErrorException("QR Label operation failed");
  }
}
