import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Optional,
} from "@nestjs/common";
import {
  CreateAcquisitionLoadRequestSchema,
  CreateMachineRequestSchema,
  IdempotencyKeySchema,
  InventoryIdSchema,
  MachineSearchQuerySchema,
  UpdateAcquisitionLoadRequestSchema,
  UpdateMachineIdentityRequestSchema,
  VerifyMachineIdentityRequestSchema,
  UpdateMachineActualSpecsRequestSchema,
  roleHasPermission,
  type IdentityUser,
  type AcquisitionLoad,
  type Machine,
  type MachineDetail,
  type MachineSearchResponse,
} from "@laundrorama/contracts";
import type { DatabaseExecutor } from "@laundrorama/database";
import {
  CATALOG_OPERATIONS,
  type CatalogOperations,
} from "../catalog/catalog.service.js";
import { effectiveMachineSpecs } from "./actual-specs.js";

import {
  IdempotencyKeyReuseError,
  IdempotencyRequestInProgressError,
} from "../operations/operations.ports.js";

import {
  InventoryRepository,
  isUniqueViolation,
  type InventoryActorContext,
  type MutationResult,
  type VerificationResult,
} from "./inventory.repository.js";

export const INVENTORY_OPERATIONS = Symbol("INVENTORY_OPERATIONS");

