import type { FileMediaType } from "@simply-clean/contracts";

export const STORAGE_ADAPTER = Symbol("STORAGE_ADAPTER");

export interface StorageObjectMetadata {
  byteCount: number;
  mediaType: FileMediaType;
  sha256: string;
}

export interface StorageObject extends StorageObjectMetadata {
  bytes: Buffer;
}

export interface StorageAdapter {
  put(
    key: string,
    bytes: Buffer,
    metadata: StorageObjectMetadata,
  ): Promise<void>;
  head(key: string): Promise<StorageObjectMetadata | undefined>;
  get(key: string): Promise<StorageObject | undefined>;
  delete(key: string): Promise<void>;
}
