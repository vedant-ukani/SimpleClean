import { z } from "zod";

export const LivenessResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
  timestamp: z.iso.datetime(),
});

export const ReadinessResponseSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  dependencies: z.object({
    database: z.enum(["up", "down"]),
  }),
  timestamp: z.iso.datetime(),
});

export type LivenessResponse = z.infer<typeof LivenessResponseSchema>;
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
