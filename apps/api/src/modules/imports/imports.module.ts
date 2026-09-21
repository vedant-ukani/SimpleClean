import { Module, type DynamicModule } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import type { ServerConfig } from "@simply-clean/config";
import { memoryStorage } from "multer";

import { InventoryModule } from "../inventory/inventory.module.js";
import { SERVER_CONFIG } from "../../platform/logging.js";
import { ImportsController } from "./imports.controller.js";
import { ImportsRepository } from "./imports.repository.js";
import { ImportsService } from "./imports.service.js";

@Module({})
export class ImportsModule {
  static register(config: ServerConfig): DynamicModule {
    return {
      module: ImportsModule,
      imports: [
        InventoryModule,
        MulterModule.register({
          storage: memoryStorage(),
          limits: { files: 1, fileSize: config.fileMaxBytes },
        }),
      ],
      controllers: [ImportsController],
      providers: [
        { provide: SERVER_CONFIG, useValue: config },
        ImportsRepository,
        ImportsService,
      ],
      exports: [ImportsService],
    };
  }
}
