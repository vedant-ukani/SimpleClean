import {
  Module,
  RequestMethod,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import type { ServerConfig } from "@simply-clean/config";
import { json, urlencoded } from "express";

import { AuthHandlerMiddleware } from "./modules/identity/auth.middleware.js";
import { FilesModule } from "./modules/files/files.module.js";
import { PrivateStorageModule } from "./modules/files/private-storage.module.js";
import { AuthorizationGuard } from "./modules/identity/authorization.guard.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { InventoryModule } from "./modules/inventory/inventory.module.js";
import { ImportsModule } from "./modules/imports/imports.module.js";
import { OperationsModule } from "./modules/operations/operations.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { ProductionModule } from "./modules/production/production.module.js";
import { DatabaseModule } from "./platform/database.module.js";
import { HealthController } from "./platform/health.controller.js";
import { HealthService } from "./platform/health.service.js";
import {
  RequestLoggingMiddleware,
  SERVER_CONFIG,
  StructuredLogger,
} from "./platform/logging.js";

@Module({})
export class AppModule implements NestModule {
  static register(config: ServerConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.register(config),
        PrivateStorageModule.register(config),
        OperationsModule.register(config),
        IdentityModule.register(config),
        CatalogModule,
        InventoryModule,
        FilesModule.register(config),
        ProductionModule,
        ImportsModule.register(config),
      ],
      controllers: [HealthController],
      providers: [
        { provide: SERVER_CONFIG, useValue: config },
        HealthService,
        StructuredLogger,
        RequestLoggingMiddleware,
        { provide: APP_GUARD, useExisting: AuthorizationGuard },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes("*");
    consumer.apply(AuthHandlerMiddleware).forRoutes({
      path: "auth/*path",
      method: RequestMethod.ALL,
    });
    consumer
      .apply(json(), urlencoded({ extended: false }))
      .exclude({ path: "auth/*path", method: RequestMethod.ALL })
      .forRoutes("*");
  }
}
