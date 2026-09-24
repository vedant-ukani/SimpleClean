import { Global, Module, type DynamicModule } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import type { ServerConfig } from "@simply-clean/config";
import { memoryStorage } from "multer";

import { InventoryModule } from "../inventory/inventory.module.js";
import { FilesController } from "./files.controller.js";
import { FilesRepository } from "./files.repository.js";
import {
  FILES_CONFIG,
  FILES_OPERATIONS,
  FilesService,
} from "./files.service.js";

@Global()
@Module({})
export class FilesModule {
  static register(config: ServerConfig): DynamicModule {
    return {
      module: FilesModule,
      imports: [
        InventoryModule,
        MulterModule.register({
          storage: memoryStorage(),
          limits: { files: 1, fileSize: config.fileMaxBytes },
        }),
      ],
      controllers: [FilesController],
      providers: [
        { provide: FILES_CONFIG, useValue: config },
        FilesRepository,
        FilesService,
        { provide: FILES_OPERATIONS, useExisting: FilesService },
      ],
      exports: [FILES_OPERATIONS, FilesService],
    };
  }
}
