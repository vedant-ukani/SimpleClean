import { parseWebServerEnvironment } from "@simply-clean/config";
import {
  QrLabelListResponseSchema,
  QrLabelResponseSchema,
  QrTokenSchema,
  ResolveQrLabelResponseSchema,
  type MachineDetail,
  type QrLabel,
  type ResolveQrLabelRequest,
} from "@simply-clean/contracts";

export function tokenFromFragment(hash: string): string | undefined {
  if (!hash.startsWith("#") || hash.length === 1) return undefined;
  try {
    const parsed = QrTokenSchema.safeParse(
      decodeURIComponent(hash.slice(1)).trim(),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function fallbackCodeForLookup(input: string): string {
  return input.trim().toUpperCase().replaceAll(/[-\s]/g, "");
}

export function loginPathForScanToken(token: string): string | undefined {
  const parsed = QrTokenSchema.safeParse(token);
  return parsed.success ? `/login#${parsed.data}` : undefined;
}

export function scanReturnPathFromLoginHash(hash: string): string | undefined {
  const token = tokenFromFragment(hash);
  return token ? `/scan#${token}` : undefined;
}

export class QrRequestError extends Error {
  constructor(readonly status: number) {
    super(`QR label request failed with status ${status}`);
    this.name = "QrRequestError";
  }
}

async function request(
  url: string,
  fetcher: typeof fetch,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetcher(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers: { ...init.headers },
  });
  if (!response.ok) throw new QrRequestError(response.status);
  return response;
}

async function requestJson(
  url: string,
  fetcher: typeof fetch,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await request(url, fetcher, {
    ...init,
    headers: { accept: "application/json", ...init.headers },
  });
  return response.json();
}

function serverUrl(
  path: string,
  environment: Record<string, string | undefined>,
): string {
  return `${parseWebServerEnvironment(environment).apiBaseUrl}${path}`;
}

export async function listMachineQrLabels(
  machineId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<QrLabel[]> {
  return QrLabelListResponseSchema.parse(
    await requestJson(
      serverUrl(`/inventory/machines/${machineId}/qr-labels`, environment),
      fetcher,
      cookie ? { headers: { cookie } } : {},
    ),
  ).labels;
}

export async function listMachineQrLabelsInBrowser(
  machineId: string,
): Promise<QrLabel[]> {
  return QrLabelListResponseSchema.parse(
    await requestJson(`/api/inventory/machines/${machineId}/qr-labels`, fetch),
  ).labels;
}

async function browserMutation(
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<unknown> {
  return requestJson(`/api${path}`, fetch, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function idempotentBrowserMutation(
  path: string,
  body: unknown,
): Promise<unknown> {
  const idempotencyKey = crypto.randomUUID();
  try {
    return await browserMutation(path, body, idempotencyKey);
  } catch (error) {
    if (error instanceof QrRequestError) throw error;
    return browserMutation(path, body, idempotencyKey);
  }
}

export async function createQrLabel(machineId: string): Promise<QrLabel> {
  return QrLabelResponseSchema.parse(
    await idempotentBrowserMutation(
      `/inventory/machines/${machineId}/qr-labels`,
      {},
    ),
  ).label;
}

export async function revokeQrLabel(
  labelId: string,
  expectedVersion: number,
): Promise<QrLabel> {
  return QrLabelResponseSchema.parse(
    await browserMutation(`/inventory/qr-labels/${labelId}/revoke`, {
      expectedVersion,
    }),
  ).label;
}

export async function reissueQrLabel(
  machineId: string,
  expectedVersion: number,
): Promise<QrLabel> {
  return QrLabelResponseSchema.parse(
    await idempotentBrowserMutation(
      `/inventory/machines/${machineId}/qr-labels/reissue`,
      { expectedVersion },
    ),
  ).label;
}

export async function resolveQrLabel(
  input: ResolveQrLabelRequest,
): Promise<MachineDetail> {
  return ResolveQrLabelResponseSchema.parse(
    await browserMutation("/inventory/qr-labels/resolve", input),
  );
}

export interface PrintableQrLabel {
  blob: Blob;
  filename: string;
}

function printFilename(disposition: string | null): string {
  const candidate = disposition?.match(/filename="([^"]+)"/i)?.[1];
  return candidate && /^simply-clean-equipment-[0-9A-Z-]+\.svg$/.test(candidate)
    ? candidate
    : "simply-clean-equipment-label.svg";
}

export async function getPrintableQrLabel(
  labelId: string,
): Promise<PrintableQrLabel> {
  const response = await request(
    `/api/inventory/qr-labels/${labelId}/print`,
    fetch,
    { headers: { accept: "image/svg+xml" } },
  );
  if (!response.headers.get("content-type")?.startsWith("image/svg+xml")) {
    throw new Error("QR label print response was not SVG");
  }
  return {
    blob: await response.blob(),
    filename: printFilename(response.headers.get("content-disposition")),
  };
}

export async function downloadQrLabel(labelId: string): Promise<void> {
  const printable = await getPrintableQrLabel(labelId);
  const url = URL.createObjectURL(printable.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = printable.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
