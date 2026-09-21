import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";

import {
  currentIdentityFromRequest,
  RequirePermission,
} from "../identity/authorization.guard.js";
import { attachmentContentDisposition } from "./download-header.js";
import { ImportsService } from "./imports.service.js";

@Controller("imports")
export class ImportsController {
  constructor(
    @Inject(ImportsService) private readonly imports: ImportsService,
  ) {}

  @Post()
  @RequirePermission("imports.manage")
  @UseInterceptors(FileInterceptor("file"))
  async stage(
    @Req() request: Request,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body("loadId") loadId: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return {
      run: await this.imports.stage(
        loadId,
        file,
        this.context(request, idempotencyKey),
      ),
    };
  }

  @Get()
  @RequirePermission("imports.read")
  async list() {
    return { runs: await this.imports.listRuns() };
  }

  @Get(":runId")
  @RequirePermission("imports.read")
  async get(@Param("runId") runId: string) {
    return { run: await this.imports.getRun(runId) };
  }

  @Get(":runId/rows")
  @RequirePermission("imports.read")
  rows(@Param("runId") runId: string, @Query() query: unknown) {
    return this.imports.listRows(runId, query);
  }

  @Post(":runId/approve")
  @RequirePermission("imports.manage")
  async approve(
    @Req() request: Request,
    @Param("runId") runId: string,
    @Body() body: unknown,
  ) {
    return {
      run: await this.imports.approve(runId, body, this.context(request)),
    };
  }

  @Post(":runId/commit")
  @RequirePermission("imports.manage")
  commit(
    @Req() request: Request,
    @Param("runId") runId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return this.imports.commit(
      runId,
      body,
      this.context(request, idempotencyKey),
    );
  }

  @Get(":runId/source")
  @RequirePermission("imports.read")
  async source(@Param("runId") runId: string, @Res() response: Response) {
    const source = await this.imports.source(runId);
    response.setHeader("Content-Type", source.mediaType);
    response.setHeader("Content-Length", String(source.byteCount));
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader(
      "Content-Disposition",
      attachmentContentDisposition(source.filename),
    );
    response.send(source.bytes);
  }

  @Get(":runId/report")
  @RequirePermission("imports.read")
  async report(@Param("runId") runId: string, @Res() response: Response) {
    const report = await this.imports.report(runId);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Length", String(report.length));
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="import-${runId}-results.csv"`,
    );
    response.send(report);
  }

  private context(request: Request, idempotencyKey?: string) {
    return {
      actorUserId: currentIdentityFromRequest(request).id,
      requestId: typeof request.id === "string" ? request.id : "api-request",
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };
  }
}
