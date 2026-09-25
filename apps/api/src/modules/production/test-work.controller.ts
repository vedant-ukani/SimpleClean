import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  currentIdentityFromRequest,
  RequirePermission,
} from "../identity/authorization.guard.js";
import { TestWorkService } from "./test-work.service.js";

@Controller("production")
export class TestWorkController {
  constructor(
    @Inject(TestWorkService) private readonly work: TestWorkService,
  ) {}
  @Get("work")
  @RequirePermission("production.read")
  queue(
    @Req() request: Request,
    @Query("includeCompleted") includeCompleted?: string,
  ) {
    return this.work.queue(
      currentIdentityFromRequest(request),
      includeCompleted === "true",
    );
  }
  @Post("work/sessions")
  @RequirePermission("production.work.execute")
  createSession(
    @Req() request: Request,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.createSession(
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }
  @Get("work/sessions/:sessionId")
  @RequirePermission("production.read")
  session(@Req() request: Request, @Param("sessionId") sessionId: string) {
    return this.work.session(sessionId, currentIdentityFromRequest(request));
  }
  @Post("work/sessions/:sessionId/orders")
  @RequirePermission("production.work.execute")
  addSessionOrders(
    @Req() request: Request,
    @Param("sessionId") sessionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.addSessionOrders(
      sessionId,
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }
  @Post("work/sessions/:sessionId/pause")
  @RequirePermission("production.work.execute")
  pauseSession(
    @Req() request: Request,
    @Param("sessionId") sessionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.changeSessionState(
      sessionId,
      "paused",
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }
  @Post("work/sessions/:sessionId/resume")
  @RequirePermission("production.work.execute")
  resumeSession(
    @Req() request: Request,
    @Param("sessionId") sessionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.changeSessionState(
      sessionId,
      "active",
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }
  @Post("work/sessions/:sessionId/finish")
  @RequirePermission("production.work.execute")
  finishSession(
    @Req() request: Request,
    @Param("sessionId") sessionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.finishSession(
      sessionId,
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }
  @Post("work/sessions/:sessionId/items/:orderId/state")
  @RequirePermission("production.work.execute")
  changeItemState(
    @Req() request: Request,
    @Param("sessionId") sessionId: string,
    @Param("orderId") orderId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.changeItemState(
      sessionId,
      orderId,
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }
  @Get("work/:orderId")
  @RequirePermission("production.read")
  detail(@Req() request: Request, @Param("orderId") orderId: string) {
    return this.work.detail(orderId, currentIdentityFromRequest(request));
  }
  @Get("initial-check/:machineId")
  @RequirePermission("production.read")
  initialCheckMachine(
    @Req() request: Request,
    @Param("machineId") machineId: string,
  ) {
    return this.work.initialCheckMachine(
      machineId,
      currentIdentityFromRequest(request),
    );
  }
  @Post("work/:orderId/start")
  @RequirePermission("production.work.execute")
  start(
    @Req() request: Request,
    @Param("orderId") orderId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.start(
      orderId,
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }
  @Post("work/:orderId/steps")
  @RequirePermission("production.work.execute")
  step(
    @Req() request: Request,
    @Param("orderId") orderId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.recordStep(
      orderId,
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }
  @Post("work/:orderId/finish")
  @RequirePermission("production.work.execute")
  finish(
    @Req() request: Request,
    @Param("orderId") orderId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.finish(
      orderId,
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }
  @Post("work/:orderId/bearing-concern")
  @RequirePermission("production.work.execute")
  bearingConcern(
    @Req() request: Request,
    @Param("orderId") orderId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.reportBearingConcern(
      orderId,
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }
  @Post("work/:orderId/assignment")
  @RequirePermission("production.work.assign")
  assign(
    @Req() request: Request,
    @Param("orderId") orderId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.assign(
      orderId,
      body,
      currentIdentityFromRequest(request),
      this.context(request, key),
    );
  }
  @Get("specialties")
  @RequirePermission("production.work.assign")
  specialties(@Req() request: Request) {
    return this.work.listSpecialties(currentIdentityFromRequest(request));
  }
  @Put("specialties/:userId")
  @RequirePermission("production.work.assign")
  setSpecialties(
    @Req() request: Request,
    @Param("userId") userId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.work.setSpecialties(
      userId,
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

@Controller("inventory/machines/:machineId/production")
export class ActiveTestWorkController {
  constructor(
    @Inject(TestWorkService) private readonly work: TestWorkService,
  ) {}
  @Get("active-test")
  @RequirePermission("inventory.machines.read")
  active(@Req() request: Request, @Param("machineId") machineId: string) {
    return this.work.active(machineId, currentIdentityFromRequest(request));
  }
  @Get("work-destination")
  @RequirePermission("inventory.machines.read")
  destination(@Req() request: Request, @Param("machineId") machineId: string) {
    return this.work.destination(
      machineId,
      currentIdentityFromRequest(request),
    );
  }
}
