import { parseWebServerEnvironment } from "@simply-clean/config";
import {
  AcquisitionLoadListResponseSchema,
  AcquisitionLoadResponseSchema,
  IdentityConflictResponseSchema,
  InventoryLocationListResponseSchema,
  InventoryLocationResponseSchema,
  MachineDetailResponseSchema,
  MachineResponseSchema,
  MachineSearchResponseSchema,
  type AcquisitionLoad,
  type CreateAcquisitionLoadRequest,
  type CreateInventoryLocationRequest,
  type CreateMachineRequest,
  type InventoryLocation,
  type Machine,
  type MachineDetail,
  type MachineSearchResponse,
  type RelocateMachineRequest,
  type UpdateAcquisitionLoadRequest,
  type UpdateInventoryLocationRequest,
  type UpdateMachineIdentityRequest,
} from "@simply-clean/contracts";

export class InventoryRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(`Inventory request failed with status ${status}`);
    this.name = "InventoryRequestError";
  }

  identityConflict() {
    const parsed = IdentityConflictResponseSchema.safeParse(this.detail);
    return parsed.success ? parsed.data : undefined;
  }
}

async function requestJson(
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
      detail = undefined;
    }
    throw new InventoryRequestError(response.status, detail);
  }
  return response.json();
}

function serverUrl(
  path: string,
  environment: Record<string, string | undefined>,
): string {
  return `${parseWebServerEnvironment(environment).apiBaseUrl}${path}`;
}

function cookieHeaders(cookie?: string): RequestInit {
  return cookie ? { headers: { cookie } } : {};
}

export async function getLoads(
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<AcquisitionLoad[]> {
  return AcquisitionLoadListResponseSchema.parse(
    await requestJson(
      serverUrl("/inventory/loads", environment),
      fetcher,
      cookieHeaders(cookie),
    ),
  ).loads;
}

export async function getLoad(
  loadId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<AcquisitionLoad> {
  return AcquisitionLoadResponseSchema.parse(
    await requestJson(
      serverUrl(`/inventory/loads/${loadId}`, environment),
      fetcher,
      cookieHeaders(cookie),
    ),
  ).load;
}

export async function getLocations(
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<InventoryLocation[]> {
  return InventoryLocationListResponseSchema.parse(
    await requestJson(
      serverUrl("/inventory/locations", environment),
      fetcher,
      cookieHeaders(cookie),
    ),
  ).locations;
}

export async function searchMachines(
  query: { query?: string; page?: number; pageSize?: number } = {},
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<MachineSearchResponse> {
  const params = new URLSearchParams();
  if (query.query) params.set("query", query.query);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const suffix = params.size ? `?${params.toString()}` : "";
  return MachineSearchResponseSchema.parse(
    await requestJson(
      serverUrl(`/inventory/machines${suffix}`, environment),
      fetcher,
      cookieHeaders(cookie),
    ),
  );
}

export async function getMachine(
  machineId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<MachineDetail> {
  return MachineDetailResponseSchema.parse(
    await requestJson(
      serverUrl(`/inventory/machines/${machineId}`, environment),
      fetcher,
      cookieHeaders(cookie),
    ),
  );
}

async function browserMutation(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  idempotencyKey?: string,
): Promise<unknown> {
  return requestJson(`/api${path}`, fetch, {
    method,
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function browserCreate(path: string, body: unknown): Promise<unknown> {
  const idempotencyKey = crypto.randomUUID();
  try {
    return await browserMutation(path, "POST", body, idempotencyKey);
  } catch (error) {
    if (error instanceof InventoryRequestError) throw error;
    return browserMutation(path, "POST", body, idempotencyKey);
  }
}

export async function createLoad(
  input: CreateAcquisitionLoadRequest,
): Promise<AcquisitionLoad> {
  return AcquisitionLoadResponseSchema.parse(
    await browserCreate("/inventory/loads", input),
  ).load;
}

export async function updateLoad(
  loadId: string,
  input: UpdateAcquisitionLoadRequest,
): Promise<AcquisitionLoad> {
  return AcquisitionLoadResponseSchema.parse(
    await browserMutation(`/inventory/loads/${loadId}`, "PATCH", input),
  ).load;
}

export async function createLocation(
  input: CreateInventoryLocationRequest,
): Promise<InventoryLocation> {
  return InventoryLocationResponseSchema.parse(
    await browserCreate("/inventory/locations", input),
  ).location;
}

export async function updateLocation(
  locationId: string,
  input: UpdateInventoryLocationRequest,
): Promise<InventoryLocation> {
  return InventoryLocationResponseSchema.parse(
    await browserMutation(`/inventory/locations/${locationId}`, "PATCH", input),
  ).location;
}

export async function deactivateLocation(
  locationId: string,
  expectedVersion: number,
): Promise<InventoryLocation> {
  return InventoryLocationResponseSchema.parse(
    await browserMutation(
      `/inventory/locations/${locationId}/deactivate`,
      "POST",
      { expectedVersion },
    ),
  ).location;
}

export async function createMachine(
  input: CreateMachineRequest,
): Promise<Machine> {
  return MachineResponseSchema.parse(
    await browserCreate("/inventory/machines", input),
  ).machine;
}

export async function updateMachineIdentity(
  machineId: string,
  input: UpdateMachineIdentityRequest,
): Promise<Machine> {
  return MachineResponseSchema.parse(
    await browserMutation(
      `/inventory/machines/${machineId}/identity`,
      "PATCH",
      input,
    ),
  ).machine;
}

export async function verifyMachine(
  machineId: string,
  expectedVersion: number,
): Promise<Machine> {
  return MachineResponseSchema.parse(
    await browserMutation(`/inventory/machines/${machineId}/verify`, "POST", {
      expectedVersion,
    }),
  ).machine;
}

export async function relocateMachine(
  machineId: string,
  input: RelocateMachineRequest,
): Promise<Machine> {
  return MachineResponseSchema.parse(
    await browserMutation(
      `/inventory/machines/${machineId}/relocate`,
      "POST",
      input,
    ),
  ).machine;
}
