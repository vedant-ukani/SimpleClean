import { Global, Module, type DynamicModule } from "@nestjs/common";
import type { ServerConfig } from "@simply-clean/config";

import { LocalStorageAdapter } from "./local-storage.adapter.js";
import { S3StorageAdapter } from "./s3-storage.adapter.js";
import { STORAGE_ADAPTER, type StorageAdapter } from "./storage.adapter.js";

@Global()
@Module({})
export class PrivateStorageModule {
  static register(config: ServerConfig): DynamicModule {
    return {
      global: true,
      module: PrivateStorageModule,
      providers: [
        {
          provide: STORAGE_ADAPTER,
          useFactory(): StorageAdapter {
            return config.fileStorageDriver === "s3"
              ? new S3StorageAdapter(config)
              : new LocalStorageAdapter(config.fileLocalDirectory);
          },
        },
      ],
      exports: [STORAGE_ADAPTER],
    };
  }
}
