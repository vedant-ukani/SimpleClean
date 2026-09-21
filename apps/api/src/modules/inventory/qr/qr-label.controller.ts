import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";

import {
  currentIdentityFromRequest,
  RequirePermission,
} from "../../identity/authorization.guard.js";
import { QrLabelService } from "./qr-label.service.js";

@Controller("inventory")
export class QrLabelController {
  constructor(
    @Inject(QrLabelService) private readonly qrLabels: QrLabelService,
  ) {}

  @Get("machines/:machineId/qr-labels")
  @RequirePermission("inventory.machines.read")
  async list(@Req() request: Request, @Param("machineId") machineId: string) {
    return {
      labels: await this.qrLabels.listForMachine(
        machineId,
        this.context(request),
      ),
    };
  }

  @Post("machines/:machineId/qr-labels")
  @RequirePermission("inventory.qr_labels.manage")
  async create(
    @Req() request: Request,
    @Param("machineId") machineId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return {
      label: await this.qrLabels.create(
        machineId,
        body,
        this.context(
          request,
          QrLabelService.parseIdempotencyKey(idempotencyKey),
        ),
      ),
    };
  }

  @Post("machines/:machineId/qr-labels/reissue")
  @RequirePermission("inventory.qr_labels.manage")
  async reissue(
    @Req() request: Request,
    @Param("machineId") machineId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return {
      label: await this.qrLabels.reissue(
        machineId,
        body,
        this.context(
          request,
          QrLabelService.parseIdempotencyKey(idempotencyKey),
        ),
      ),
    };
  }

  @Post("qr-labels/:labelId/revoke")
  @RequirePermission("inventory.qr_labels.manage")
  async revoke(
    @Req() request: Request,
    @Param("labelId") labelId: string,
    @Body() body: unknown,
  ) {
    return {
      label: await this.qrLabels.revoke(labelId, body, this.context(request)),
    };
  }

  @Get("qr-labels/:labelId/print")
  @RequirePermission("inventory.qr_labels.manage")
  async print(
    @Req() request: Request,
    @Param("labelId") labelId: string,
    @Res() response: Response,
  ): Promise<void> {
    const rendered = await this.qrLabels.print(labelId, this.context(request));
    response
      .status(200)
      .set({
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${rendered.filename}"`,
        "Content-Security-Policy":
          "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
        "Content-Type": "image/svg+xml; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      })
      .send(rendered.svg);
  }

  @Post("qr-labels/resolve")
  @RequirePermission("inventory.machines.read")
  resolve(@Req() request: Request, @Body() body: unknown) {
    return this.qrLabels.resolve(body, this.context(request));
  }

  private context(request: Request, idempotencyKey?: string) {
    const identity = currentIdentityFromRequest(request);
    return {
      actorUserId: identity.id,
      role: identity.role,
      requestId: typeof request.id === "string" ? request.id : "api-request",
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };
  }
}
