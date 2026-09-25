import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { ServerConfig } from "@laundrorama/config";
import type { ApplicationRole } from "@laundrorama/contracts";
import { authSchema, type DatabaseConnection } from "@laundrorama/database";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";

import { DATABASE_CONNECTION } from "../../platform/database.module.js";
import { SERVER_CONFIG } from "../../platform/logging.js";
import { IdentityRepository } from "./identity.repository.js";

function requestId(headers: Headers | undefined): string {
  return headers?.get("x-request-id") ?? "auth-request";
}

@Injectable()
export class BetterAuthAdapter {
  readonly auth;

  constructor(
    @Inject(DATABASE_CONNECTION) connection: DatabaseConnection,
    @Inject(SERVER_CONFIG) config: ServerConfig,
    @Inject(IdentityRepository)
    private readonly identities: IdentityRepository,
  ) {
    this.auth = betterAuth({
      database: drizzleAdapter(connection.database, {
        provider: "pg",
        schema: authSchema,
      }),
      baseURL: config.authBaseUrl,
      basePath: "/auth",
      secret: config.authSecret,
      trustedOrigins: [config.authTrustedOrigin],
      emailAndPassword: {
        enabled: true,
        disableSignUp: true,
      },
      session: {
        expiresIn: config.authSessionDurationSeconds,
        updateAge: Math.min(3_600, config.authSessionDurationSeconds),
      },
      advanced: {
        defaultCookieAttributes: {
          httpOnly: true,
          sameSite: "lax",
          secure:
            config.nodeEnv === "staging" || config.nodeEnv === "production",
          path: "/",
        },
      },
      databaseHooks: {
        session: {
          create: {
            before: async (session) => {
              const identity = await this.identities.findByUserId(
                session.userId,
              );
              if (!identity?.active) {
                throw new APIError("UNAUTHORIZED", {
                  message: "Authentication failed",
                });
              }
              return { data: session };
            },
          },
          delete: {
            after: async (session, context) => {
              if (context?.path === "/sign-out") {
                await this.identities.recordActivity({
                  action: "signed_out",
                  actorUserId: session.userId,
                  subjectUserId: session.userId,
                  requestId: requestId(context.headers),
                });
              }
            },
          },
        },
      },
      hooks: {
        after: createAuthMiddleware(async (context) => {
          if (context.path === "/sign-in/email" && context.context.newSession) {
            await this.identities.recordActivity({
              action: "signed_in",
              actorUserId: context.context.newSession.user.id,
              subjectUserId: context.context.newSession.user.id,
              requestId: requestId(context.headers),
            });
          }
        }),
      },
    });
  }

  async getSession(headers: IncomingHttpHeaders) {
    return this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
  }

  async findUserByEmail(
    email: string,
  ): Promise<{ id: string; name: string; email: string } | undefined> {
    const context = await this.auth.$context;
    const result = await context.internalAdapter.findUserByEmail(email);
    return result?.user;
  }

  async createCredentialUser(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ id: string; name: string; email: string }> {
    const context = await this.auth.$context;
    if (await context.internalAdapter.findUserByEmail(input.email)) {
      throw new ConflictException("A user with that email already exists");
    }
    const password = await context.password.hash(input.password);
    const user = await context.internalAdapter.createUser(
      {
        name: input.name,
        email: input.email,
        emailVerified: true,
      },
      { method: "admin" },
    );
    try {
      await context.internalAdapter.linkAccount({
        providerId: "credential",
        accountId: user.id,
        userId: user.id,
        password,
      });
    } catch (error) {
      await context.internalAdapter.deleteUser(user.id);
      throw error;
    }
    return { id: user.id, name: user.name, email: user.email };
  }

  async deleteUser(userId: string): Promise<void> {
    const context = await this.auth.$context;
    await context.internalAdapter.deleteUser(userId);
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const context = await this.auth.$context;
    await context.internalAdapter.deleteUserSessions(userId);
  }

  async replacePassword(userId: string, password: string): Promise<void> {
    const context = await this.auth.$context;
    await context.internalAdapter.updatePassword(
      userId,
      await context.password.hash(password),
    );
  }

  async updateAuthUser(userId: string, data: { name: string }): Promise<void> {
    const context = await this.auth.$context;
    await context.internalAdapter.updateUser(userId, data);
  }
}

export interface ProvisionedUserInput {
  name: string;
  email: string;
  password: string;
  role: ApplicationRole;
}
