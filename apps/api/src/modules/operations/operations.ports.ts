import type {
  AuditActorKind,
  OperationsAction,
  OperationsTargetType,
  SafeMutationSummary,
} from "@simply-clean/contracts";
import type { DatabaseExecutor } from "@simply-clean/database";
import { createHash } from "node:crypto";

export const MUTATION_RECORDER = Symbol("MUTATION_RECORDER");
export const IDEMPOTENCY_COORDINATOR = Symbol("IDEMPOTENCY_COORDINATOR");
export const INTERNAL_EVENT_DISPATCHER = Symbol("INTERNAL_EVENT_DISPATCHER");
export const OPERATIONS_CLOCK = Symbol("OPERATIONS_CLOCK");

export interface MutationRecordInput {
  actorKind: AuditActorKind;
  actorUserId?: string;
  action: OperationsAction;
  targetType: OperationsTargetType;
  targetId: string;
  requestId: string;
  summary: SafeMutationSummary;
}

export interface MutationRecorder {
  record(
    database: DatabaseExecutor,
    input: MutationRecordInput,
  ): Promise<{ auditId: string; jobId: string }>;
}

export type IdempotencyReservation =
  | { status: "reserved"; recordId: string }
  | { status: "completed"; targetType: string; targetId: string }
  | { status: "fingerprint_conflict" }
  | { status: "in_progress" };

export interface IdempotencyCoordinator {
  reserve(
    database: DatabaseExecutor,
    input: {
      scope: string;
      actorUserId: string;
      rawKey: string;
      requestFingerprint: string;
    },
  ): Promise<IdempotencyReservation>;
  complete(
    database: DatabaseExecutor,
    input: {
      recordId: string;
      targetType: "load" | "location" | "machine";
      targetId: string;
    },
  ): Promise<void>;
  release(
    database: DatabaseExecutor,
    input: { recordId: string },
  ): Promise<void>;
}

export class IdempotencyKeyReuseError extends Error {
  constructor() {
    super("Idempotency key was already used for a different request");
    this.name = "IdempotencyKeyReuseError";
  }
}

export class IdempotencyRequestInProgressError extends Error {
  constructor() {
    super("Idempotent request is still in progress");
    this.name = "IdempotencyRequestInProgressError";
  }
}

export interface DispatchableInternalEvent {
  id: string;
  eventType: OperationsAction;
  targetType: OperationsTargetType;
  targetId: string;
  actorKind: AuditActorKind;
  actorUserId: string | null;
  requestId: string;
  summary: SafeMutationSummary;
}

export interface InternalEventDispatcher {
  dispatch(event: DispatchableInternalEvent): Promise<void>;
}

export interface OperationsClock {
  now(): Date;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function requestFingerprint(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex");
}
