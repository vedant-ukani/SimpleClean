import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CreateAcquisitionLoadRequestSchema,
  CreateInventoryLocationRequestSchema,
  CreateMachineRequestSchema,
  InventoryIdSchema,
  MachineSearchQuerySchema,
  RelocateMachineRequestSchema,
  UpdateAcquisitionLoadRequestSchema,
  UpdateInventoryLocationRequestSchema,
  UpdateMachineIdentityRequestSchema,
  VerifyMachineIdentityRequestSchema,
  VersionedRequestSchema,
  type AcquisitionLoad,
  type InventoryLocation,
  type Machine,
  type MachineDetail,
  type MachineSearchResponse,
} from "@simply-clean/contracts";

import {
  InventoryRepository,
  isUniqueViolation,
  type InventoryActorContext,
  type MutationResult,
  type VerificationResult,
} from "./inventory.repository.js";

export const INVENTORY_OPERATIONS = Symbol("INVENTORY_OPERATIONS");

export interface InventoryOperations {
  createLoad(rawInput: unknown): Promise<AcquisitionLoad>;
  listLoads(): Promise<AcquisitionLoad[]>;
  getLoad(loadId: string): Promise<AcquisitionLoad>;
  updateLoad(loadId: string, rawInput: unknown): Promise<AcquisitionLoad>;
  createLocation(rawInput: unknown): Promise<InventoryLocation>;
  listLocations(): Promise<InventoryLocation[]>;
  getLocation(locationId: string): Promise<InventoryLocation>;
  updateLocation(
    locationId: string,
    rawInput: unknown,
  ): Promise<InventoryLocation>;
  deactivateLocation(
    locationId: string,
    rawInput: unknown,
  ): Promise<InventoryLocation>;
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
  verifyMachine(machineId: string, rawInput: unknown): Promise<Machine>;
  relocateMachine(
    machineId: string,
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<Machine>;
}

@Injectable()
export class InventoryService implements InventoryOperations {
  constructor(
    @Inject(InventoryRepository)
    private readonly repository: InventoryRepository,
  ) {}

  async createLoad(rawInput: unknown): Promise<AcquisitionLoad> {
    return this.repository.createLoad(
      this.parse(CreateAcquisitionLoadRequestSchema, rawInput),
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

  async updateLoad(rawId: string, rawInput: unknown): Promise<AcquisitionLoad> {
    const id = this.id(rawId);
    const input = this.parse(UpdateAcquisitionLoadRequestSchema, rawInput);
    const current = await this.repository.findLoad(id);
    if (!current) throw new NotFoundException("Load not found");
    return this.resolveMutation(
      await this.repository.updateLoad(id, input, current),
      "Load",
    );
  }

  async createLocation(rawInput: unknown): Promise<InventoryLocation> {
    try {
      return await this.repository.createLocation(
        this.parse(CreateInventoryLocationRequestSchema, rawInput),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Location code already exists");
      }
      throw error;
    }
  }

  listLocations(): Promise<InventoryLocation[]> {
    return this.repository.listLocations();
  }

  async getLocation(rawId: string): Promise<InventoryLocation> {
    const location = await this.repository.findLocation(this.id(rawId));
    if (!location) throw new NotFoundException("Location not found");
    return location;
  }

  async updateLocation(
    rawId: string,
    rawInput: unknown,
  ): Promise<InventoryLocation> {
    const id = this.id(rawId);
    const input = this.parse(UpdateInventoryLocationRequestSchema, rawInput);
    const current = await this.repository.findLocation(id);
    if (!current) throw new NotFoundException("Location not found");
    try {
      return this.resolveMutation(
        await this.repository.updateLocation(id, input, current),
        "Location",
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Location code already exists");
      }
      throw error;
    }
  }

  async deactivateLocation(
    rawId: string,
    rawInput: unknown,
  ): Promise<InventoryLocation> {
    const id = this.id(rawId);
    const { expectedVersion } = this.parse(VersionedRequestSchema, rawInput);
    return this.resolveMutation(
      await this.repository.deactivateLocation(id, expectedVersion),
      "Location",
    );
  }

  async createMachine(
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<Machine> {
    const result = await this.repository.createMachine(
      this.parse(CreateMachineRequestSchema, rawInput),
      context,
    );
    return this.resolveMachineMutation(result);
  }

  async getMachine(rawId: string): Promise<MachineDetail> {
    const detail = await this.repository.getMachineDetail(this.id(rawId));
    if (!detail) throw new NotFoundException("Machine not found");
    return detail;
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

  async verifyMachine(rawId: string, rawInput: unknown): Promise<Machine> {
    const id = this.id(rawId);
    const { expectedVersion } = this.parse(
      VerifyMachineIdentityRequestSchema,
      rawInput,
    );
    let result: VerificationResult;
    try {
      result = await this.repository.verifyMachine(id, expectedVersion);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      result = await this.repository.persistConcurrentConflict(
        id,
        expectedVersion,
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

  async relocateMachine(
    rawId: string,
    rawInput: unknown,
    context: InventoryActorContext,
  ): Promise<Machine> {
    const input = this.parse(RelocateMachineRequestSchema, rawInput);
    const result = await this.repository.relocateMachine(
      this.id(rawId),
      input.toLocationId,
      input.expectedVersion,
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
    if (result.status === "missing_location") {
      throw new NotFoundException("Location not found");
    }
    if (result.status === "inactive_location") {
      throw new ConflictException("Destination Location is inactive");
    }
    return this.resolveMutation(result, "Machine");
  }
}
