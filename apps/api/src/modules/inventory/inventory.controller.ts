import {
  Body,
  Controller,
  Get,
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
  async createLoad(@Body() body: unknown) {
    return { load: await this.inventory.createLoad(body) };
  }

  @Get("loads/:loadId")
  @RequirePermission("inventory.loads.read")
  async getLoad(@Param("loadId") loadId: string) {
    return { load: await this.inventory.getLoad(loadId) };
  }

  @Patch("loads/:loadId")
  @RequirePermission("inventory.loads.manage")
  async updateLoad(@Param("loadId") loadId: string, @Body() body: unknown) {
    return { load: await this.inventory.updateLoad(loadId, body) };
  }

  @Get("locations")
  @RequirePermission("inventory.locations.read")
  async listLocations() {
    return { locations: await this.inventory.listLocations() };
  }

  @Post("locations")
  @RequirePermission("inventory.locations.manage")
  async createLocation(@Body() body: unknown) {
    return { location: await this.inventory.createLocation(body) };
  }

  @Get("locations/:locationId")
  @RequirePermission("inventory.locations.read")
  async getLocation(@Param("locationId") locationId: string) {
    return { location: await this.inventory.getLocation(locationId) };
  }

  @Patch("locations/:locationId")
  @RequirePermission("inventory.locations.manage")
  async updateLocation(
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    return { location: await this.inventory.updateLocation(locationId, body) };
  }

  @Post("locations/:locationId/deactivate")
  @RequirePermission("inventory.locations.manage")
  async deactivateLocation(
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    return {
      location: await this.inventory.deactivateLocation(locationId, body),
    };
  }

  @Get("machines")
  @RequirePermission("inventory.machines.read")
  searchMachines(@Query() query: unknown) {
    return this.inventory.searchMachines(query);
  }

  @Post("machines")
  @RequirePermission("inventory.machines.manage")
  async createMachine(@Req() request: Request, @Body() body: unknown) {
    return {
      machine: await this.inventory.createMachine(body, this.context(request)),
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

  @Post("machines/:machineId/verify")
  @RequirePermission("inventory.machines.verify")
  async verifyMachine(
    @Param("machineId") machineId: string,
    @Body() body: unknown,
  ) {
    return { machine: await this.inventory.verifyMachine(machineId, body) };
  }

  @Post("machines/:machineId/relocate")
  @RequirePermission("inventory.machines.relocate")
  async relocateMachine(
    @Req() request: Request,
    @Param("machineId") machineId: string,
    @Body() body: unknown,
  ) {
    return {
      machine: await this.inventory.relocateMachine(
        machineId,
        body,
        this.context(request),
      ),
    };
  }

  private context(request: Request) {
    return {
      actorUserId: currentIdentityFromRequest(request).id,
      requestId: typeof request.id === "string" ? request.id : "api-request",
    };
  }
}
