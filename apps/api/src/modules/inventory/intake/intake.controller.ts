import {
  Body,
  Controller,
  Headers,
  Param,
  Patch,
  Post,
  Get,
  Req,
  Inject,
} from "@nestjs/common";
import type { Request } from "express";
import {
  currentIdentityFromRequest,
  RequirePermission,
} from "../../identity/authorization.guard.js";
import { IntakeService } from "./intake.service.js";
import { IntakeRecognitionService } from "./recognition.service.js";

@Controller("inventory")
export class IntakeController {
  constructor(
    @Inject(IntakeService) private readonly intake: IntakeService,
    @Inject(IntakeRecognitionService)
    private readonly recognition: IntakeRecognitionService,
  ) {}

  @Post("loads/:loadId/intake")
  @RequirePermission("intake.manage")
  create(
    @Req() req: Request,
    @Param("loadId") loadId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake
      .create(
        loadId,
        body,
        currentIdentityFromRequest(req),
        this.context(req, key),
      )
      .then((batch) => ({ batch }));
  }
  @Get("intake/:batchId")
  @RequirePermission("intake.read")
  get(@Req() req: Request, @Param("batchId") batchId: string) {
    return this.intake.get(batchId, currentIdentityFromRequest(req));
  }
  @Post("intake/:batchId/photos")
  @RequirePermission("intake.manage")
  linkPhoto(
    @Req() req: Request,
    @Param("batchId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake
      .linkPhoto(
        id,
        body,
        currentIdentityFromRequest(req),
        this.context(req, key),
      )
      .then((detail) => ({ ...detail }));
  }
  @Post("intake/:batchId/candidates")
  @RequirePermission("intake.manage")
  createCandidate(
    @Req() req: Request,
    @Param("batchId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake
      .createCandidate(
        id,
        body,
        currentIdentityFromRequest(req),
        this.context(req, key),
      )
      .then((detail) => ({ ...detail }));
  }
  @Post("intake/:batchId/items")
  @RequirePermission("intake.manage")
  prepareItem(
    @Req() req: Request,
    @Param("batchId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake.prepareItem(
      id,
      body,
      currentIdentityFromRequest(req),
      this.context(req, key),
    );
  }
  @Patch("intake/:batchId/candidates/:candidateId")
  @RequirePermission("intake.manage")
  updateCandidate(
    @Req() req: Request,
    @Param("batchId") batchId: string,
    @Param("candidateId") candidateId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake
      .updateCandidate(
        batchId,
        candidateId,
        body,
        currentIdentityFromRequest(req),
        this.context(req, key),
      )
      .then((detail) => ({ ...detail }));
  }
  @Patch("intake/:batchId/candidates/:candidateId/type")
  @RequirePermission("intake.manage")
  changeCandidateType(
    @Req() req: Request,
    @Param("batchId") batchId: string,
    @Param("candidateId") candidateId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake.changeCandidateType(
      batchId,
      candidateId,
      body,
      currentIdentityFromRequest(req),
      this.context(req, key),
    );
  }
  @Patch("intake/:batchId/candidates/:candidateId/capacity")
  @RequirePermission("intake.manage")
  changeCandidateCapacity(
    @Req() req: Request,
    @Param("batchId") batchId: string,
    @Param("candidateId") candidateId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake.changeCandidateCapacity(
      batchId,
      candidateId,
      body,
      currentIdentityFromRequest(req),
      this.context(req, key),
    );
  }
  @Post("intake/:batchId/photos/assign")
  @RequirePermission("intake.manage")
  assignPhoto(
    @Req() req: Request,
    @Param("batchId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake
      .assignPhoto(
        id,
        body,
        currentIdentityFromRequest(req),
        this.context(req, key),
      )
      .then((detail) => ({ ...detail }));
  }
  @Post("intake/:batchId/photos/exclude")
  @RequirePermission("intake.manage")
  excludePhoto(
    @Req() req: Request,
    @Param("batchId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake
      .excludePhoto(
        id,
        body,
        currentIdentityFromRequest(req),
        this.context(req, key),
      )
      .then((detail) => ({ ...detail }));
  }
  @Post("intake/:batchId/photos/remove")
  @RequirePermission("intake.manage")
  removePhoto(
    @Req() req: Request,
    @Param("batchId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake.removePhoto(
      id,
      body,
      currentIdentityFromRequest(req),
      this.context(req, key),
    );
  }
  @Post("intake/:batchId/candidates/:candidateId/confirm")
  @RequirePermission("intake.manage")
  confirm(
    @Req() req: Request,
    @Param("batchId") batchId: string,
    @Param("candidateId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake
      .confirmCandidate(
        batchId,
        id,
        body,
        currentIdentityFromRequest(req),
        this.context(req, key),
      )
      .then((detail) => ({ ...detail }));
  }
  @Post("intake/:batchId/candidates/:candidateId/commit")
  @RequirePermission("intake.manage")
  commitCandidate(
    @Req() req: Request,
    @Param("batchId") batchId: string,
    @Param("candidateId") candidateId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake.commitCandidate(
      batchId,
      candidateId,
      body,
      currentIdentityFromRequest(req),
      this.context(req, key),
    );
  }
  @Post("intake/:batchId/destination")
  @RequirePermission("intake.manage")
  destination(
    @Req() req: Request,
    @Param("batchId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake
      .setDestination(
        id,
        body,
        currentIdentityFromRequest(req),
        this.context(req, key),
      )
      .then((detail) => ({ ...detail }));
  }
  @Post("intake/:batchId/commit")
  @RequirePermission("intake.manage")
  commit(
    @Req() req: Request,
    @Param("batchId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.intake.commit(
      id,
      body,
      currentIdentityFromRequest(req),
      this.context(req, key),
    );
  }

  @Get("intake/:batchId/recognition")
  @RequirePermission("intake.read")
  recognitionStatus(@Req() req: Request, @Param("batchId") batchId: string) {
    return this.recognition.status(batchId, currentIdentityFromRequest(req));
  }

  @Post("intake/:batchId/recognition")
  @RequirePermission("intake.manage")
  recognitionRequest(
    @Req() req: Request,
    @Param("batchId") batchId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.recognition.request(
      batchId,
      body,
      currentIdentityFromRequest(req),
      this.context(req, key),
    );
  }

  @Post("intake/:batchId/recaptures/:recaptureId/evidence")
  @RequirePermission("intake.manage")
  recognitionRecapture(
    @Req() req: Request,
    @Param("batchId") batchId: string,
    @Param("recaptureId") recaptureId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.recognition.recapture(
      batchId,
      recaptureId,
      body,
      currentIdentityFromRequest(req),
      this.context(req, key),
    );
  }

  private context(request: Request, key?: string) {
    return {
      actorUserId: currentIdentityFromRequest(request).id,
      requestId: typeof request.id === "string" ? request.id : "api-request",
      ...(key ? { idempotencyKey: key } : {}),
    };
  }
}
