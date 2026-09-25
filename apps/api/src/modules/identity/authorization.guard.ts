import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  roleHasPermission,
  type IdentityUser,
  type Permission,
} from "@laundrorama/contracts";
import type { Request } from "express";

import { BetterAuthAdapter } from "./better-auth.adapter.js";
import { IdentityRepository } from "./identity.repository.js";

const PERMISSION_METADATA = Symbol("PERMISSION_METADATA");
export const CURRENT_IDENTITY = Symbol("CURRENT_IDENTITY");
export const CURRENT_SESSION_ID = Symbol("CURRENT_SESSION_ID");

export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_METADATA, permission);

export function currentIdentityFromRequest(request: Request): IdentityUser {
  const identity = Reflect.get(request, CURRENT_IDENTITY) as
    IdentityUser | undefined;
  if (!identity) {
    throw new UnauthorizedException();
  }
  return identity;
}

export function currentSessionIdFromRequest(request: Request): string {
  const sessionId = Reflect.get(request, CURRENT_SESSION_ID) as
    string | undefined;
  if (!sessionId) throw new UnauthorizedException();
  return sessionId;
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(BetterAuthAdapter)
    private readonly authentication: BetterAuthAdapter,
    @Inject(IdentityRepository)
    private readonly identities: IdentityRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path === "/health/live" || request.path === "/health/ready") {
      return true;
    }
    const session = await this.authentication.getSession(request.headers);
    if (!session) {
      throw new UnauthorizedException();
    }
    const identity = await this.identities.findByUserId(session.user.id);
    if (!identity?.active) {
      await this.authentication.revokeUserSessions(session.user.id);
      throw new UnauthorizedException();
    }
    Reflect.set(request, CURRENT_IDENTITY, identity);
    Reflect.set(request, CURRENT_SESSION_ID, session.session.id);

    const required =
      this.reflector.getAllAndOverride<Permission>(PERMISSION_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? "platform.access";
    if (!roleHasPermission(identity.role, required)) {
      await this.identities.recordActivity({
        action: "authorization_denied",
        actorUserId: identity.id,
        subjectUserId: identity.id,
        requestId: typeof request.id === "string" ? request.id : "api-request",
      });
      throw new ForbiddenException();
    }
    return true;
  }
}
