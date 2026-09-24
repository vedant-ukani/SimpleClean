import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  RequirePermission,
  currentIdentityFromRequest,
} from "../identity/authorization.guard.js";
import { CatalogService } from "./catalog.service.js";

@Controller("catalog")
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  @Get("models")
  @RequirePermission("catalog.read")
  list(@Query() query: unknown, @Req() request: Request) {
    return this.catalog.list(query, currentIdentityFromRequest(request));
  }

  @Get("models/:revisionId")
  @RequirePermission("catalog.read")
  async detail(
    @Param("revisionId") revisionId: string,
    @Req() request: Request,
  ) {
    return {
      model: await this.catalog.detail(
        revisionId,
        currentIdentityFromRequest(request),
      ),
    };
  }
}
