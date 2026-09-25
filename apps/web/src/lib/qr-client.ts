import { parseWebServerEnvironment } from "@laundrorama/config";
import {
  QrLabelListResponseSchema,
  QrLabelResponseSchema,
  QrTokenSchema,
  ResolveQrLabelResponseSchema,
  type MachineDetail,
  type QrLabel,
  type ResolveQrLabelRequest,
} from "@laundrorama/contracts";

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

export function tokenFromPrintedQrValue(
  value: string,
  currentOrigin: string,
): string | undefined {
  if (value.trim() !== value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.origin !== currentOrigin ||
      url.pathname !== "/scan" ||
      url.search ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return tokenFromFragment(url.hash);
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
  readonly code: string | undefined;
  readonly machineIds: string[];

  constructor(
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(`QR label request failed with status ${status}`);
    this.name = "QrRequestError";
    const body =
      detail && typeof detail === "object"
        ? (detail as Record<string, unknown>)
        : undefined;
    this.code = typeof body?.code === "string" ? body.code : undefined;
    this.machineIds = Array.isArray(body?.machineIds)
      ? body.machineIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
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
  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.clone().json();
    } catch {
      // Preserve the status-only error when the server did not return JSON.
    }
    throw new QrRequestError(response.status, detail);
  }
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
  expectedLabelId: string,
  expectedVersion: number,
): Promise<QrLabel> {
  return QrLabelResponseSchema.parse(
    await idempotentBrowserMutation(
      `/inventory/machines/${machineId}/qr-labels/reissue`,
      { expectedLabelId, expectedVersion },
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
  };
}

export type IntakeQrLabelSheetPresentation = "opened" | "downloaded";

export async function downloadIntakeQrLabelSheet(
  batchId: string,
): Promise<IntakeQrLabelSheetPresentation> {
  let preview: Window | null = null;
  try {
    preview = window.open("", "_blank");
  } catch {
    // A blocked popup uses the download fallback after the PDF is ready.
  }
  try {
    const response = await request(
      `/api/inventory/intake/${encodeURIComponent(batchId)}/qr-label-sheet`,
      fetch,
      {
        method: "POST",
        headers: {
          accept: "application/pdf",
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: "{}",
      },
    );
    if (!response.headers.get("content-type")?.startsWith("application/pdf"))
      throw new Error("QR label sheet response was not PDF");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const filename =
      response.headers
        .get("content-disposition")
        ?.match(/filename="([^"]+)"/i)?.[1] ??
      "laundrorama-intake-qr-labels.pdf";
    let presentation: IntakeQrLabelSheetPresentation = "downloaded";
    if (preview) {
      try {
        preview.document.title = "Laundrorama QR label sheet";
        preview.document.body.style.margin = "0";
        const frame = preview.document.createElement("iframe");
        frame.title = "Laundrorama QR label sheet PDF";
        frame.src = url;
        frame.style.width = "100vw";
        frame.style.height = "100vh";
        frame.style.border = "0";
        preview.document.body.replaceChildren(frame);
        presentation = "opened";
      } catch {
        preview.close();
        preview = null;
      }
    }
    if (!preview) {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return presentation;
  } catch (error) {
    preview?.close();
    throw error;
  }
}
