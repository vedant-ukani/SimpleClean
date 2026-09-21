import { Module } from "@nestjs/common";

import { InventoryController } from "./inventory.controller.js";
import { InventoryRepository } from "./inventory.repository.js";
import { INVENTORY_OPERATIONS, InventoryService } from "./inventory.service.js";

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryRepository,
    InventoryService,
    { provide: INVENTORY_OPERATIONS, useExisting: InventoryService },
  ],
  exports: [INVENTORY_OPERATIONS, InventoryService],
})
export class InventoryModule {}
