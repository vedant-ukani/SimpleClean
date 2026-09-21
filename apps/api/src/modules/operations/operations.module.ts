import { Global, Module, type DynamicModule } from "@nestjs/common";
import type { ServerConfig } from "@simply-clean/config";

import { SERVER_CONFIG, StructuredLogger } from "../../platform/logging.js";
import { InternalEventHandlerRegistry } from "./internal-event-dispatcher.js";
import {
  IDEMPOTENCY_COORDINATOR,
  INTERNAL_EVENT_DISPATCHER,
  MUTATION_RECORDER,
  OPERATIONS_CLOCK,
} from "./operations.ports.js";
import { OperationsController } from "./operations.controller.js";
import { OperationsRepository } from "./operations.repository.js";
import { OperationsService } from "./operations.service.js";
import { OperationsWorker } from "./operations.worker.js";

@Global()
@Module({})
export class OperationsModule {
  static register(config: ServerConfig): DynamicModule {
    return {
      global: true,
      module: OperationsModule,
      controllers: [OperationsController],
      providers: [
        { provide: SERVER_CONFIG, useValue: config },
        OperationsRepository,
        OperationsService,
        OperationsWorker,
        StructuredLogger,
        InternalEventHandlerRegistry,
        { provide: MUTATION_RECORDER, useExisting: OperationsRepository },
        {
          provide: IDEMPOTENCY_COORDINATOR,
          useExisting: OperationsRepository,
        },
        {
          provide: INTERNAL_EVENT_DISPATCHER,
          useExisting: InternalEventHandlerRegistry,
        },
        { provide: OPERATIONS_CLOCK, useValue: { now: () => new Date() } },
      ],
      exports: [
        SERVER_CONFIG,
        MUTATION_RECORDER,
        IDEMPOTENCY_COORDINATOR,
        INTERNAL_EVENT_DISPATCHER,
        OPERATIONS_CLOCK,
        OperationsRepository,
        OperationsService,
        OperationsWorker,
        InternalEventHandlerRegistry,
      ],
    };
  }
}
