import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import {
  currentIdentityFromRequest,
  RequirePermission,
} from "../identity/authorization.guard.js";
import { OperationsService } from "./operations.service.js";

@Controller("operations")
export class OperationsController {
  constructor(
    @Inject(OperationsService)
    private readonly operations: OperationsService,
  ) {}

  @Get("audit")
  @RequirePermission("operations.audit.read")
  listAudit(@Query() query: unknown) {
    return this.operations.listAudit(query);
  }

  @Get("jobs")
  @RequirePermission("operations.jobs.read")
  listJobs(@Query() query: unknown) {
    return this.operations.listJobs(query);
  }

  @Post("jobs/:jobId/retry")
  @RequirePermission("operations.jobs.manage")
  async retry(
    @Req() request: Request,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
  ) {
    return {
      job: await this.operations.retryJob(jobId, body, {
        actorUserId: currentIdentityFromRequest(request).id,
        requestId: typeof request.id === "string" ? request.id : "api-request",
      }),
    };
  }
}
