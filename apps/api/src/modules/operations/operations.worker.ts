import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { ServerConfig } from "@simply-clean/config";

import { SERVER_CONFIG, StructuredLogger } from "../../platform/logging.js";
import {
  INTERNAL_EVENT_DISPATCHER,
  OPERATIONS_CLOCK,
  type InternalEventDispatcher,
  type OperationsClock,
} from "./operations.ports.js";
import { OperationsRepository } from "./operations.repository.js";

@Injectable()
export class OperationsWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private activePoll: Promise<void> | undefined;

  constructor(
    @Inject(OperationsRepository)
    private readonly repository: OperationsRepository,
    @Inject(INTERNAL_EVENT_DISPATCHER)
    private readonly dispatcher: InternalEventDispatcher,
    @Inject(OPERATIONS_CLOCK) private readonly clock: OperationsClock,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
  ) {}

  onModuleInit(): void {
    if (!this.config.operationsWorkerPollingEnabled) return;
    this.timer = setInterval(() => {
      void this.poll().catch(() => {
        this.logger.error(
          "Operations worker poll failed",
          undefined,
          "OperationsWorker",
        );
      });
    }, this.config.operationsWorkerPollMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.activePoll;
  }

  async runOnce(limit = 10): Promise<{
    claimed: number;
    delivered: number;
    failed: number;
  }> {
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    const jobs = await this.repository.claim(
      this.clock.now(),
      this.config.operationsWorkerLeaseSeconds,
      this.config.operationsWorkerMaxAttempts,
      boundedLimit,
    );
    const outcomes = await Promise.all(
      jobs.map(async (job) => {
        let delivered = 0;
        let failed = 0;
        try {
          await this.dispatchWithinLease(job);
          if (await this.repository.markDelivered(job, this.clock.now())) {
            delivered = 1;
          }
        } catch {
          const now = this.clock.now();
          const exponent = Math.min(Math.max(job.attemptCount - 1, 0), 16);
          const delay = Math.min(
            this.config.operationsWorkerBackoffBaseMs * 2 ** exponent,
            24 * 60 * 60 * 1_000,
          );
          if (
            await this.repository.markFailed(job, {
              now,
              nextAvailableAt: new Date(now.getTime() + delay),
              maximumAttempts: this.config.operationsWorkerMaxAttempts,
              errorCode: "handler_failed",
            })
          ) {
            failed = 1;
          }
        }
        return { delivered, failed };
      }),
    );
    return {
      claimed: jobs.length,
      delivered: outcomes.reduce(
        (total, outcome) => total + outcome.delivered,
        0,
      ),
      failed: outcomes.reduce((total, outcome) => total + outcome.failed, 0),
    };
  }

  private async dispatchWithinLease(
    job: Parameters<InternalEventDispatcher["dispatch"]>[0],
  ): Promise<void> {
    const leaseMs = this.config.operationsWorkerLeaseSeconds * 1_000;
    const deadlineMs = Math.max(1, leaseMs - Math.min(1_000, leaseMs / 10));
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.dispatcher.dispatch(job),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error("Internal event dispatch deadline exceeded")),
            deadlineMs,
          );
          timer.unref();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async poll(): Promise<void> {
    if (this.activePoll) return this.activePoll;
    const active = this.runOnce()
      .then(() => undefined)
      .finally(() => {
        if (this.activePoll === active) this.activePoll = undefined;
      });
    this.activePoll = active;
    return active;
  }
}
