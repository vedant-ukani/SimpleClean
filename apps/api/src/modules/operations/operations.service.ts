import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  AuditListQuerySchema,
  JobListQuerySchema,
  RetryOutboxJobRequestSchema,
  type AuditListResponse,
  type JobListResponse,
  type OutboxJob,
} from "@laundrorama/contracts";

import {
  MUTATION_RECORDER,
  type MutationRecorder,
} from "./operations.ports.js";
import { OperationsRepository } from "./operations.repository.js";

@Injectable()
export class OperationsService {
  constructor(
    @Inject(OperationsRepository)
    private readonly repository: OperationsRepository,
    @Inject(MUTATION_RECORDER) private readonly recorder: MutationRecorder,
  ) {}

  listAudit(rawInput: unknown): Promise<AuditListResponse> {
    return this.repository.listAudit(
      this.parse(AuditListQuerySchema, rawInput),
    );
  }

  listJobs(rawInput: unknown): Promise<JobListResponse> {
    return this.repository.listJobs(this.parse(JobListQuerySchema, rawInput));
  }

  async retryJob(
    jobId: string,
    rawInput: unknown,
    context: { actorUserId: string; requestId: string },
  ): Promise<OutboxJob> {
    const parsedJobId = this.uuid(jobId);
    const { expectedVersion } = this.parse(
      RetryOutboxJobRequestSchema,
      rawInput,
    );
    const job = await this.repository.requeue(
      parsedJobId,
      expectedVersion,
      context,
      this.recorder,
    );
    if (!job) {
      throw new ConflictException(
        "Only the current dead-letter job version can be retried",
      );
    }
    return job;
  }

  private uuid(input: string): string {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input,
      )
    ) {
      throw new BadRequestException("Invalid job ID");
    }
    return input;
  }

  private parse<T>(
    schema: {
      safeParse(
        input: unknown,
      ): { success: true; data: T } | { success: false };
    },
    input: unknown,
  ): T {
    const result = schema.safeParse(input);
    if (!result.success) throw new BadRequestException("Invalid request");
    return result.data;
  }
}
