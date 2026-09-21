import { Inject, Injectable } from "@nestjs/common";
import type {
  AcquisitionLoad,
  CreateAcquisitionLoadRequest,
  CreateInventoryLocationRequest,
  CreateMachineRequest,
  InventoryLocation,
  Machine,
  MachineDetail,
  MachineIdentityEvidence,
  MachineIdentityVerificationHistory,
  MachineLocationHistory,
  MachineSearchQuery,
  MachineSearchResponse,
  UpdateAcquisitionLoadRequest,
  UpdateInventoryLocationRequest,
  UpdateMachineIdentityRequest,
} from "@simply-clean/contracts";
import type {
  DatabaseConnection,
  DatabaseExecutor,
} from "@simply-clean/database";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { DATABASE_CONNECTION } from "../../platform/database.module.js";
import {
  escapeLikePattern,
  normalizeIdentityMatchValue,
  normalizeStoredFact,
} from "./normalization.js";

export interface InventoryActorContext {
  actorUserId: string;
  requestId: string;
}

export type MutationResult<T> =
  | { status: "updated"; value: T }
  | { status: "not_found" }
  | { status: "version_conflict" };

export type MachineMutationResult =
  | MutationResult<Machine>
  | { status: "inactive_location" }
  | { status: "missing_load" }
  | { status: "missing_location" };

export type VerificationResult =
  | MutationResult<Machine>
  | { status: "identity_incomplete" }
  | {
      status: "identity_conflict";
      machine: Machine;
      conflictingMachineId: string;
    };

type RecordRow = Record<string, unknown>;

function rowsFromResult(result: unknown): RecordRow[] {
  if (Array.isArray(result)) {
    return result.filter(
      (row): row is RecordRow => typeof row === "object" && row !== null,
    );
  }
  if (typeof result === "object" && result !== null && "rows" in result) {
    return rowsFromResult(result.rows);
  }
  return [];
}

