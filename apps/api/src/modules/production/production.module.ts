import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { ProductionController } from "./production.controller.js";
import { ProductionRepository } from "./production.repository.js";
import { ProductionService } from "./production.service.js";

@Module({
  imports: [InventoryModule, FilesModule],
  controllers: [ProductionController],
  providers: [ProductionRepository, ProductionService],
})
export class ProductionModule {}
