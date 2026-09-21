import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import type { ServerConfig } from "@simply-clean/config";

import type {
  StorageAdapter,
  StorageObject,
  StorageObjectMetadata,
} from "./storage.adapter.js";

export interface S3CommandClient {
  send(command: object): Promise<unknown>;
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3CommandClient;
  private readonly bucket: string;

  constructor(config: ServerConfig, client?: S3CommandClient) {
    if (!config.fileS3Bucket || !config.fileS3Region) {
      throw new Error("S3 file storage configuration is incomplete");
    }
    this.bucket = config.fileS3Bucket;
    this.client =
      client ??
      new S3Client({
        region: config.fileS3Region,
        ...(config.fileS3Endpoint ? { endpoint: config.fileS3Endpoint } : {}),
        forcePathStyle: config.fileS3ForcePathStyle,
        ...(config.fileS3AccessKeyId && config.fileS3SecretAccessKey
          ? {
              credentials: {
                accessKeyId: config.fileS3AccessKeyId,
                secretAccessKey: config.fileS3SecretAccessKey,
              },
            }
          : {}),
      });
  }

  async put(
    key: string,
    bytes: Buffer,
    metadata: StorageObjectMetadata,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ACL: "private",
        ContentType: metadata.mediaType,
        ContentLength: metadata.byteCount,
        Metadata: { sha256: metadata.sha256 },
      }),
    );
  }

  async head(key: string): Promise<StorageObjectMetadata | undefined> {
    try {
      const output = (await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )) as HeadObjectCommandOutput;
      if (
        output.ContentLength === undefined ||
        !output.ContentType ||
        !output.Metadata?.sha256
      ) {
        throw new Error("Stored object metadata is incomplete");
      }
      return {
        byteCount: output.ContentLength,
        mediaType: output.ContentType,
        sha256: output.Metadata.sha256,
      };
    } catch (error) {
      if (notFound(error)) return undefined;
      throw error;
    }
  }

  async get(key: string): Promise<StorageObject | undefined> {
    try {
      const output = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )) as GetObjectCommandOutput;
      if (!output.Body) throw new Error("Stored object body is missing");
      const bytes = Buffer.from(await output.Body.transformToByteArray());
      const head = await this.head(key);
      if (!head) return undefined;
      return { ...head, bytes };
    } catch (error) {
      if (notFound(error)) return undefined;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

function notFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("name" in error && error.name === "NotFound") ||
      ("$metadata" in error &&
        typeof error.$metadata === "object" &&
        error.$metadata !== null &&
        "httpStatusCode" in error.$metadata &&
        error.$metadata.httpStatusCode === 404))
  );
}
