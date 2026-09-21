import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { ServerConfig } from "@simply-clean/config";
import {
  CreateFileUploadGrantRequestSchema,
  FileIdSchema,
  FileTargetSchema,
  roleHasPermission,
  type CreateFileUploadGrantRequest,
  type FileAttachment,
  type FileGrant,
  type FileTarget,
  type IdentityUser,
} from "@simply-clean/contracts";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  INVENTORY_OPERATIONS,
  type InventoryOperations,
} from "../inventory/inventory.service.js";
import {
  FilePolicyError,
  inspectContent,
  safeDownloadFilename,
  validateUploadGrantRequest,
} from "./content-policy.js";
import {
  FilesRepository,
  type FileActorContext,
  type PrivateFileAttachment,
} from "./files.repository.js";
import { STORAGE_ADAPTER, type StorageAdapter } from "./storage.adapter.js";

export const FILES_OPERATIONS = Symbol("FILES_OPERATIONS");
export const FILES_CONFIG = Symbol("FILES_CONFIG");

export interface DownloadedFile {
  bytes: Buffer;
  mediaType: string;
  byteCount: number;
  filename: string;
}

export interface FilesOperations {
  createUploadGrant(
    input: unknown,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<{ file: FileAttachment; grant: FileGrant }>;
  uploadContent(
    fileId: string,
    token: string | undefined,
    bytes: Buffer | undefined,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<FileAttachment>;
  list(input: unknown, identity: IdentityUser): Promise<FileAttachment[]>;
  createDownloadGrant(
    fileId: string,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<FileGrant>;
  downloadContent(
    fileId: string,
    token: string | undefined,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<DownloadedFile>;
  incomplete(identity: IdentityUser): Promise<FileAttachment[]>;
  abandon(
    fileId: string,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<FileAttachment>;
}

@Injectable()
export class FilesService implements FilesOperations {
  constructor(
    @Inject(FilesRepository) private readonly repository: FilesRepository,
    @Inject(INVENTORY_OPERATIONS)
    private readonly inventory: InventoryOperations,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @Inject(FILES_CONFIG) private readonly config: ServerConfig,
  ) {}

  async createUploadGrant(
    rawInput: unknown,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<{ file: FileAttachment; grant: FileGrant }> {
    const input = this.parse(CreateFileUploadGrantRequestSchema, rawInput);
    this.assertPermission(identity, "files.write");
    try {
      validateUploadGrantRequest(input, this.config.fileMaxBytes);
    } catch (error) {
      if (error instanceof FilePolicyError) {
        throw new BadRequestException({
          statusCode: 400,
          code: error.code,
          message: "File request did not satisfy policy",
        });
      }
      throw error;
    }
    await this.validateTarget(input.target, identity);
    const token = randomBytes(32).toString("base64url");
    const fileId = randomUUID();
    const expiresAt = this.expires(this.config.fileUploadGrantTtlSeconds);
    const file = await this.repository.createPendingUpload({
      fileId,
      storageKey: `${fileId}/${randomUUID()}`,
      request: input,
      tokenHash: hashToken(token),
      expiresAt,
      context,
    });
    return {
      file: publicFile(file),
      grant: { fileId, token, expiresAt: expiresAt.toISOString() },
    };
  }

  async uploadContent(
    rawFileId: string,
    token: string | undefined,
    bytes: Buffer | undefined,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<FileAttachment> {
    const fileId = this.fileId(rawFileId);
    const file = await this.requireFile(fileId);
    this.assertPermission(identity, "files.write");
    await this.validateTarget(file.target, identity);
    if (!token || !validToken(token)) throw new ForbiddenException();
    const lease = await this.repository.consumeGrant({
      fileId,
      operation: "upload",
      tokenHash: hashToken(token),
      actorUserId: identity.id,
      sessionId: context.sessionId,
      uploadLeaseExpiresAt: this.expires(this.config.fileUploadGrantTtlSeconds),
    });
    if (!lease) throw new ForbiddenException();

    const input: CreateFileUploadGrantRequest = {
      target: file.target,
      purpose: file.purpose,
      originalFilename: file.originalFilename,
      declaredMediaType: file.declaredMediaType,
      declaredByteCount: file.declaredByteCount,
    };
    let storageAttempted = false;
    try {
      if (!bytes) throw new FilePolicyError("unsupported_content");
      const metadata = inspectContent(input, bytes, this.config.fileMaxBytes);
      storageAttempted = true;
      await this.storage.put(file.storageKey, bytes, metadata);
      const head = await this.storage.head(file.storageKey);
      if (
        !head ||
        head.byteCount !== metadata.byteCount ||
        head.mediaType !== metadata.mediaType ||
        head.sha256 !== metadata.sha256
      ) {
        throw new FilePolicyError("storage_failed");
      }
      const ready = await this.repository.markReady(
        fileId,
        metadata,
        lease,
        context,
      );
      if (!ready) throw new ConflictException("File state changed");
      return publicFile(ready);
    } catch (error) {
      if (storageAttempted) await this.deleteWithoutDisclosure(file.storageKey);
      const failureCode =
        error instanceof FilePolicyError ? error.code : "storage_failed";
      await this.repository.markFailed(fileId, failureCode, lease, context);
      if (error instanceof FilePolicyError) {
        throw new BadRequestException({
          statusCode: 400,
          code: error.code,
          message: "File content did not satisfy policy",
        });
      }
      if (error instanceof ConflictException) throw error;
      throw new InternalServerErrorException("File upload failed safely");
    }
  }

  async list(
    rawTarget: unknown,
    identity: IdentityUser,
  ): Promise<FileAttachment[]> {
    this.assertPermission(identity, "files.read");
    const target = this.parse(FileTargetSchema, rawTarget);
    await this.validateTarget(target, identity);
    return (await this.repository.list(target)).map(publicFile);
  }

  async createDownloadGrant(
    rawFileId: string,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<FileGrant> {
    this.assertPermission(identity, "files.read");
    const file = await this.requireFile(this.fileId(rawFileId));
    await this.validateTarget(file.target, identity);
    if (file.state !== "ready") {
      throw new ConflictException("Only ready files can be downloaded");
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = this.expires(this.config.fileDownloadGrantTtlSeconds);
    await this.repository.createDownloadGrant({
      fileId: file.id,
      tokenHash: hashToken(token),
      expiresAt,
      context,
    });
    return { fileId: file.id, token, expiresAt: expiresAt.toISOString() };
  }

  async downloadContent(
    rawFileId: string,
    token: string | undefined,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<DownloadedFile> {
    this.assertPermission(identity, "files.read");
    const file = await this.requireFile(this.fileId(rawFileId));
    await this.validateTarget(file.target, identity);
    if (!token || !validToken(token)) throw new ForbiddenException();
    const consumed = await this.repository.consumeGrant({
      fileId: file.id,
      operation: "download",
      tokenHash: hashToken(token),
      actorUserId: identity.id,
      sessionId: context.sessionId,
    });
    if (!consumed) throw new ForbiddenException();
    const object = await this.storage.get(file.storageKey);
    const actualChecksum = object
      ? createHash("sha256").update(object.bytes).digest("hex")
      : undefined;
    if (
      !object ||
      object.byteCount !== file.byteCount ||
      object.mediaType !== file.detectedMediaType ||
      object.sha256 !== file.sha256 ||
      actualChecksum !== file.sha256
    ) {
      throw new InternalServerErrorException("Stored file is unavailable");
    }
    await this.repository.recordDownload(file.id, context);
    return {
      bytes: object.bytes,
      mediaType: object.mediaType,
      byteCount: object.byteCount,
      filename: safeDownloadFilename(file.originalFilename),
    };
  }

  async incomplete(identity: IdentityUser): Promise<FileAttachment[]> {
    this.assertPermission(identity, "files.manage");
    return (await this.repository.incomplete()).map(publicFile);
  }

  async abandon(
    rawFileId: string,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<FileAttachment> {
    this.assertPermission(identity, "files.manage");
    const file = await this.requireFile(this.fileId(rawFileId));
    if (file.state === "ready") {
      throw new ConflictException("Ready files cannot be cleaned up");
    }
    if (file.state === "abandoned") {
      await this.deleteWithoutDisclosure(file.storageKey, true);
      return publicFile(file);
    }
    const abandoned = await this.repository.abandon(
      file.id,
      file.version,
      context,
    );
    if (!abandoned) throw new ConflictException("File state changed");
    await this.deleteWithoutDisclosure(file.storageKey, true);
    return publicFile(abandoned);
  }

  private async validateTarget(
    target: FileTarget,
    identity: IdentityUser,
  ): Promise<void> {
    const permission =
      target.type === "machine"
        ? "inventory.machines.read"
        : "inventory.loads.read";
    if (!roleHasPermission(identity.role, permission)) {
      throw new ForbiddenException();
    }
    if (target.type === "machine") await this.inventory.getMachine(target.id);
    else await this.inventory.getLoad(target.id);
  }

  private assertPermission(
    identity: IdentityUser,
    permission: "files.read" | "files.write" | "files.manage",
  ): void {
    if (!roleHasPermission(identity.role, permission)) {
      throw new ForbiddenException();
    }
  }

  private async requireFile(fileId: string): Promise<PrivateFileAttachment> {
    const file = await this.repository.find(fileId);
    if (!file) throw new NotFoundException("File not found");
    return file;
  }

  private fileId(input: string): string {
    const result = FileIdSchema.safeParse(input);
    if (!result.success) throw new BadRequestException("Invalid file ID");
    return result.data;
  }

  private parse<T>(
    schema: {
      safeParse(
        input: unknown,
      ): { success: true; data: T } | { success: false };
    },
    input: unknown,
  ): T {
    const result = schema.safeParse(input);
    if (!result.success) throw new BadRequestException("Invalid request");
    return result.data;
  }

  private expires(ttlSeconds: number): Date {
    return new Date(Date.now() + ttlSeconds * 1_000);
  }

  private async deleteWithoutDisclosure(
    storageKey: string,
    failClosed = false,
  ): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch {
      if (failClosed) {
        throw new InternalServerErrorException("File cleanup failed safely");
      }
    }
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function validToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

function publicFile(file: PrivateFileAttachment): FileAttachment {
  const { storageKey, ...metadata } = file;
  void storageKey;
  return metadata;
}
