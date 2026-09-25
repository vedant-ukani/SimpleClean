import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  currentIdentityFromRequest,
  RequirePermission,
} from "../identity/authorization.guard.js";
import { ProductionService } from "./production.service.js";

@Controller("inventory/machines/:machineId/production")
export class ProductionController {
  constructor(
    @Inject(ProductionService) private readonly production: ProductionService,
  ) {}

  @Get()
  @RequirePermission("production.read")
  history(@Req() request: Request, @Param("machineId") machineId: string) {
    return this.production.history(
      machineId,
      currentIdentityFromRequest(request),
    );
  }

  @Post("inspections")
  @RequirePermission("production.manage")
  create(
    @Req() request: Request,
    @Param("machineId") machineId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.production.create(
      machineId,
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }

  @Post("initial-check")
  @RequirePermission("production.manage")
  initialCheck(
    @Req() request: Request,
    @Param("machineId") machineId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.production.initialCheck(
      machineId,
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }

  @Post("inspections/:inspectionId/dispositions")
  @RequirePermission("production.disposition.approve")
  finalize(
    @Req() request: Request,
    @Param("machineId") machineId: string,
    @Param("inspectionId") inspectionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.production.finalize(
      machineId,
      inspectionId,
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }

  private context(request: Request, key: string | undefined) {
    return {
      requestId: typeof request.id === "string" ? request.id : "api-request",
      idempotencyKey: key,
    };
  }
}
