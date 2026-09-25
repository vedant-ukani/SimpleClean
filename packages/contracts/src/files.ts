import { z } from "zod";

export const FILE_PURPOSES = [
  "nameplate",
  "arrival_condition",
  "document",
  "receipt",
  "other",
  "intake_evidence",
  "preliminary_inspection",
  "production_test_evidence",
  "production_test_video",
] as const;
export const FILE_STATES = [
  "pending_upload",
  "ready",
  "failed",
  "abandoned",
] as const;
export const FILE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
export const FILE_TARGET_TYPES = ["machine", "load"] as const;

export const FilePurposeSchema = z.enum(FILE_PURPOSES);
export const FileStateSchema = z.enum(FILE_STATES);
export const FileMediaTypeSchema = z.enum(FILE_MEDIA_TYPES);
export const FileTargetTypeSchema = z.enum(FILE_TARGET_TYPES);
export const FileIdSchema = z.uuid();

const TimestampSchema = z.iso.datetime();
export const FileTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("machine"), id: z.uuid() }),
  z.object({ type: z.literal("load"), id: z.uuid() }),
]);

export const FileAttachmentSchema = z.object({
  id: FileIdSchema,
  target: FileTargetSchema,
  purpose: FilePurposeSchema,
  originalFilename: z.string().min(1).max(255),
  declaredMediaType: FileMediaTypeSchema,
  detectedMediaType: FileMediaTypeSchema.nullable(),
  declaredByteCount: z.number().int().nonnegative(),
  byteCount: z.number().int().nonnegative().nullable(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  uploaderUserId: z.string().min(1),
  state: FileStateSchema,
  failureCode: z.string().max(80).nullable(),
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  preview: z
    .object({
      mediaType: z.literal("image/jpeg"),
      byteCount: z.number().int().positive(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .nullable()
    .optional(),
});

export const CreateFileUploadGrantRequestSchema = z.object({
  target: FileTargetSchema,
  purpose: FilePurposeSchema,
  originalFilename: z.string().trim().min(1).max(255),
  declaredMediaType: FileMediaTypeSchema,
  declaredByteCount: z.number().int().nonnegative(),
});

export const FileGrantSchema = z.object({
  fileId: FileIdSchema,
  token: z.string().min(43),
  expiresAt: TimestampSchema,
});

export const FileAttachmentResponseSchema = z.object({
  file: FileAttachmentSchema,
});
export const FileAttachmentListResponseSchema = z.object({
  files: z.array(FileAttachmentSchema),
});
export const FileUploadGrantResponseSchema = z.object({
  file: FileAttachmentSchema,
  grant: FileGrantSchema,
});
export const FileDownloadGrantResponseSchema = z.object({
  grant: FileGrantSchema,
});
export const FileIncompleteReviewResponseSchema = z.object({
  files: z.array(FileAttachmentSchema),
});

export type FilePurpose = z.infer<typeof FilePurposeSchema>;
export type FileState = z.infer<typeof FileStateSchema>;
export type FileMediaType = z.infer<typeof FileMediaTypeSchema>;
export type FileTarget = z.infer<typeof FileTargetSchema>;
export type FileAttachment = z.infer<typeof FileAttachmentSchema>;
export type CreateFileUploadGrantRequest = z.infer<
  typeof CreateFileUploadGrantRequestSchema
>;
export type FileGrant = z.infer<typeof FileGrantSchema>;
