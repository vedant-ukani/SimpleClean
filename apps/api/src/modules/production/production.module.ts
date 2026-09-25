import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { ProductionController } from "./production.controller.js";
import { ProductionRepository } from "./production.repository.js";
import { ProductionService } from "./production.service.js";
import { TestWorkController, ActiveTestWorkController } from "./test-work.controller.js";
import { TestWorkRepository } from "./test-work.repository.js";
import { TestWorkService } from "./test-work.service.js";

@Module({
  imports: [InventoryModule, FilesModule],
  controllers: [ProductionController, TestWorkController, ActiveTestWorkController],
  providers: [ProductionRepository, ProductionService, TestWorkRepository, TestWorkService],
})
export class ProductionModule {}
