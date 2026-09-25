import { parseWebServerEnvironment } from "@laundrorama/config";
import {
  IntakeBatchDetailSchema,
  IntakeBatchResponseSchema,
  IntakeCommitResponseSchema,
  IntakeRecognitionStatusSchema,
  type IntakeBatch,
  type IntakeBatchDetail,
  type IntakeCommitResponse,
  type IntakeRecognitionStatus,
} from "@laundrorama/contracts";

export class IntakeRequestError extends Error {
  readonly code: string | undefined;

  constructor(
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(`Intake request failed with status ${status}`);
    this.name = "IntakeRequestError";
    const body =
      detail && typeof detail === "object"
        ? (detail as Record<string, unknown>)
        : undefined;
    this.code = typeof body?.code === "string" ? body.code : undefined;
  }
}

async function request(
  url: string,
  fetcher: typeof fetch,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetcher(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...init.headers },
  });
  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      /* non-json error */
    }
    throw new IntakeRequestError(response.status, detail);
  }
  return response.json();
}

function parseRecognitionStatus(body: unknown): IntakeRecognitionStatus {
  if (
    body &&
    typeof body === "object" &&
    "recognition" in body &&
    (body as { recognition?: unknown }).recognition
  ) {
    return IntakeRecognitionStatusSchema.parse(
      (body as { recognition: unknown }).recognition,
    );
  }
  return IntakeRecognitionStatusSchema.parse(body);
}
function serverUrl(
  path: string,
  environment: Record<string, string | undefined>,
): string {
  return `${parseWebServerEnvironment(environment).apiBaseUrl}${path}`;
}
function browserMutation(
  path: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<unknown> {
  return request(`/api${path}`, fetch, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
}
export async function createIntakeBatch(loadId: string): Promise<IntakeBatch> {
  return IntakeBatchResponseSchema.parse(
    await browserMutation(`/inventory/loads/${loadId}/intake`, { loadId }),
  ).batch;
}
export async function getIntakeBatch(
  batchId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<IntakeBatchDetail> {
  const path = `/inventory/intake/${encodeURIComponent(batchId)}`;
  const url =
    typeof window === "undefined"
      ? serverUrl(path, environment)
      : `/api${path}`;
  const body = await request(
    url,
    fetcher,
    cookie ? { headers: { cookie } } : {},
  );
  const detail = IntakeBatchDetailSchema.parse(body);
  // Recognition is optional while older API nodes roll forward. Preserve it
  // here even when the shared Intake detail schema does not yet include it.
  if (
    body &&
    typeof body === "object" &&
    "recognition" in body &&
    (body as { recognition?: unknown }).recognition
  ) {
    return {
      ...detail,
      recognition: parseRecognitionStatus(
        (body as { recognition: unknown }).recognition,
      ),
    } as IntakeBatchDetail & { recognition: IntakeRecognitionStatus };
  }
  return detail;
}
export async function getBrowserIntakeBatch(
  batchId: string,
): Promise<IntakeBatchDetail> {
  return getIntakeBatch(batchId);
}

export async function getIntakeRecognition(
  batchId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<IntakeRecognitionStatus> {
  const path = `/inventory/intake/${encodeURIComponent(batchId)}/recognition`;
  const url =
    typeof window === "undefined"
      ? serverUrl(path, environment)
      : `/api${path}`;
  return parseRecognitionStatus(
    await request(url, fetcher, cookie ? { headers: { cookie } } : {}),
  );
}

export async function requestIntakeRecognition(
  batchId: string,
  expectedVersion: number,
  retry = false,
  target?: { photoId: string; candidateId: string },
): Promise<IntakeRecognitionStatus> {
  return parseRecognitionStatus(
    await browserMutation(`/inventory/intake/${batchId}/recognition`, {
      expectedVersion,
      ...(retry ? { retry: true } : {}),
      ...(target ?? {}),
    }),
  );
}

export async function submitIntakeRecaptureEvidence(
  batchId: string,
  recaptureId: string,
  fileId: string,
  expectedVersion: number,
): Promise<IntakeRecognitionStatus> {
  return parseRecognitionStatus(
    await browserMutation(
      `/inventory/intake/${batchId}/recaptures/${recaptureId}/evidence`,
      { fileId, expectedVersion },
    ),
  );
}

export async function linkIntakePhoto(
  batchId: string,
  fileId: string,
  expectedVersion: number,
): Promise<IntakeBatchDetail> {
  return IntakeBatchDetailSchema.parse(
    await browserMutation(`/inventory/intake/${batchId}/photos`, {
      fileId,
      expectedVersion,
    }),
  );
}
export async function prepareIntakeItem(
  batchId: string,
  fileId: string,
  expectedVersion: number,
): Promise<IntakeBatchDetail> {
  return IntakeBatchDetailSchema.parse(
    await browserMutation(`/inventory/intake/${batchId}/items`, {
      fileId,
      expectedVersion,
    }),
  );
}
export async function changeIntakeCandidateType(
  batchId: string,
  candidateId: string,
  machineType: "washer" | "dryer" | "other",
  expectedVersion: number,
): Promise<IntakeBatchDetail> {
  return IntakeBatchDetailSchema.parse(
    await browserMutation(
      `/inventory/intake/${batchId}/candidates/${candidateId}/type`,
      { machineType, expectedVersion },
      "PATCH",
    ),
  );
}
export async function changeIntakeCandidateCapacity(
  batchId: string,
  candidateId: string,
  capacityLb: number | null,
  expectedVersion: number,
): Promise<IntakeBatchDetail> {
  return IntakeBatchDetailSchema.parse(
    await browserMutation(
      `/inventory/intake/${batchId}/candidates/${candidateId}/capacity`,
      { capacityLb, expectedVersion },
      "PATCH",
    ),
  );
}
export async function commitIntakeCandidate(
  batchId: string,
  candidateId: string,
  expectedVersion: number,
  acknowledgedWarningKinds: string[] = [],
): Promise<{
  batch: IntakeBatchDetail["batch"];
  candidateId: string;
  machineId: string;
}> {
  const body = await browserMutation(
    `/inventory/intake/${batchId}/candidates/${candidateId}/commit`,
    { expectedVersion, acknowledgedWarningKinds },
  );
  return body as {
    batch: IntakeBatchDetail["batch"];
    candidateId: string;
    machineId: string;
  };
}
export async function createIntakeCandidate(
  batchId: string,
  expectedVersion: number,
): Promise<IntakeBatchDetail> {
  return IntakeBatchDetailSchema.parse(
    await browserMutation(`/inventory/intake/${batchId}/candidates`, {
      expectedVersion,
    }),
  );
}
export async function updateIntakeCandidate(
  batchId: string,
  candidateId: string,
  body: Record<string, unknown>,
): Promise<IntakeBatchDetail> {
  return IntakeBatchDetailSchema.parse(
    await browserMutation(
      `/inventory/intake/${batchId}/candidates/${candidateId}`,
      body,
      "PATCH",
    ),
  );
}
export async function assignIntakePhoto(
  batchId: string,
  photoId: string,
  candidateId: string | null,
  expectedVersion: number,
): Promise<IntakeBatchDetail> {
  return IntakeBatchDetailSchema.parse(
    await browserMutation(`/inventory/intake/${batchId}/photos/assign`, {
      photoId,
      candidateId,
      expectedVersion,
    }),
  );
}
export async function excludeIntakePhoto(
  batchId: string,
  photoId: string,
  excluded: boolean,
  expectedVersion: number,
): Promise<IntakeBatchDetail> {
  return IntakeBatchDetailSchema.parse(
    await browserMutation(`/inventory/intake/${batchId}/photos/exclude`, {
      photoId,
      excluded,
      expectedVersion,
    }),
  );
}
export async function confirmIntakeCandidate(
  batchId: string,
  candidateId: string,
  expectedVersion: number,
  acknowledgedWarningKinds: string[],
): Promise<IntakeBatchDetail> {
  return IntakeBatchDetailSchema.parse(
    await browserMutation(
      `/inventory/intake/${batchId}/candidates/${candidateId}/confirm`,
      { expectedVersion, acknowledgedWarningKinds },
    ),
  );
}
export async function commitIntakeBatch(
  batchId: string,
  expectedVersion: number,
  finishOnly = false,
): Promise<IntakeCommitResponse> {
  return IntakeCommitResponseSchema.parse(
    await browserMutation(`/inventory/intake/${batchId}/commit`, {
      expectedVersion,
      finishOnly,
    }),
  );
}
export async function removeIntakePhoto(
  batchId: string,
  photoId: string,
  expectedVersion: number,
): Promise<IntakeBatchDetail> {
  return IntakeBatchDetailSchema.parse(
    await browserMutation(`/inventory/intake/${batchId}/photos/remove`, {
      photoId,
      expectedVersion,
    }),
  );
}
export function intakePreviewUrl(fileId: string, grant: string): string {
  return `/api/files/${encodeURIComponent(fileId)}/preview-content?grant=${encodeURIComponent(grant)}`;
}
export async function createIntakePreviewGrant(
  fileId: string,
): Promise<{ fileId: string; token: string; expiresAt: string }> {
  const body = await request(
    `/api/files/${encodeURIComponent(fileId)}/preview-grants`,
    fetch,
    { method: "POST" },
  );
  const grant = (
    body as { grant?: { fileId: string; token: string; expiresAt: string } }
  ).grant;
  if (!grant) throw new Error("Preview grant was missing");
  return grant;
}
