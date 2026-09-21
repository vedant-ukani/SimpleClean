import { Module } from "@nestjs/common";
import type { ServerConfig } from "@simply-clean/config";

import { SERVER_CONFIG } from "../../platform/logging.js";

import { InventoryController } from "./inventory.controller.js";
import { InventoryRepository } from "./inventory.repository.js";
import { INVENTORY_OPERATIONS, InventoryService } from "./inventory.service.js";
import { QrLabelController } from "./qr/qr-label.controller.js";
import { QrLabelRepository } from "./qr/qr-label.repository.js";
import { QrLabelRenderer } from "./qr/qr-label.renderer.js";
import {
  QR_PLATFORM_PUBLIC_ORIGIN,
  QrLabelService,
} from "./qr/qr-label.service.js";
import { QrLabelSigner } from "./qr/qr-label.signer.js";

@Module({
  controllers: [InventoryController, QrLabelController],
  providers: [
    InventoryRepository,
    InventoryService,
    QrLabelRepository,
    QrLabelRenderer,
    QrLabelService,
    {
      provide: QrLabelSigner,
      inject: [SERVER_CONFIG],
      useFactory: (config: ServerConfig) =>
        new QrLabelSigner(config.qrSigningSecret),
    },
    {
      provide: QR_PLATFORM_PUBLIC_ORIGIN,
      inject: [SERVER_CONFIG],
      useFactory: (config: ServerConfig) => config.platformPublicOrigin,
    },
    { provide: INVENTORY_OPERATIONS, useExisting: InventoryService },
  ],
  exports: [INVENTORY_OPERATIONS, InventoryService, QrLabelService],
})
export class InventoryModule {}
