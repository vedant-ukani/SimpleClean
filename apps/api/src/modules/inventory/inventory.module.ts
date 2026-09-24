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
import { IntakeController } from "./intake/intake.controller.js";
import { IntakeRepository } from "./intake/intake.repository.js";
import { INTAKE_OPERATIONS, IntakeService } from "./intake/intake.service.js";
import { IntakeRecognitionRepository } from "./intake/recognition.repository.js";
import {
  INTAKE_OCR_VERIFIER,
  INTAKE_SEMANTIC_RECOGNIZER,
} from "./intake/recognition.ports.js";
import {
  createOcrVerifier,
  createSemanticRecognizer,
  INTAKE_RECOGNITION_REGISTRY,
  IntakeRecognitionService,
} from "./intake/recognition.service.js";
import { InternalEventHandlerRegistry } from "../operations/internal-event-dispatcher.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { CatalogEnrichmentService } from "./catalog-enrichment.service.js";

@Module({
  imports: [CatalogModule],
  controllers: [InventoryController, QrLabelController, IntakeController],
  providers: [
    InventoryRepository,
    InventoryService,
    CatalogEnrichmentService,
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
    IntakeRepository,
    IntakeService,
    { provide: INTAKE_OPERATIONS, useExisting: IntakeService },
    IntakeRecognitionRepository,
    IntakeRecognitionService,
    {
      provide: INTAKE_RECOGNITION_REGISTRY,
      useExisting: InternalEventHandlerRegistry,
    },
    {
      provide: INTAKE_SEMANTIC_RECOGNIZER,
      inject: [SERVER_CONFIG],
      useFactory: createSemanticRecognizer,
    },
    {
      provide: INTAKE_OCR_VERIFIER,
      inject: [SERVER_CONFIG],
      useFactory: createOcrVerifier,
    },
  ],
  exports: [INVENTORY_OPERATIONS, InventoryService, QrLabelService],
})
export class InventoryModule {}
