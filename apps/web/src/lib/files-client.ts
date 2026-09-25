import { parseWebServerEnvironment } from "@laundrorama/config";
import {
  FileAttachmentListResponseSchema,
  FileAttachmentResponseSchema,
  FileDownloadGrantResponseSchema,
  FileUploadGrantResponseSchema,
  type CreateFileUploadGrantRequest,
  type FileAttachment,
  type FileTarget,
} from "@laundrorama/contracts";

export class FileRequestError extends Error {
  constructor(readonly status: number) {
    super(`File request failed with status ${status}`);
    this.name = "FileRequestError";
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
  if (!response.ok) throw new FileRequestError(response.status);
  return response.json();
}

function targetQuery(target: FileTarget): string {
  const name = target.type === "machine" ? "machineId" : "loadId";
  return `${name}=${encodeURIComponent(target.id)}`;
}

export async function getFiles(
  target: FileTarget,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<FileAttachment[]> {
  const base = parseWebServerEnvironment(environment).apiBaseUrl;
  return FileAttachmentListResponseSchema.parse(
    await requestJson(`${base}/files?${targetQuery(target)}`, fetcher, {
      ...(cookie ? { headers: { cookie } } : {}),
    }),
  ).files;
}

export async function createFileUploadGrant(
  input: CreateFileUploadGrantRequest,
) {
  return FileUploadGrantResponseSchema.parse(
    await requestJson("/api/files/upload-grants", fetch, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getBrowserFiles(
  target: FileTarget,
): Promise<FileAttachment[]> {
  return FileAttachmentListResponseSchema.parse(
    await requestJson(`/api/files?${targetQuery(target)}`, fetch),
  ).files;
}

export async function uploadFileContent(
  fileId: string,
  grant: string,
  file: File,
): Promise<FileAttachment> {
  const form = new FormData();
  form.set("file", file);
  return FileAttachmentResponseSchema.parse(
    await requestJson(`/api/files/${fileId}/upload-content`, fetch, {
      method: "POST",
      headers: { "x-file-grant": grant },
      body: form,
    }),
  ).file;
}

export async function createFileDownloadUrl(fileId: string): Promise<string> {
  const { grant } = FileDownloadGrantResponseSchema.parse(
    await requestJson(`/api/files/${fileId}/download-grants`, fetch, {
      method: "POST",
    }),
  );
  return `/api/files/${fileId}/download-content?grant=${encodeURIComponent(grant.token)}`;
}