function iso(value: unknown): string {
  return new Date(value as Date | string).toISOString();
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function loadFromRow(row: RecordRow): AcquisitionLoad {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    sourceName: nullableString(row.source_name),
    sourceReference: nullableString(row.source_reference),
    expectedArrivalAt: row.expected_arrival_at
      ? iso(row.expected_arrival_at)
      : null,
    receivedAt: row.received_at ? iso(row.received_at) : null,
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function locationFromRow(row: RecordRow): InventoryLocation {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    active: Boolean(row.active),
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function machineFromRow(row: RecordRow): Machine {
  return {
    id: String(row.id),
    machineType: row.machine_type as Machine["machineType"],
    manufacturer: nullableString(row.manufacturer),
    model: nullableString(row.model),
    serial: nullableString(row.serial),
    voltage: nullableString(row.voltage),
    phase: (row.phase ?? null) as Machine["phase"],
    fuel: (row.fuel ?? null) as Machine["fuel"],
    sourceLoadId: String(row.source_load_id),
    sourceLoadDisplayName: String(row.source_load_display_name),
    currentLocationId: nullableString(row.current_location_id),
    currentLocationCode: nullableString(row.current_location_code),
    currentLocationName: nullableString(row.current_location_name),
    identityVerificationState:
      row.identity_verification_state as Machine["identityVerificationState"],
    conflictingMachineId: nullableString(row.conflicting_machine_id),
    inventoryState: row.inventory_state as Machine["inventoryState"],
    productionState: row.production_state as Machine["productionState"],
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function evidenceFromRow(row: RecordRow): MachineIdentityEvidence {
  return {
    id: String(row.id),
    machineId: String(row.machine_id),
    sourceKind: row.source_kind as MachineIdentityEvidence["sourceKind"],
    machineType: row.machine_type as MachineIdentityEvidence["machineType"],
    manufacturer: nullableString(row.manufacturer),
    model: nullableString(row.model),
    serial: nullableString(row.serial),
    voltage: nullableString(row.voltage),
    phase: (row.phase ?? null) as MachineIdentityEvidence["phase"],
    fuel: (row.fuel ?? null) as MachineIdentityEvidence["fuel"],
    actorUserId: String(row.actor_user_id),
    requestId: String(row.request_id),
    createdAt: iso(row.created_at),
  };
}

function historyFromRow(row: RecordRow): MachineLocationHistory {
  return {
    id: String(row.id),
    machineId: String(row.machine_id),
    fromLocationId: nullableString(row.from_location_id),
    toLocationId: String(row.to_location_id),
    actorUserId: String(row.actor_user_id),
    requestId: String(row.request_id),
    machineVersion: Number(row.machine_version),
    createdAt: iso(row.created_at),
  };
}

function verificationHistoryFromRow(
  row: RecordRow,
): MachineIdentityVerificationHistory {
  return {
    id: String(row.id),
    machineId: String(row.machine_id),
    fromState:
      row.from_state as MachineIdentityVerificationHistory["fromState"],
    toState: row.to_state as MachineIdentityVerificationHistory["toState"],
    conflictingMachineId: nullableString(row.conflicting_machine_id),
    machineVersion: Number(row.machine_version),
    actorUserId: String(row.actor_user_id),
    requestId: String(row.request_id),
    createdAt: iso(row.created_at),
  };
}

const machineSelect = sql`
  select
    m.*,
    l.display_name as source_load_display_name,
    loc.code as current_location_code,
    loc.name as current_location_name
  from inventory_machine m
  inner join inventory_load l on l.id = m.source_load_id
  left join inventory_location loc on loc.id = m.current_location_id
`;

@Injectable()
export class InventoryRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  async createLoad(
    input: CreateAcquisitionLoadRequest,
  ): Promise<AcquisitionLoad> {
    const id = randomUUID();
    const result = await this.connection.database.execute(sql`
      insert into inventory_load (
        id, display_name, source_name, source_reference,
        expected_arrival_at, received_at
      ) values (
        ${id}, ${input.displayName}, ${input.sourceName ?? null},
        ${input.sourceReference ?? null}, ${input.expectedArrivalAt ?? null},
        ${input.receivedAt ?? null}
      ) returning *
    `);
    return loadFromRow(rowsFromResult(result)[0]!);
  }

  async listLoads(): Promise<AcquisitionLoad[]> {
    const result = await this.connection.database.execute(sql`
      select * from inventory_load order by created_at desc, display_name
    `);
    return rowsFromResult(result).map(loadFromRow);
  }

  async findLoad(id: string): Promise<AcquisitionLoad | undefined> {
    return this.findLoadWith(this.connection.database, id);
  }

  async updateLoad(
    id: string,
    input: UpdateAcquisitionLoadRequest,
    current: AcquisitionLoad,
  ): Promise<MutationResult<AcquisitionLoad>> {
    const result = await this.connection.database.execute(sql`
      update inventory_load set
        display_name = ${input.displayName ?? current.displayName},
        source_name = ${input.sourceName === undefined ? current.sourceName : input.sourceName},
        source_reference = ${input.sourceReference === undefined ? current.sourceReference : input.sourceReference},
        expected_arrival_at = ${input.expectedArrivalAt === undefined ? current.expectedArrivalAt : input.expectedArrivalAt},
        received_at = ${input.receivedAt === undefined ? current.receivedAt : input.receivedAt},
        version = version + 1,
        updated_at = now()
      where id = ${id} and version = ${input.expectedVersion}
      returning *
    `);
    const row = rowsFromResult(result)[0];
    if (row) return { status: "updated", value: loadFromRow(row) };
    return (await this.findLoad(id))
      ? { status: "version_conflict" }
      : { status: "not_found" };
  }

  async createLocation(
    input: CreateInventoryLocationRequest,
  ): Promise<InventoryLocation> {
    const result = await this.connection.database.execute(sql`
      insert into inventory_location (id, code, name)
      values (${randomUUID()}, ${input.code}, ${input.name})
      returning *
    `);
    return locationFromRow(rowsFromResult(result)[0]!);
  }

  async listLocations(): Promise<InventoryLocation[]> {
    const result = await this.connection.database.execute(sql`
      select * from inventory_location order by active desc, code
    `);
    return rowsFromResult(result).map(locationFromRow);
  }

  async findLocation(id: string): Promise<InventoryLocation | undefined> {
    const result = await this.connection.database.execute(
      sql`select * from inventory_location where id = ${id}`,
    );
    const row = rowsFromResult(result)[0];
    return row ? locationFromRow(row) : undefined;
  }

  async updateLocation(
    id: string,
    input: UpdateInventoryLocationRequest,
    current: InventoryLocation,
  ): Promise<MutationResult<InventoryLocation>> {
    const result = await this.connection.database.execute(sql`
      update inventory_location set
        code = ${input.code ?? current.code},
        name = ${input.name ?? current.name},
        version = version + 1,
        updated_at = now()
      where id = ${id} and version = ${input.expectedVersion}
      returning *
    `);
    const row = rowsFromResult(result)[0];
    if (row) return { status: "updated", value: locationFromRow(row) };
    return (await this.findLocation(id))
      ? { status: "version_conflict" }
      : { status: "not_found" };
  }

  async deactivateLocation(
    id: string,
    expectedVersion: number,
  ): Promise<MutationResult<InventoryLocation>> {
    const result = await this.connection.database.execute(sql`
      update inventory_location set
        active = false,
        version = version + 1,
        updated_at = now()
      where id = ${id} and version = ${expectedVersion}
      returning *
    `);
    const row = rowsFromResult(result)[0];
    if (row) return { status: "updated", value: locationFromRow(row) };
    return (await this.findLocation(id))
      ? { status: "version_conflict" }
      : { status: "not_found" };
  }

  async createMachine(
    input: CreateMachineRequest,
    context: InventoryActorContext,
  ): Promise<MachineMutationResult> {
    return this.connection.transaction(async (database) => {
      if (!(await this.findLoadWith(database, input.sourceLoadId))) {
        return { status: "missing_load" };
      }
      if (input.currentLocationId) {
        const location = await this.findLocationWith(
          database,
          input.currentLocationId,
        );
        if (!location) return { status: "missing_location" };
        if (!location.active) return { status: "inactive_location" };
      }
      const id = randomUUID();
      const manufacturer = normalizeStoredFact(input.manufacturer);
      const model = normalizeStoredFact(input.model);
      const serial = normalizeStoredFact(input.serial);
      const voltage = normalizeStoredFact(input.voltage);
      await database.execute(sql`
        insert into inventory_machine (
          id, machine_type, manufacturer, normalized_manufacturer, model,
          serial, normalized_serial, voltage, phase, fuel, source_load_id,
          current_location_id, inventory_state
        ) values (
          ${id}, ${input.machineType}, ${manufacturer},
          ${normalizeIdentityMatchValue(manufacturer)}, ${model}, ${serial},
          ${normalizeIdentityMatchValue(serial)}, ${voltage},
          ${input.phase ?? null}, ${input.fuel ?? null}, ${input.sourceLoadId},
          ${input.currentLocationId ?? null},
          ${input.currentLocationId ? "on_hand" : input.inventoryState}
        )
      `);
      await this.insertEvidence(
        database,
        id,
        {
          machineType: input.machineType,
          manufacturer: input.manufacturer ?? null,
          model: input.model ?? null,
          serial: input.serial ?? null,
          voltage: input.voltage ?? null,
          phase: input.phase ?? null,
          fuel: input.fuel ?? null,
          sourceKind: input.sourceKind,
        },
        context,
      );
      if (input.currentLocationId) {
        await this.insertLocationHistory(
          database,
          id,
          null,
          input.currentLocationId,
          1,
          context,
        );
      }
      const machine = await this.findMachineWith(database, id);
      if (!machine) throw new Error("Machine was not created");
      return { status: "updated", value: machine };
    });
  }

  async findMachine(id: string): Promise<Machine | undefined> {
    return this.findMachineWith(this.connection.database, id);
  }

  async getMachineDetail(id: string): Promise<MachineDetail | undefined> {
    const machine = await this.findMachine(id);
    if (!machine) return undefined;
    const [evidenceResult, verificationResult, historyResult] =
      await Promise.all([
        this.connection.database.execute(sql`
        select * from machine_identity_evidence
        where machine_id = ${id}
        order by created_at desc, id desc
      `),
        this.connection.database.execute(sql`
        select * from machine_identity_verification_history
        where machine_id = ${id}
        order by created_at desc, id desc
      `),
        this.connection.database.execute(sql`
        select * from machine_location_history
        where machine_id = ${id}
        order by created_at desc, id desc
      `),
      ]);
    return {
      machine,
      identityEvidence: rowsFromResult(evidenceResult).map(evidenceFromRow),
      verificationHistory: rowsFromResult(verificationResult).map(
        verificationHistoryFromRow,
      ),
      locationHistory: rowsFromResult(historyResult).map(historyFromRow),
    };
  }

  async searchMachines(
    input: MachineSearchQuery,
  ): Promise<MachineSearchResponse> {
    const query = input.query.toLowerCase();
    const normalized = normalizeIdentityMatchValue(input.query) ?? "";
    const pattern = `%${escapeLikePattern(query)}%`;
    const filter = input.query
      ? sql`where (
          lower(m.id) = ${query}
          or m.normalized_serial = ${normalized}
          or lower(coalesce(m.manufacturer, '')) like ${pattern} escape '\\'
          or lower(coalesce(m.model, '')) like ${pattern} escape '\\'
          or lower(coalesce(m.serial, '')) like ${pattern} escape '\\'
          or lower(l.display_name) like ${pattern} escape '\\'
          or lower(coalesce(l.source_reference, '')) like ${pattern} escape '\\'
          or lower(coalesce(loc.code, '')) like ${pattern} escape '\\'
          or lower(coalesce(loc.name, '')) like ${pattern} escape '\\'
        )`
      : sql``;
    const countResult = await this.connection.database.execute(sql`
      select count(*)::integer as total
      from inventory_machine m
      inner join inventory_load l on l.id = m.source_load_id
      left join inventory_location loc on loc.id = m.current_location_id
      ${filter}
    `);
    const offset = (input.page - 1) * input.pageSize;
    const result = await this.connection.database.execute(sql`
      ${machineSelect}
      ${filter}
      order by
        case when lower(m.id) = ${query} then 0
             when m.normalized_serial = ${normalized} then 1
             else 2 end,
        m.updated_at desc,
        m.id
      limit ${input.pageSize} offset ${offset}
    `);
    return {
      machines: rowsFromResult(result).map(machineFromRow),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(rowsFromResult(countResult)[0]?.total ?? 0),
    };
  }

  async updateMachineIdentity(
    id: string,
    input: UpdateMachineIdentityRequest,
    context: InventoryActorContext,
  ): Promise<MutationResult<Machine>> {
    return this.connection.transaction(async (database) => {
      const current = await this.lockMachine(database, id);
      if (!current) return { status: "not_found" };
      if (current.version !== input.expectedVersion) {
        return { status: "version_conflict" };
      }
      const next = {
        machineType: input.machineType ?? current.machineType,
        manufacturer:
          input.manufacturer === undefined
            ? current.manufacturer
            : normalizeStoredFact(input.manufacturer),
        model:
          input.model === undefined
            ? current.model
            : normalizeStoredFact(input.model),
        serial:
          input.serial === undefined
            ? current.serial
            : normalizeStoredFact(input.serial),
        voltage:
          input.voltage === undefined
            ? current.voltage
            : normalizeStoredFact(input.voltage),
        phase: input.phase === undefined ? current.phase : input.phase,
        fuel: input.fuel === undefined ? current.fuel : input.fuel,
      };
      await this.insertEvidence(
        database,
        id,
        {
          ...next,
          manufacturer:
            input.manufacturer === undefined
              ? current.manufacturer
              : input.manufacturer,
          model: input.model === undefined ? current.model : input.model,
          serial: input.serial === undefined ? current.serial : input.serial,
          voltage:
            input.voltage === undefined ? current.voltage : input.voltage,
          sourceKind: input.sourceKind,
        },
        context,
      );
      await database.execute(
        sql`delete from machine_identity_claim where machine_id = ${id}`,
      );
      await database.execute(sql`
        update inventory_machine set
          machine_type = ${next.machineType},
          manufacturer = ${next.manufacturer},
          normalized_manufacturer = ${normalizeIdentityMatchValue(next.manufacturer)},
          model = ${next.model},
          serial = ${next.serial},
          normalized_serial = ${normalizeIdentityMatchValue(next.serial)},
          voltage = ${next.voltage},
          phase = ${next.phase},
          fuel = ${next.fuel},
          identity_verification_state = 'provisional',
          conflicting_machine_id = null,
          version = version + 1,
          updated_at = now()
        where id = ${id}
      `);
      const machine = await this.findMachineWith(database, id);
      if (!machine)
        throw new Error("Machine disappeared during identity update");
      return { status: "updated", value: machine };
    });
  }

  async verifyMachine(
    id: string,
    expectedVersion: number,
    context: InventoryActorContext,
  ): Promise<VerificationResult> {
    return this.connection.transaction(async (database) => {
      const current = await this.lockMachine(database, id);
      if (!current) return { status: "not_found" };
      if (current.version !== expectedVersion)
        return { status: "version_conflict" };
      const manufacturer = normalizeIdentityMatchValue(current.manufacturer);
      const serial = normalizeIdentityMatchValue(current.serial);
      if (!manufacturer || !serial) return { status: "identity_incomplete" };
      const owner = await this.findClaimOwner(database, manufacturer, serial);
      if (owner && owner !== id) {
        return this.markConflict(database, current, owner, context);
      }
      if (!owner) {
        await database.execute(sql`
          insert into machine_identity_claim (
            id, machine_id, normalized_manufacturer, normalized_serial
          ) values (${randomUUID()}, ${id}, ${manufacturer}, ${serial})
        `);
      }
      await database.execute(sql`
        update inventory_machine set
          identity_verification_state = 'verified',
          conflicting_machine_id = null,
          version = version + 1,
          updated_at = now()
        where id = ${id}
      `);
      await this.insertVerificationHistory(
        database,
        current,
        "verified",
        null,
        current.version + 1,
        context,
      );
      const machine = await this.findMachineWith(database, id);
      if (!machine) throw new Error("Machine disappeared during verification");
      return { status: "updated", value: machine };
    });
  }

  async persistConcurrentConflict(
    id: string,
    expectedVersion: number,
    context: InventoryActorContext,
  ): Promise<VerificationResult> {
    return this.connection.transaction(async (database) => {
      const current = await this.lockMachine(database, id);
      if (!current) return { status: "not_found" };
      if (current.version !== expectedVersion)
        return { status: "version_conflict" };
      const manufacturer = normalizeIdentityMatchValue(current.manufacturer);
      const serial = normalizeIdentityMatchValue(current.serial);
      if (!manufacturer || !serial) return { status: "identity_incomplete" };
      const owner = await this.findClaimOwner(database, manufacturer, serial);
      if (!owner)
        throw new Error("Identity claim conflict could not be resolved");
      return this.markConflict(database, current, owner, context);
    });
  }

  async relocateMachine(
    id: string,
    toLocationId: string,
    expectedVersion: number,
    context: InventoryActorContext,
  ): Promise<MachineMutationResult> {
    return this.connection.transaction(async (database) => {
      const current = await this.lockMachine(database, id);
      if (!current) return { status: "not_found" };
      if (current.version !== expectedVersion)
        return { status: "version_conflict" };
      const location = await this.findLocationWith(database, toLocationId);
      if (!location) return { status: "missing_location" };
      if (!location.active) return { status: "inactive_location" };
      const nextVersion = current.version + 1;
      await database.execute(sql`
        update inventory_machine set
          current_location_id = ${toLocationId},
          inventory_state = 'on_hand',
          version = ${nextVersion},
          updated_at = now()
        where id = ${id}
      `);
      await this.insertLocationHistory(
        database,
        id,
        current.currentLocationId,
        toLocationId,
        nextVersion,
        context,
      );
      const machine = await this.findMachineWith(database, id);
      if (!machine) throw new Error("Machine disappeared during relocation");
      return { status: "updated", value: machine };
    });
  }

  private async findLoadWith(
    database: DatabaseExecutor,
    id: string,
  ): Promise<AcquisitionLoad | undefined> {
    const result = await database.execute(
      sql`select * from inventory_load where id = ${id}`,
    );
    const row = rowsFromResult(result)[0];
    return row ? loadFromRow(row) : undefined;
  }

  private async findLocationWith(
    database: DatabaseExecutor,
    id: string,
  ): Promise<InventoryLocation | undefined> {
    const result = await database.execute(
      sql`select * from inventory_location where id = ${id}`,
    );
    const row = rowsFromResult(result)[0];
    return row ? locationFromRow(row) : undefined;
  }

  private async findMachineWith(
    database: DatabaseExecutor,
    id: string,
  ): Promise<Machine | undefined> {
    const result = await database.execute(
      sql`${machineSelect} where m.id = ${id}`,
    );
    const row = rowsFromResult(result)[0];
    return row ? machineFromRow(row) : undefined;
  }

  private async lockMachine(
    database: DatabaseExecutor,
    id: string,
  ): Promise<Machine | undefined> {
    const result = await database.execute(
      sql`${machineSelect} where m.id = ${id} for update of m`,
    );
    const row = rowsFromResult(result)[0];
    return row ? machineFromRow(row) : undefined;
  }

  private async findClaimOwner(
    database: DatabaseExecutor,
    manufacturer: string,
    serial: string,
  ): Promise<string | undefined> {
    const result = await database.execute(sql`
      select machine_id from machine_identity_claim
      where normalized_manufacturer = ${manufacturer}
        and normalized_serial = ${serial}
    `);
    const row = rowsFromResult(result)[0];
    return row ? String(row.machine_id) : undefined;
  }

  private async markConflict(
    database: DatabaseExecutor,
    current: Machine,
    conflictingMachineId: string,
    context: InventoryActorContext,
  ): Promise<VerificationResult> {
    await database.execute(
      sql`delete from machine_identity_claim where machine_id = ${current.id}`,
    );
    await database.execute(sql`
      update inventory_machine set
        identity_verification_state = 'conflict',
        conflicting_machine_id = ${conflictingMachineId},
        version = version + 1,
        updated_at = now()
      where id = ${current.id}
    `);
    await this.insertVerificationHistory(
      database,
      current,
      "conflict",
      conflictingMachineId,
      current.version + 1,
      context,
    );
    const machine = await this.findMachineWith(database, current.id);
    if (!machine) throw new Error("Machine disappeared during conflict update");
    return { status: "identity_conflict", machine, conflictingMachineId };
  }

  private async insertEvidence(
    database: DatabaseExecutor,
    machineId: string,
    input: {
      machineType: Machine["machineType"];
      manufacturer: string | null;
      model: string | null;
      serial: string | null;
      voltage: string | null;
      phase: Machine["phase"];
      fuel: Machine["fuel"];
      sourceKind: MachineIdentityEvidence["sourceKind"];
    },
    context: InventoryActorContext,
  ): Promise<void> {
    await database.execute(sql`
      insert into machine_identity_evidence (
        id, machine_id, source_kind, machine_type, manufacturer, model,
        serial, voltage, phase, fuel, actor_user_id, request_id
      ) values (
        ${randomUUID()}, ${machineId}, ${input.sourceKind}, ${input.machineType},
        ${input.manufacturer}, ${input.model}, ${input.serial}, ${input.voltage},
        ${input.phase}, ${input.fuel}, ${context.actorUserId}, ${context.requestId}
      )
    `);
  }

  private async insertVerificationHistory(
    database: DatabaseExecutor,
    current: Machine,
    toState: "verified" | "conflict",
    conflictingMachineId: string | null,
    machineVersion: number,
    context: InventoryActorContext,
  ): Promise<void> {
    await database.execute(sql`
      insert into machine_identity_verification_history (
        id, machine_id, from_state, to_state, conflicting_machine_id,
        machine_version, actor_user_id, request_id
      ) values (
        ${randomUUID()}, ${current.id}, ${current.identityVerificationState},
        ${toState}, ${conflictingMachineId}, ${machineVersion},
        ${context.actorUserId}, ${context.requestId}
      )
    `);
  }

  private async insertLocationHistory(
    database: DatabaseExecutor,
    machineId: string,
    fromLocationId: string | null,
    toLocationId: string,
    machineVersion: number,
    context: InventoryActorContext,
  ): Promise<void> {
    await database.execute(sql`
      insert into machine_location_history (
        id, machine_id, from_location_id, to_location_id,
        actor_user_id, request_id, machine_version
      ) values (
        ${randomUUID()}, ${machineId}, ${fromLocationId}, ${toLocationId},
        ${context.actorUserId}, ${context.requestId}, ${machineVersion}
      )
    `);
  }
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    code?: unknown;
    cause?: { code?: unknown };
    message?: unknown;
  };
  return (
    candidate.code === "23505" ||
    candidate.cause?.code === "23505" ||
    (typeof candidate.message === "string" &&
      candidate.message.includes("unique constraint"))
  );
}
