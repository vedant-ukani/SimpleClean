import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import {
  currentIdentityFromRequest,
  RequirePermission,
} from "../identity/authorization.guard.js";
import { InventoryService } from "./inventory.service.js";

@Controller("inventory")
export class InventoryController {
  constructor(
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}

  @Get("loads")
  @RequirePermission("inventory.loads.read")
  async listLoads() {
    return { loads: await this.inventory.listLoads() };
  }

  @Post("loads")
  @RequirePermission("inventory.loads.manage")
  async createLoad(
    @Req() request: Request,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return {
      load: await this.inventory.createLoad(
        body,
        this.context(
          request,
          InventoryService.parseIdempotencyKey(idempotencyKey),
        ),
      ),
    };
  }

  @Get("loads/:loadId")
  @RequirePermission("inventory.loads.read")
  async getLoad(@Param("loadId") loadId: string) {
    return { load: await this.inventory.getLoad(loadId) };
  }

  @Patch("loads/:loadId")
  @RequirePermission("inventory.loads.manage")
  async updateLoad(
    @Req() request: Request,
    @Param("loadId") loadId: string,
    @Body() body: unknown,
  ) {
    return {
      load: await this.inventory.updateLoad(
        loadId,
        body,
        this.context(request),
      ),
    };
  }

  @Get("machines")
  @RequirePermission("inventory.machines.read")
  searchMachines(@Query() query: unknown) {
    return this.inventory.searchMachines(query);
  }

  @Post("machines")
  @RequirePermission("inventory.machines.manage")
  async createMachine(
    @Req() request: Request,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return {
      machine: await this.inventory.createMachine(
        body,
        this.context(
          request,
          InventoryService.parseIdempotencyKey(idempotencyKey),
        ),
      ),
    };
  }

  @Get("machines/:machineId")
  @RequirePermission("inventory.machines.read")
  getMachine(@Param("machineId") machineId: string) {
    return this.inventory.getMachine(machineId);
  }

  @Patch("machines/:machineId/identity")
  @RequirePermission("inventory.machines.manage")
  async updateMachineIdentity(
    @Req() request: Request,
    @Param("machineId") machineId: string,
    @Body() body: unknown,
  ) {
    return {
      machine: await this.inventory.updateMachineIdentity(
        machineId,
        body,
        this.context(request),
      ),
    };
  }

  @Patch("machines/:machineId/actual-specs")
  @RequirePermission("inventory.machines.manage")
  updateActualSpecs(
    @Req() request: Request,
    @Param("machineId") machineId: string,
    @Body() body: unknown,
  ) {
    return this.inventory.updateActualSpecs(
      machineId,
      body,
      currentIdentityFromRequest(request),
      this.context(request),
    );
  }

  @Post("machines/:machineId/verify")
  @RequirePermission("inventory.machines.verify")
  async verifyMachine(
    @Req() request: Request,
    @Param("machineId") machineId: string,
    @Body() body: unknown,
  ) {
    return {
      machine: await this.inventory.verifyMachine(
        machineId,
        body,
        this.context(request),
      ),
    };
  }

  private context(request: Request, idempotencyKey?: string) {
    return {
      actorUserId: currentIdentityFromRequest(request).id,
      requestId: typeof request.id === "string" ? request.id : "api-request",
      ...(idempotencyKey
        ? {
            idempotencyKey,
          }
        : {}),
    };
  }
}
