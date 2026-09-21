import { Controller, Get, Inject, Res } from "@nestjs/common";
import type {
  LivenessResponse,
  ReadinessResponse,
} from "@simply-clean/contracts";
import type { Response } from "express";

import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(HealthService)
    private readonly healthService: HealthService,
  ) {}

  @Get("live")
  liveness(): LivenessResponse {
    return this.healthService.liveness();
  }

  @Get("ready")
  async readiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResponse> {
    const result = await this.healthService.readiness();
    if (result.status === "not_ready") {
      response.status(503);
    }
    return result;
  }
}