export interface InventoryOperations {
  createLoad(
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<AcquisitionLoad>;
  listLoads(): Promise<AcquisitionLoad[]>;
  getLoad(loadId: string): Promise<AcquisitionLoad>;
  updateLoad(
    loadId: string,
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<AcquisitionLoad>;
  createMachine(
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<Machine>;
  getMachine(machineId: string): Promise<MachineDetail>;
  searchMachines(rawQuery: unknown): Promise<MachineSearchResponse>;
  updateMachineIdentity(
    machineId: string,
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<Machine>;
  verifyMachine(
    machineId: string,
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<Machine>;
  analyzeImportCandidates(
    database: DatabaseExecutor,
    candidates: readonly ImportMachineCandidate[],
  ): Promise<ImportCandidateMatch[]>;
  createImportedMachine(
    database: DatabaseExecutor,
    input: ImportMachineCandidate & { sourceLoadId: string },
    context: InventoryActorContext,
  ): Promise<Machine>;
  findMachineForProduction(
    database: DatabaseExecutor,
    machineId: string,
  ): Promise<Machine | undefined>;
  listInitialCheckCandidates(database: DatabaseExecutor): Promise<Machine[]>;
  countOtherMachinesAwaitingTest(database: DatabaseExecutor): Promise<number>;
  updatePreliminaryLifecycle(
    database: DatabaseExecutor,
    input: {
      machineId: string;
      expectedVersion: number;
      inventoryState: "on_hand" | "scrapped";
      productionState: "preliminary_passed" | "awaiting_test" | "blocked";
      actorUserId: string;
      requestId: string;
    },
  ): Promise<Machine | undefined>;
  transitionTestProductionState(
    database: DatabaseExecutor,
    input: {
      machineId: string;
      expectedVersion: number;
      from: "awaiting_test" | "testing";
      to: "testing" | "awaiting_repair" | "awaiting_clean";
      actorUserId: string;
      requestId: string;
    },
  ): Promise<Machine | undefined>;
}

export interface ImportMachineCandidate {
  machineType: Machine["machineType"];
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  inventoryState: Machine["inventoryState"];
  capacityLb?: number | null;
}

export interface ImportCandidateMatch {
  exactIdentityMachineIds: string[];
  serialMachineIds: string[];
  modelMachineIds: string[];
}

@Injectable()
export class InventoryService implements InventoryOperations {
  constructor(
    @Inject(InventoryRepository)
    private readonly repository: InventoryRepository,
    @Optional()
    @Inject(CATALOG_OPERATIONS)
    private readonly catalog?: CatalogOperations,
  ) {}

  findMachineForProduction(
    database: DatabaseExecutor,
    machineId: string,
  ): Promise<Machine | undefined> {
    return this.repository.findMachineForProduction(database, machineId);
  }

  listInitialCheckCandidates(database: DatabaseExecutor): Promise<Machine[]> {
    return this.repository.listInitialCheckCandidates(database);
  }

  countOtherMachinesAwaitingTest(database: DatabaseExecutor): Promise<number> {
    return this.repository.countOtherMachinesAwaitingTest(database);
  }

  updatePreliminaryLifecycle(
    database: DatabaseExecutor,
    input: Parameters<InventoryOperations["updatePreliminaryLifecycle"]>[1],
  ): Promise<Machine | undefined> {
    return this.repository.updatePreliminaryLifecycle(database, input);
  }

  transitionTestProductionState(
    database: DatabaseExecutor,
    input: Parameters<InventoryOperations["transitionTestProductionState"]>[1],
  ): Promise<Machine | undefined> {
    return this.repository.transitionTestProductionState(database, input);
  }

  async createLoad(
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<AcquisitionLoad> {
    return this.idempotent(() =>
      this.repository.createLoad(
        this.parse(CreateAcquisitionLoadRequestSchema, rawInput),
        context,
      ),
    );
  }

  listLoads(): Promise<AcquisitionLoad[]> {
    return this.repository.listLoads();
  }

  async getLoad(rawId: string): Promise<AcquisitionLoad> {
    const id = this.id(rawId);
    const load = await this.repository.findLoad(id);
    if (!load) throw new NotFoundException("Load not found");
    return load;
  }

  async updateLoad(
    rawId: string,
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<AcquisitionLoad> {
    const id = this.id(rawId);
    const input = this.parse(UpdateAcquisitionLoadRequestSchema, rawInput);
    const current = await this.repository.findLoad(id);
    if (!current) throw new NotFoundException("Load not found");
    return this.resolveMutation(
      await this.repository.updateLoad(id, input, current, context),
      "Load",
    );
  }

  async createMachine(
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<Machine> {
    const result = await this.idempotent(() =>
      this.repository.createMachine(
        this.parse(CreateMachineRequestSchema, rawInput),
        context,
      ),
    );
    return this.resolveMachineMutation(result);
  }

  async getMachine(rawId: string): Promise<MachineDetail> {
    const detail = await this.repository.getMachineDetail(this.id(rawId));
    if (!detail) throw new NotFoundException("Machine not found");
    if (this.catalog) {
      const [resolution, actualSpecs] = await Promise.all([
        this.catalog
          .currentMachineResolution(detail.machine.id, detail.machine)
          .catch(() => undefined),
        this.repository.actualSpecs(detail.machine.id),
      ]);
      if (resolution)
        detail.catalog = {
          resolutionId: resolution.id,
          identityVersion: resolution.identityVersion,
          pendingIdentityResolution: !resolution.identityMatches,
          status: resolution.identityMatches
            ? resolution.status
            : "insufficient_input",
          matchKind: resolution.identityMatches ? resolution.matchKind : null,
          resolvedAt: resolution.resolvedAt,
          revision: resolution.identityMatches ? resolution.detail : null,
          manufactureDate:
            resolution.identityMatches && resolution.manufactureDate
              ? resolution.manufactureDate
              : { kind: "unknown", reason: "serial_rule_unavailable" },
          actualSpecs,
          effectiveSpecs: effectiveMachineSpecs(
            actualSpecs,
            detail.machine.capacityLb,
            resolution.identityMatches
              ? (resolution.detail?.specs ?? null)
              : null,
          ),
        };
      else
        detail.catalog = {
          resolutionId: null,
          pendingIdentityResolution: true,
          status: "insufficient_input",
          matchKind: null,
          resolvedAt: null,
          revision: null,
          manufactureDate: {
            kind: "unknown",
            reason: "serial_rule_unavailable",
          },
          actualSpecs,
          effectiveSpecs: effectiveMachineSpecs(
            actualSpecs,
            detail.machine.capacityLb,
            null,
          ),
        };
    }
    return detail;
  }

  async updateActualSpecs(
    rawId: string,
    rawInput: unknown,
    identity: IdentityUser,
    context: InventoryActorContext,
  ): Promise<MachineDetail> {
    if (
      !identity.active ||
      identity.id !== context.actorUserId ||
      !roleHasPermission(identity.role, "inventory.machines.manage")
    )
      throw new ForbiddenException();
    const id = this.id(rawId);
    const input = this.parse(UpdateMachineActualSpecsRequestSchema, rawInput);
    this.resolveMutation(
      await this.repository.updateActualSpecs(id, input, context),
      "Machine actual specifications",
    );
    return this.getMachine(id);
  }

  searchMachines(rawQuery: unknown): Promise<MachineSearchResponse> {
    return this.repository.searchMachines(
      this.parse(MachineSearchQuerySchema, rawQuery),
    );
  }

  async updateMachineIdentity(
    rawId: string,
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<Machine> {
    const result = await this.repository.updateMachineIdentity(
      this.id(rawId),
      this.parse(UpdateMachineIdentityRequestSchema, rawInput),
      context,
    );
    return this.resolveMutation(result, "Machine");
  }

  async verifyMachine(
    rawId: string,
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<Machine> {
    const id = this.id(rawId);
    const { expectedVersion } = this.parse(
      VerifyMachineIdentityRequestSchema,
      rawInput,
    );
    let result: VerificationResult;
    try {
      result = await this.repository.verifyMachine(
        id,
        expectedVersion,
        context,
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      result = await this.repository.persistConcurrentConflict(
        id,
        expectedVersion,
        context,
      );
    }
    if (result.status === "identity_incomplete") {
      throw new BadRequestException(
        "Manufacturer and serial are required for verification",
      );
    }
    if (result.status === "identity_conflict") {
      throw new ConflictException({
        statusCode: 409,
        code: "identity_conflict",
        message: "Another Machine already owns this manufacturer and serial",
        conflictingMachineId: result.conflictingMachineId,
        machine: result.machine,
      });
    }
    return this.resolveMutation(result, "Machine");
  }

  analyzeImportCandidates(
    database: DatabaseExecutor,
    candidates: readonly ImportMachineCandidate[],
  ): Promise<ImportCandidateMatch[]> {
    return this.repository.analyzeImportCandidates(database, candidates);
  }

  async createImportedMachine(
    database: DatabaseExecutor,
    input: ImportMachineCandidate & { sourceLoadId: string },
    context: InventoryActorContext,
  ): Promise<Machine> {
    if (input.inventoryState === "scrapped") {
      throw new BadRequestException(
        "Scrapped state requires an approved disposition",
      );
    }
    const result = await this.repository.createImportedMachine(
      database,
      input,
      context,
    );
    return this.resolveMachineMutation(result);
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

  static parseIdempotencyKey(input: unknown): string {
    const result = IdempotencyKeySchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException("A valid Idempotency-Key is required");
    }
    return result.data;
  }

  private async idempotent<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError) {
        throw new ConflictException(
          "Idempotency-Key was already used for a different request",
        );
      }
      if (error instanceof IdempotencyRequestInProgressError) {
        throw new ConflictException(
          "The original request is still in progress",
        );
      }
      throw error;
    }
  }

  private resolveMutation<T>(result: MutationResult<T>, entity: string): T {
    if (result.status === "updated") return result.value;
    if (result.status === "not_found") {
      throw new NotFoundException(`${entity} not found`);
    }
    throw new ConflictException(`${entity} was changed by another request`);
  }

  private resolveMachineMutation(
    result: Awaited<ReturnType<InventoryRepository["createMachine"]>>,
  ): Machine {
    if (result.status === "missing_load") {
      throw new NotFoundException("Load not found");
    }
    return this.resolveMutation(result, "Machine");
  }
}
