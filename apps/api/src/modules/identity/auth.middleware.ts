import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { toNodeHandler } from "better-auth/node";

import { BetterAuthAdapter } from "./better-auth.adapter.js";

@Injectable()
export class AuthHandlerMiddleware implements NestMiddleware {
  private readonly handler;

  constructor(@Inject(BetterAuthAdapter) authentication: BetterAuthAdapter) {
    this.handler = toNodeHandler(authentication.auth);
  }

  use(request: Request, response: Response, next: NextFunction): void {
    void this.handler(request, response).catch(next);
  }
}
