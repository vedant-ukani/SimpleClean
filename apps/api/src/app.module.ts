import {
  Module,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
} from "@nestjs/common";
import type { ServerConfig } from "@simply-clean/config";

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
      imports: [DatabaseModule.register(config)],
      controllers: [HealthController],
      providers: [
        { provide: SERVER_CONFIG, useValue: config },
        HealthService,
        StructuredLogger,
        RequestLoggingMiddleware,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes("*");
  }
}
