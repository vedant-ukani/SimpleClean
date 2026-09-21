import { Inject, Injectable } from "@nestjs/common";
import type {
  LivenessResponse,
  ReadinessResponse,
} from "@simply-clean/contracts";
import type { DatabaseConnection } from "@simply-clean/database";

import { DATABASE_CONNECTION } from "./database.module.js";

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly database: DatabaseConnection,
  ) {}

  liveness(): LivenessResponse {
    return {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessResponse> {
    const databaseReady = await this.database.isReady();
    return {
      status: databaseReady ? "ready" : "not_ready",
      dependencies: { database: databaseReady ? "up" : "down" },
      timestamp: new Date().toISOString(),
    };
  }
}
