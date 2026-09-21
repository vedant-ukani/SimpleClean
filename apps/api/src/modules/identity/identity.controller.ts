import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { IdentityUserIdSchema } from "@simply-clean/contracts";
import type { Request } from "express";

import {
  currentIdentityFromRequest,
  RequirePermission,
} from "./authorization.guard.js";
import { IdentityService } from "./identity.service.js";

@Controller("identity")
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identities: IdentityService,
  ) {}

  @Get("me")
  @RequirePermission("identity.self.read")
  current(@Req() request: Request) {
    return this.identities.current(currentIdentityFromRequest(request));
  }

  @Get("users")
  @RequirePermission("identity.users.read")
  async list() {
    return { users: await this.identities.listUsers() };
  }

  @Post("users")
  @RequirePermission("identity.users.manage")
  async create(@Req() request: Request, @Body() body: unknown) {
    const actor = currentIdentityFromRequest(request);
    return {
      user: await this.identities.createUser(body, {
        actorUserId: actor.id,
        requestId: this.requestId(request),
      }),
    };
  }

  @Patch("users/:userId/role")
  @RequirePermission("identity.users.manage")
  async changeRole(
    @Req() request: Request,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    const actor = currentIdentityFromRequest(request);
    const validUserId = this.userId(userId);
    return {
      user: await this.identities.changeRole(validUserId, body, {
        actorUserId: actor.id,
        requestId: this.requestId(request),
      }),
    };
  }

  @Patch("users/:userId/active")
  @RequirePermission("identity.users.manage")
  async changeActive(
    @Req() request: Request,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    const actor = currentIdentityFromRequest(request);
    const validUserId = this.userId(userId);
    return {
      user: await this.identities.changeActive(validUserId, body, {
        actorUserId: actor.id,
        requestId: this.requestId(request),
      }),
    };
  }

  @Post("users/:userId/revoke-sessions")
  @RequirePermission("identity.users.manage")
  async revokeSessions(
    @Req() request: Request,
    @Param("userId") userId: string,
  ) {
    const actor = currentIdentityFromRequest(request);
    const validUserId = this.userId(userId);
    await this.identities.revokeSessions(validUserId, {
      actorUserId: actor.id,
      requestId: this.requestId(request),
    });
    return { revoked: true as const };
  }

  private requestId(request: Request): string {
    return typeof request.id === "string" ? request.id : "api-request";
  }

  private userId(input: string): string {
    const result = IdentityUserIdSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException("Invalid user ID");
    }
    return result.data;
  }
}
