import {
  BadRequestException,
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
  Body,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";

import {
  currentIdentityFromRequest,
  currentSessionIdFromRequest,
  RequirePermission,
} from "../identity/authorization.guard.js";
import { FilesService } from "./files.service.js";

@Controller("files")
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  @Post("upload-grants")
  @RequirePermission("files.write")
  createUploadGrant(@Req() request: Request, @Body() body: unknown) {
    return this.files.createUploadGrant(
      body,
      currentIdentityFromRequest(request),
      this.context(request),
    );
  }

  @Post(":fileId/upload-content")
  @RequirePermission("files.write")
  @UseInterceptors(FileInterceptor("file"))
  async uploadContent(
    @Req() request: Request,
    @Param("fileId") fileId: string,
    @Headers("x-file-grant") grant: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return {
      file: await this.files.uploadContent(
        fileId,
        grant,
        file?.buffer,
        currentIdentityFromRequest(request),
        this.context(request),
      ),
    };
  }

  @Get()
  @RequirePermission("files.read")
  list(
    @Req() request: Request,
    @Query("machineId") machineId?: string,
    @Query("loadId") loadId?: string,
  ) {
    if (Boolean(machineId) === Boolean(loadId)) {
      throw new BadRequestException("Exactly one file target is required");
    }
    const target = machineId
      ? { type: "machine", id: machineId }
      : loadId
        ? { type: "load", id: loadId }
        : undefined;
    return this.files
      .list(target, currentIdentityFromRequest(request))
      .then((files) => ({ files }));
  }

  @Post(":fileId/download-grants")
  @RequirePermission("files.read")
  async createDownloadGrant(
    @Req() request: Request,
    @Param("fileId") fileId: string,
  ) {
    return {
      grant: await this.files.createDownloadGrant(
        fileId,
        currentIdentityFromRequest(request),
        this.context(request),
      ),
    };
  }

  @Get(":fileId/download-content")
  @RequirePermission("files.read")
  async downloadContent(
    @Req() request: Request,
    @Res() response: Response,
    @Param("fileId") fileId: string,
    @Query("grant") grant?: string,
  ) {
    const file = await this.files.downloadContent(
      fileId,
      grant,
      currentIdentityFromRequest(request),
      this.context(request),
    );
    response.setHeader("Content-Type", file.mediaType);
    response.setHeader("Content-Length", String(file.byteCount));
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    response.send(file.bytes);
  }

  @Get("review/incomplete")
  @RequirePermission("files.manage")
  async incomplete(@Req() request: Request) {
    return {
      files: await this.files.incomplete(currentIdentityFromRequest(request)),
    };
  }

  @Post(":fileId/abandon")
  @RequirePermission("files.manage")
  async abandon(@Req() request: Request, @Param("fileId") fileId: string) {
    return {
      file: await this.files.abandon(
        fileId,
        currentIdentityFromRequest(request),
        this.context(request),
      ),
    };
  }

  private context(request: Request) {
    return {
      actorUserId: currentIdentityFromRequest(request).id,
      sessionId: currentSessionIdFromRequest(request),
      requestId: typeof request.id === "string" ? request.id : "api-request",
    };
  }
}
