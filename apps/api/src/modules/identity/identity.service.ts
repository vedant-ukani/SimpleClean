import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ChangeIdentityActiveRequestSchema,
  ChangeIdentityRoleRequestSchema,
  CreateIdentityUserRequestSchema,
  permissionsForRole,
  type CurrentIdentityResponse,
  type IdentityUser,
} from "@simply-clean/contracts";

import {
  BetterAuthAdapter,
  type ProvisionedUserInput,
} from "./better-auth.adapter.js";
import { IdentityRepository } from "./identity.repository.js";

export interface SecurityActivityContext {
  actorUserId?: string;
  requestId: string;
}

@Injectable()
export class IdentityService {
  constructor(
    @Inject(IdentityRepository)
    private readonly repository: IdentityRepository,
    @Inject(BetterAuthAdapter)
    private readonly authentication: BetterAuthAdapter,
  ) {}

  current(identity: IdentityUser): CurrentIdentityResponse {
    return {
      user: identity,
      permissions: [...permissionsForRole(identity.role)],
    };
  }

  async listUsers(): Promise<IdentityUser[]> {
    return this.repository.list();
  }

  async createUser(
    rawInput: unknown,
    context: SecurityActivityContext,
  ): Promise<IdentityUser> {
    const input = this.parse(CreateIdentityUserRequestSchema, rawInput);
    const authUser = await this.authentication.createCredentialUser(input);
    try {
      const identity = await this.repository.createProfile(
        authUser.id,
        input.role,
        this.activity(context),
      );
      return identity;
    } catch (error) {
      await this.authentication.deleteUser(authUser.id);
      throw error;
    }
  }

  async changeRole(
    userId: string,
    rawInput: unknown,
    context: SecurityActivityContext,
  ): Promise<IdentityUser> {
    const input = this.parse(ChangeIdentityRoleRequestSchema, rawInput);
    const result = await this.repository.changeRole({
      userId,
      ...input,
      activity: this.activity(context),
    });
    return this.resolveMutation(result);
  }

  async changeActive(
    userId: string,
    rawInput: unknown,
    context: SecurityActivityContext,
  ): Promise<IdentityUser> {
    const input = this.parse(ChangeIdentityActiveRequestSchema, rawInput);
    const result = await this.repository.changeActive({
      userId,
      ...input,
      activity: this.activity(context),
    });
    return this.resolveMutation(result);
  }

  async revokeSessions(
    userId: string,
    context: SecurityActivityContext,
  ): Promise<void> {
    if (
      !(await this.repository.revokeSessions(userId, this.activity(context)))
    ) {
      throw new NotFoundException("User not found");
    }
  }

  async provisionUser(
    input: ProvisionedUserInput,
    context: SecurityActivityContext,
  ): Promise<IdentityUser> {
    const normalized = CreateIdentityUserRequestSchema.parse(input);
    const existingAuth = await this.authentication.findUserByEmail(
      normalized.email,
    );
    if (!existingAuth) {
      return this.createUser(normalized, context);
    }
    await this.authentication.updateAuthUser(existingAuth.id, {
      name: normalized.name,
    });
    await this.authentication.replacePassword(
      existingAuth.id,
      normalized.password,
    );
    const profile = await this.repository.findByUserId(existingAuth.id);
    if (!profile) {
      const created = await this.repository.createProfile(
        existingAuth.id,
        normalized.role,
        this.activity(context),
      );
      return created;
    }
    let updated = profile;
    if (updated.role !== normalized.role) {
      updated = await this.changeRole(
        updated.id,
        { role: normalized.role, expectedVersion: updated.version },
        context,
      );
    }
    if (!updated.active) {
      updated = await this.changeActive(
        updated.id,
        { active: true, expectedVersion: updated.version },
        context,
      );
    }
    await this.repository.recordProvisioning(
      updated.id,
      this.activity(context),
    );
    return (await this.repository.findByUserId(updated.id)) ?? updated;
  }

  private activity(context: SecurityActivityContext): {
    actorUserId?: string;
    requestId: string;
  } {
    return {
      ...(context.actorUserId ? { actorUserId: context.actorUserId } : {}),
      requestId: context.requestId,
    };
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
    if (!result.success) {
      throw new BadRequestException("Invalid request");
    }
    return result.data;
  }

  private resolveMutation(
    result: Awaited<ReturnType<IdentityRepository["changeRole"]>>,
  ): IdentityUser {
    if (result.status === "updated") {
      return result.user;
    }
    if (result.status === "not_found") {
      throw new NotFoundException("User not found");
    }
    if (result.status === "version_conflict") {
      throw new ConflictException("User was changed by another request");
    }
    throw new ConflictException(
      "The final active Owner Admin cannot be changed",
    );
  }
}
