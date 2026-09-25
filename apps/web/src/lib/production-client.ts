import {
  ActiveTestWorkResponseSchema,
  ProductionWorkDestinationSchema,
  MachineSchema,
  PreliminaryInspectionHistoryResponseSchema,
  ProductionSpecialtyAssignmentSchema,
  ProductionSpecialtyListResponseSchema,
  TestQueueResponseSchema,
  TestWorkDetailSchema,
  TestSessionSchema,
  type TestSession,
  type TestSessionItemState,
  type ProductionSpecialty,
  type TestQueueResponse,
  type TestWorkDetail,
  type CreatePreliminaryInspectionRequest,
  type RecordInitialCheckRequest,
  type PreliminaryInspectionHistoryResponse,
  type RecordPreliminaryDispositionRequest,
} from "@laundrorama/contracts";
import {
  getBrowserJson,
  getServerJson,
  postBrowserJson,
  putBrowserJson,
} from "./api-client";

export async function getPreliminaryHistory(
  machineId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<PreliminaryInspectionHistoryResponse> {
  return PreliminaryInspectionHistoryResponseSchema.parse(
    await getServerJson(
      `/inventory/machines/${machineId}/production`,
      fetcher,
      environment,
      cookie,
    ),
  );
}

export async function createPreliminaryInspection(
  machineId: string,
  request: CreatePreliminaryInspectionRequest,
  idempotencyKey: string,
): Promise<PreliminaryInspectionHistoryResponse> {
  return PreliminaryInspectionHistoryResponseSchema.parse(
    await postBrowserJson(
      `/inventory/machines/${machineId}/production/inspections`,
      request,
      idempotencyKey,
    ),
  );
}

export async function recordInitialCheck(
  machineId: string,
  request: RecordInitialCheckRequest,
): Promise<PreliminaryInspectionHistoryResponse> {
  return PreliminaryInspectionHistoryResponseSchema.parse(
    await postBrowserJson(
      `/inventory/machines/${machineId}/production/initial-check`,
      request,
      crypto.randomUUID(),
    ),
  );
}

export async function getInitialCheckMachine(
  machineId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
) {
  return MachineSchema.parse(
    await getServerJson(
      `/production/initial-check/${machineId}`,
      fetcher,
      environment,
      cookie,
    ),
  );
}

export async function finalizePreliminaryDisposition(
  machineId: string,
  inspectionId: string,
  request: RecordPreliminaryDispositionRequest,
  idempotencyKey: string,
): Promise<PreliminaryInspectionHistoryResponse> {
  return PreliminaryInspectionHistoryResponseSchema.parse(
    await postBrowserJson(
      `/inventory/machines/${machineId}/production/inspections/${inspectionId}/dispositions`,
      request,
      idempotencyKey,
    ),
  );
}

export async function getTestQueue(
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
  includeCompleted = false,
): Promise<TestQueueResponse> {
  return TestQueueResponseSchema.parse(
    await getServerJson(
      `/production/work${includeCompleted ? "?includeCompleted=true" : ""}`,
      fetcher,
      environment,
      cookie,
    ),
  );
}

export async function getTestWork(
  orderId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<TestWorkDetail> {
  return TestWorkDetailSchema.parse(
    await getServerJson(
      `/production/work/${orderId}`,
      fetcher,
      environment,
      cookie,
    ),
  );
}

export async function getActiveTestWork(
  machineId: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  return ActiveTestWorkResponseSchema.parse(
    await getBrowserJson(
      `/inventory/machines/${machineId}/production/active-test`,
      fetcher,
    ),
  ).orderId;
}

export async function getProductionWorkDestination(
  machineId: string,
  fetcher: typeof fetch = fetch,
) {
  return ProductionWorkDestinationSchema.parse(
    await getBrowserJson(
      `/inventory/machines/${machineId}/production/work-destination`,
      fetcher,
    ),
  );
}
export async function getServerProductionWorkDestination(
  machineId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
) {
  return ProductionWorkDestinationSchema.parse(
    await getServerJson(
      `/inventory/machines/${machineId}/production/work-destination`,
      fetcher,
      environment,
      cookie,
    ),
  );
}

export async function getProductionSpecialties(
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
) {
  return ProductionSpecialtyListResponseSchema.parse(
    await getServerJson(
      "/production/specialties",
      fetcher,
      environment,
      cookie,
    ),
  ).assignments;
}

export async function setProductionSpecialties(
  userId: string,
  specialties: ProductionSpecialty[],
) {
  return ProductionSpecialtyAssignmentSchema.parse(
    await putBrowserJson(
      `/production/specialties/${userId}`,
      { specialties },
      crypto.randomUUID(),
    ),
  );
}

export async function startTest(
  orderId: string,
  expectedVersion: number,
): Promise<TestWorkDetail> {
  return TestWorkDetailSchema.parse(
    await postBrowserJson(
      `/production/work/${orderId}/start`,
      { expectedVersion },
      crypto.randomUUID(),
    ),
  );
}
export async function assignTest(
  orderId: string,
  expectedVersion: number,
  userId: string | null,
): Promise<TestWorkDetail> {
  return TestWorkDetailSchema.parse(
    await postBrowserJson(
      `/production/work/${orderId}/assignment`,
      { expectedVersion, userId },
      crypto.randomUUID(),
    ),
  );
}
export async function recordTestStep(
  orderId: string,
  expectedVersion: number,
  stepKey: string,
  result: "pass" | "fail" | "na",
  fileId: string | null = null,
): Promise<TestWorkDetail> {
  return TestWorkDetailSchema.parse(
    await postBrowserJson(
      `/production/work/${orderId}/steps`,
      { expectedVersion, stepKey, result, fileId },
      crypto.randomUUID(),
    ),
  );
}
export async function finishTest(
  orderId: string,
  expectedVersion: number,
  expectedSessionVersion: number,
  videoFileId: string | null,
): Promise<TestWorkDetail> {
  return TestWorkDetailSchema.parse(
    await postBrowserJson(
      `/production/work/${orderId}/finish`,
      { expectedVersion, expectedSessionVersion, videoFileId },
      crypto.randomUUID(),
    ),
  );
}

export async function getTestSession(
  sessionId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<TestSession> {
  return TestSessionSchema.parse(
    await getServerJson(
      `/production/work/sessions/${sessionId}`,
      fetcher,
      environment,
      cookie,
    ),
  );
}

export async function createTestSession(
  orders: { orderId: string; expectedVersion: number }[],
): Promise<TestSession> {
  return TestSessionSchema.parse(
    await postBrowserJson(
      "/production/work/sessions",
      { orders },
      crypto.randomUUID(),
    ),
  );
}

export async function addTestSessionOrders(
  sessionId: string,
  expectedVersion: number,
  orders: { orderId: string; expectedVersion: number }[],
): Promise<TestSession> {
  return TestSessionSchema.parse(
    await postBrowserJson(
      `/production/work/sessions/${sessionId}/orders`,
      { expectedVersion, orders },
      crypto.randomUUID(),
    ),
  );
}

export async function changeTestSessionState(
  sessionId: string,
  expectedVersion: number,
  action: "pause" | "resume" | "finish",
): Promise<TestSession> {
  return TestSessionSchema.parse(
    await postBrowserJson(
      `/production/work/sessions/${sessionId}/${action}`,
      { expectedVersion },
      crypto.randomUUID(),
    ),
  );
}

export async function changeTestSessionItemState(
  sessionId: string,
  orderId: string,
  expectedVersion: number,
  state: Extract<TestSessionItemState, "working" | "running_cycle" | "waiting">,
): Promise<TestSession> {
  return TestSessionSchema.parse(
    await postBrowserJson(
      `/production/work/sessions/${sessionId}/items/${orderId}/state`,
      { expectedVersion, state },
      crypto.randomUUID(),
    ),
  );
}

export async function reportNewBearingConcern(
  orderId: string,
  expectedVersion: number,
  expectedSessionVersion: number,
): Promise<TestWorkDetail> {
  return TestWorkDetailSchema.parse(
    await postBrowserJson(
      `/production/work/${orderId}/bearing-concern`,
      {
        expectedVersion,
        expectedSessionVersion,
      },
      crypto.randomUUID(),
    ),
  );
}
