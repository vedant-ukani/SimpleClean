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
import type { DatabaseExecutor } from "@simply-clean/database";
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
  createIntakeAnalysisImage,
  inspectContent,
  safeDownloadFilename,
  validateUploadGrantRequest,
  createIntakePreview,
  inspectStoredIntakePreview,
} from "./content-policy.js";
import {
  FilesRepository,
  type FileActorContext,
  type IntakeFileEvidence,
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
  findReadyPreliminaryEvidence(
    database: DatabaseExecutor,
    machineId: string,
    fileIds: readonly string[],
  ): Promise<FileAttachment[]>;
  findPreliminaryEvidenceByIds(
    database: DatabaseExecutor,
    fileIds: readonly string[],
  ): Promise<FileAttachment[]>;
  findIntakeEvidence(
    database: DatabaseExecutor,
    fileIds: string[],
    loadId?: string,
  ): Promise<IntakeFileEvidence[]>;
  getIntakeAnalysisImages(
    database: DatabaseExecutor,
    photos: readonly { photoId: string; fileId: string }[],
    loadId: string,
    limits?: IntakeAnalysisLimits,
  ): Promise<IntakeAnalysisImage[]>;
  getIntakeRecognitionImages(
    database: DatabaseExecutor,
    photos: readonly { photoId: string; fileId: string }[],
    loadId: string,
    limits?: IntakeAnalysisLimits,
  ): Promise<{ ocr: IntakeAnalysisImage[]; semantic: IntakeAnalysisImage[] }>;
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
  createPreviewGrant(
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
  downloadPreview(
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

export interface IntakeAnalysisLimits {
  maxImageBytes: number;
  maxBatchBytes: number;
  maxPixels: number;
}

export interface IntakeAnalysisImage {
  photoId: string;
  sourceChecksum: string;
  bytes: Buffer;
  mediaType: "image/jpeg";
  width: number;
  height: number;
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

  findReadyPreliminaryEvidence(
    database: DatabaseExecutor,
    machineId: string,
    fileIds: readonly string[],
  ): Promise<FileAttachment[]> {
    return this.repository.findPreliminaryEvidence(
      database,
      fileIds,
      machineId,
      true,
    );
  }

  findPreliminaryEvidenceByIds(
    database: DatabaseExecutor,
    fileIds: readonly string[],
  ): Promise<FileAttachment[]> {
    return this.repository.findPreliminaryEvidence(database, fileIds);
  }

  findIntakeEvidence(
    database: DatabaseExecutor,
    fileIds: string[],
    loadId?: string,
  ): Promise<IntakeFileEvidence[]> {
    return this.repository.findIntakeEvidence(database, fileIds, loadId);
  }

  async getIntakeAnalysisImages(
    database: DatabaseExecutor,
    photos: readonly { photoId: string; fileId: string }[],
    loadId: string,
    limits: IntakeAnalysisLimits = {
      maxImageBytes: 8 * 1024 * 1024,
      maxBatchBytes: 40 * 1024 * 1024,
      maxPixels: 20_000_000,
    },
  ): Promise<IntakeAnalysisImage[]> {
    return (
      await this.readIntakeImages(database, photos, loadId, limits, false)
    ).ocr;
  }

  async getIntakeRecognitionImages(
    database: DatabaseExecutor,
    photos: readonly { photoId: string; fileId: string }[],
    loadId: string,
    limits: IntakeAnalysisLimits = {
      maxImageBytes: 8 * 1024 * 1024,
      maxBatchBytes: 40 * 1024 * 1024,
      maxPixels: 20_000_000,
    },
  ): Promise<{ ocr: IntakeAnalysisImage[]; semantic: IntakeAnalysisImage[] }> {
    return this.readIntakeImages(database, photos, loadId, limits, true);
  }

  private async readIntakeImages(
    database: DatabaseExecutor,
    photos: readonly { photoId: string; fileId: string }[],
    loadId: string,
    limits: IntakeAnalysisLimits,
    includeSemantic: boolean,
  ): Promise<{ ocr: IntakeAnalysisImage[]; semantic: IntakeAnalysisImage[] }> {
    if (!photos.length) return { ocr: [], semantic: [] };
    const records = await this.repository.findIntakeAnalysisEvidence(
      database,
      photos.map((photo) => photo.fileId),
      loadId,
    );
    const recordsByFileId = new Map(
      records.map((record) => [record.id, record]),
    );
    const images: IntakeAnalysisImage[] = [];
    const semantic: IntakeAnalysisImage[] = [];
    let total = 0;
    let semanticTotal = 0;
    for (const photo of photos) {
      const record = recordsByFileId.get(photo.fileId);
      if (!record) throw new FilePolicyError("missing_analysis_bytes");
      const object = await this.storage.get(record.storageKey);
      if (!object) throw new FilePolicyError("missing_analysis_bytes");
      if (
        object.mediaType !== record.detectedMediaType ||
        object.byteCount !== record.byteCount ||
        object.sha256 !== record.sha256 ||
        createHash("sha256").update(object.bytes).digest("hex") !==
          record.sha256
      ) {
        throw new FilePolicyError("checksum_mismatch");
      }
      const converted = await createIntakeAnalysisImage(
        object.bytes,
        record.detectedMediaType,
        limits,
      );
      if (
        converted.bytes.byteLength > limits.maxImageBytes ||
        total + converted.bytes.byteLength > limits.maxBatchBytes
      ) {
        throw new FilePolicyError("size_exceeded");
      }
      total += converted.bytes.byteLength;
      images.push({
        photoId: photo.photoId,
        sourceChecksum: record.sha256,
        bytes: converted.bytes,
        mediaType: "image/jpeg",
        width: converted.width,
        height: converted.height,
      });
      if (includeSemantic) {
        if (
          !record.previewStorageKey ||
          !record.previewByteCount ||
          !record.previewSha256
        )
          throw new FilePolicyError("missing_analysis_bytes");
        const preview = await this.storage.get(record.previewStorageKey);
        if (!preview) throw new FilePolicyError("missing_analysis_bytes");
        if (
          preview.mediaType !== "image/jpeg" ||
          preview.byteCount !== record.previewByteCount ||
          preview.sha256 !== record.previewSha256 ||
          preview.bytes.byteLength !== record.previewByteCount ||
          createHash("sha256").update(preview.bytes).digest("hex") !==
            record.previewSha256
        )
          throw new FilePolicyError("checksum_mismatch");
        const dimensions = await inspectStoredIntakePreview(preview.bytes);
        if (
          preview.bytes.byteLength > limits.maxImageBytes ||
          semanticTotal + preview.bytes.byteLength > limits.maxBatchBytes
        )
          throw new FilePolicyError("size_exceeded");
        semanticTotal += preview.bytes.byteLength;
        semantic.push({
          photoId: photo.photoId,
          sourceChecksum: record.sha256,
          bytes: preview.bytes,
          mediaType: "image/jpeg",
          ...dimensions,
        });
      }
    }
    return { ocr: images, semantic };
  }

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
      const preview =
        input.purpose === "intake_evidence"
          ? await createIntakePreview(bytes, metadata.mediaType)
          : undefined;
      storageAttempted = true;
      await this.storage.put(file.storageKey, bytes, metadata);
      if (preview) {
        await this.storage.put(
          `${file.storageKey}/preview.jpg`,
          preview.bytes,
          {
            byteCount: preview.byteCount,
            mediaType: "image/jpeg",
            sha256: preview.sha256,
          },
        );
      }
      const head = await this.storage.head(file.storageKey);
      const previewHead = preview
        ? await this.storage.head(`${file.storageKey}/preview.jpg`)
        : undefined;
      if (
        !head ||
        head.byteCount !== metadata.byteCount ||
        head.mediaType !== metadata.mediaType ||
        head.sha256 !== metadata.sha256 ||
        (preview &&
          (!previewHead ||
            previewHead.byteCount !== preview.byteCount ||
            previewHead.mediaType !== "image/jpeg" ||
            previewHead.sha256 !== preview.sha256))
      ) {
        throw new FilePolicyError("storage_failed");
      }
      const ready = await this.repository.markReady(
        fileId,
        metadata,
        lease,
        context,
        preview
          ? {
              storageKey: `${file.storageKey}/preview.jpg`,
              byteCount: preview.byteCount,
              sha256: preview.sha256,
            }
          : undefined,
      );
      if (!ready) throw new ConflictException("File state changed");
      return publicFile(ready);
    } catch (error) {
      if (storageAttempted) {
        await this.deleteWithoutDisclosure(file.storageKey);
        await this.deleteWithoutDisclosure(`${file.storageKey}/preview.jpg`);
      }
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

  async createPreviewGrant(
    rawFileId: string,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<FileGrant> {
    this.assertPermission(identity, "files.read");
    const file = await this.requireFile(this.fileId(rawFileId));
    await this.validateTarget(file.target, identity);
    if (file.state !== "ready" || !file.previewStorageKey || !file.preview) {
      throw new ConflictException(
        "Only intake files with previews can be previewed",
      );
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = this.expires(this.config.fileDownloadGrantTtlSeconds);
    await this.repository.createPreviewGrant({
      fileId: file.id,
      tokenHash: hashToken(token),
      expiresAt,
      context,
    });
    return { fileId: file.id, token, expiresAt: expiresAt.toISOString() };
  }

  async downloadPreview(
    rawFileId: string,
    token: string | undefined,
    identity: IdentityUser,
    context: FileActorContext,
  ): Promise<DownloadedFile> {
    this.assertPermission(identity, "files.read");
    const file = await this.requireFile(this.fileId(rawFileId));
    await this.validateTarget(file.target, identity);
    if (
      !token ||
      !validToken(token) ||
      !file.previewStorageKey ||
      !file.preview
    ) {
      throw new ForbiddenException();
    }
    const consumed = await this.repository.consumeGrant({
      fileId: file.id,
      operation: "preview",
      tokenHash: hashToken(token),
      actorUserId: identity.id,
      sessionId: context.sessionId,
    });
    if (!consumed) throw new ForbiddenException();
    const object = await this.storage.get(file.previewStorageKey);
    const checksum = object
      ? createHash("sha256").update(object.bytes).digest("hex")
      : undefined;
    if (
      !object ||
      object.mediaType !== "image/jpeg" ||
      object.byteCount !== file.preview.byteCount ||
      object.sha256 !== file.preview.sha256 ||
      checksum !== file.preview.sha256
    ) {
      throw new InternalServerErrorException("Stored preview is unavailable");
    }
    await this.repository.recordPreview(file.id, context);
    return {
      bytes: object.bytes,
      mediaType: "image/jpeg",
      byteCount: object.byteCount,
      filename: "preview.jpg",
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
  const {
    storageKey,
    previewStorageKey: _previewStorageKey,
    ...metadata
  } = file;
  void storageKey;
  void _previewStorageKey;
  return metadata;
}
