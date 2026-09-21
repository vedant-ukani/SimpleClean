import { z } from "zod";

import { ApplicationRoleSchema, PermissionSchema } from "./authorization.js";

export const IdentityUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  role: ApplicationRoleSchema,
  active: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const IdentityUserIdSchema = z.string().min(1).max(128);

export const CurrentIdentityResponseSchema = z.object({
  user: IdentityUserSchema,
  permissions: z.array(PermissionSchema),
});

export const IdentityUserListResponseSchema = z.object({
  users: z.array(IdentityUserSchema),
});

export const CreateIdentityUserRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email(),
  password: z.string().min(8).max(128),
  role: ApplicationRoleSchema,
});

export const ChangeIdentityRoleRequestSchema = z.object({
  role: ApplicationRoleSchema,
  expectedVersion: z.number().int().positive(),
});

export const ChangeIdentityActiveRequestSchema = z.object({
  active: z.boolean(),
  expectedVersion: z.number().int().positive(),
});

export const IdentityUserResponseSchema = z.object({
  user: IdentityUserSchema,
});

export const RevokeIdentitySessionsResponseSchema = z.object({
  revoked: z.literal(true),
});

export const IdentitySecurityActionSchema = z.enum([
  "signed_in",
  "signed_out",
  "user_created",
  "role_changed",
  "user_activated",
  "user_deactivated",
  "sessions_revoked",
  "user_provisioned",
  "authorization_denied",
]);

export type IdentityUser = z.infer<typeof IdentityUserSchema>;
export type CurrentIdentityResponse = z.infer<
  typeof CurrentIdentityResponseSchema
>;
export type IdentityUserListResponse = z.infer<
  typeof IdentityUserListResponseSchema
>;
export type CreateIdentityUserRequest = z.infer<
  typeof CreateIdentityUserRequestSchema
>;
export type ChangeIdentityRoleRequest = z.infer<
  typeof ChangeIdentityRoleRequestSchema
>;
export type ChangeIdentityActiveRequest = z.infer<
  typeof ChangeIdentityActiveRequestSchema
>;
export type IdentitySecurityAction = z.infer<
  typeof IdentitySecurityActionSchema
>;
