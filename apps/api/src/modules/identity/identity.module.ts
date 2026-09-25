import { Global, Module, type DynamicModule } from "@nestjs/common";
import type { ServerConfig } from "@laundrorama/config";

import { SERVER_CONFIG } from "../../platform/logging.js";

import { AuthHandlerMiddleware } from "./auth.middleware.js";
import { AuthorizationGuard } from "./authorization.guard.js";
import { BetterAuthAdapter } from "./better-auth.adapter.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityRepository } from "./identity.repository.js";
import { IdentityService } from "./identity.service.js";

@Global()
@Module({})
export class IdentityModule {
  static register(config: ServerConfig): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [IdentityController],
      providers: [
        { provide: SERVER_CONFIG, useValue: config },
        IdentityRepository,
        BetterAuthAdapter,
        IdentityService,
        AuthHandlerMiddleware,
        AuthorizationGuard,
      ],
      exports: [
        AuthHandlerMiddleware,
        AuthorizationGuard,
        BetterAuthAdapter,
        IdentityService,
      ],
    };
  }
}
