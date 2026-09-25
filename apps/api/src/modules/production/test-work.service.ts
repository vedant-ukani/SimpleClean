import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ActiveTestWorkResponseSchema,
  AddTestSessionOrdersRequestSchema,
  ChangeTestSessionItemRequestSchema,
  CreateTestSessionRequestSchema,
  FinishTestRequestSchema,
  IdempotencyKeySchema,
  InventoryIdSchema,
  RecordTestStepRequestSchema,
  SetProductionSpecialtiesRequestSchema,
  TestAssignRequestSchema,
  TestMutationRequestSchema,
  TestQueueResponseSchema,
  TestWorkDetailSchema,
  ProductionWorkDestinationSchema,
  MachineSchema,
  ProductionSpecialtyListResponseSchema,
  ReportBearingConcernRequestSchema,
  TestSessionMutationRequestSchema,
  TestSessionSchema,
  roleHasPermission,
  type IdentityUser,
} from "@laundrorama/contracts";
import { IdentityService } from "../identity/identity.service.js";
import { TestWorkRepository } from "./test-work.repository.js";

type Context = { requestId: string; idempotencyKey: string | undefined };

@Injectable()
export class TestWorkService {
  constructor(
    @Inject(TestWorkRepository) private readonly repository: TestWorkRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}
  async queue(identity: IdentityUser, includeCompleted = false) {
    this.read(identity);
    return TestQueueResponseSchema.parse(
      await this.repository.queue(identity, includeCompleted),
    );
  }
  async active(machineId: string, identity: IdentityUser) {
    if (!this.canUseWork(identity))
      return ActiveTestWorkResponseSchema.parse({ orderId: null });
    return ActiveTestWorkResponseSchema.parse({
      orderId: await this.repository.activeForMachine(
        this.id(machineId),
        identity,
      ),
    });
  }
  async destination(machineId: string, identity: IdentityUser) {
    if (!this.canUseWork(identity))
      return ProductionWorkDestinationSchema.parse({ kind: "none" });
    return ProductionWorkDestinationSchema.parse(
      await this.repository.workDestination(this.id(machineId), identity),
    );
  }
  async initialCheckMachine(machineId: string, identity: IdentityUser) {
    this.read(identity);
    return MachineSchema.parse(
      await this.repository.initialCheckMachine(this.id(machineId), identity),
    );
  }
  async detail(orderId: string, identity: IdentityUser) {
    this.read(identity);
    return TestWorkDetailSchema.parse(
      await this.repository.detail(this.id(orderId), identity),
    );
  }
  async session(sessionId: string, identity: IdentityUser) {
    this.read(identity);
    return TestSessionSchema.parse(
      await this.repository.session(this.id(sessionId), identity),
    );
  }
  async createSession(raw: unknown, identity: IdentityUser, context: Context) {
    this.execute(identity);
    const input = CreateTestSessionRequestSchema.safeParse(raw);
    if (!input.success)
      throw new BadRequestException("Invalid session selection");
    return TestSessionSchema.parse(
      await this.repository.createSession(
        input.data.orders,
        identity,
        this.actor(identity, context),
      ),
    );
  }
  async addSessionOrders(
    sessionId: string,
    raw: unknown,
    identity: IdentityUser,
    context: Context,
  ) {
    this.execute(identity);
    const input = AddTestSessionOrdersRequestSchema.safeParse(raw);
    if (!input.success)
      throw new BadRequestException("Invalid session addition");
    return TestSessionSchema.parse(
      await this.repository.addSessionOrders(
        this.id(sessionId),
        input.data.expectedVersion,
        input.data.orders,
        identity,
        this.actor(identity, context),
      ),
    );
  }
  async changeSessionState(
    sessionId: string,
    state: "active" | "paused",
    raw: unknown,
    identity: IdentityUser,
    context: Context,
  ) {
    this.execute(identity);
    const input = TestSessionMutationRequestSchema.safeParse(raw);
    if (!input.success) throw new BadRequestException("Invalid session change");
    return TestSessionSchema.parse(
      await this.repository.changeSessionState(
        this.id(sessionId),
        input.data.expectedVersion,
        state,
        identity,
        this.actor(identity, context),
      ),
    );
  }
  async changeItemState(
    sessionId: string,
    orderId: string,
    raw: unknown,
    identity: IdentityUser,
    context: Context,
  ) {
    this.execute(identity);
    const input = ChangeTestSessionItemRequestSchema.safeParse(raw);
    if (!input.success)
      throw new BadRequestException("Invalid Machine work state");
    return TestSessionSchema.parse(
      await this.repository.changeItemState(
        this.id(sessionId),
        this.id(orderId),
        input.data.expectedVersion,
        input.data.state,
        identity,
        this.actor(identity, context),
      ),
    );
  }
  async finishSession(
    sessionId: string,
    raw: unknown,
    identity: IdentityUser,
    context: Context,
  ) {
    this.execute(identity);
    const input = TestSessionMutationRequestSchema.safeParse(raw);
    if (!input.success) throw new BadRequestException("Invalid session finish");
    return TestSessionSchema.parse(
      await this.repository.finishSession(
        this.id(sessionId),
        input.data.expectedVersion,
        identity,
        this.actor(identity, context),
      ),
    );
  }
  async reportBearingConcern(
    orderId: string,
    raw: unknown,
    identity: IdentityUser,
    context: Context,
  ) {
    this.execute(identity);
    const input = ReportBearingConcernRequestSchema.safeParse(raw);
    if (!input.success)
      throw new BadRequestException("Invalid bearing concern");
    return TestWorkDetailSchema.parse(
      await this.repository.reportBearingConcern(
        this.id(orderId),
        input.data.expectedVersion,
        input.data.expectedSessionVersion,
        this.actor(identity, context),
      ),
    );
  }
  async listSpecialties(identity: IdentityUser) {
    this.owner(identity);
    return ProductionSpecialtyListResponseSchema.parse({
      assignments: await this.repository.allSpecialties(),
    });
  }
  async setSpecialties(
    userId: string,
    raw: unknown,
    identity: IdentityUser,
    context: Context,
  ) {
    this.owner(identity);
    const input = SetProductionSpecialtiesRequestSchema.safeParse(raw);
    if (!input.success) throw new BadRequestException("Invalid specialties");
    if (!(await this.identity.activeProductionWorker(userId)))
      throw new NotFoundException("Active Technician/Cleaner not found");
    const specialties = await this.repository.setSpecialties(
      userId,
      input.data.specialties,
      this.actor(identity, context),
    );
    return { userId, specialties };
  }
  async start(
    orderId: string,
    raw: unknown,
    identity: IdentityUser,
    context: Context,
  ) {
    this.execute(identity);
    const input = TestMutationRequestSchema.safeParse(raw);
    if (!input.success) throw new BadRequestException("Invalid Test start");
    const normalizedOrderId = this.id(orderId);
    const selection = [
      {
        orderId: normalizedOrderId,
        expectedVersion: input.data.expectedVersion,
      },
    ];
    const activeSession = (await this.repository.queue(identity, false))
      .activeSession;
    if (activeSession) {
      await this.repository.addSessionOrders(
        activeSession.id,
        activeSession.version,
        selection,
        identity,
        this.actor(identity, context),
      );
    } else {
      await this.repository.createSession(
        selection,
        identity,
        this.actor(identity, context),
      );
    }
    return TestWorkDetailSchema.parse(
      await this.repository.detail(normalizedOrderId, identity),
    );
  }
  async assign(
    orderId: string,
    raw: unknown,
    identity: IdentityUser,
    context: Context,
  ) {
    this.owner(identity);
    const input = TestAssignRequestSchema.safeParse(raw);
    if (!input.success) throw new BadRequestException("Invalid assignment");
    if (
      input.data.userId &&
      !(await this.identity.activeProductionWorker(input.data.userId))
    )
      throw new NotFoundException("Active Technician/Cleaner not found");
    return TestWorkDetailSchema.parse(
      await this.repository.assign(
        this.id(orderId),
        input.data.expectedVersion,
        input.data.userId,
        this.actor(identity, context),
      ),
    );
  }
  async recordStep(
    orderId: string,
    raw: unknown,
    identity: IdentityUser,
    context: Context,
  ) {
    this.execute(identity);
    const input = RecordTestStepRequestSchema.safeParse(raw);
    if (!input.success)
      throw new BadRequestException("Invalid checklist result");
    return TestWorkDetailSchema.parse(
      await this.repository.recordStep(
        this.id(orderId),
        input.data.expectedVersion,
        input.data.stepKey,
        input.data.result,
        input.data.fileId,
        this.actor(identity, context),
      ),
    );
  }
  async finish(
    orderId: string,
    raw: unknown,
    identity: IdentityUser,
    context: Context,
  ) {
    this.execute(identity);
    const input = FinishTestRequestSchema.safeParse(raw);
    if (!input.success)
      throw new BadRequestException("Invalid Test completion");
    return TestWorkDetailSchema.parse(
      await this.repository.finish(
        this.id(orderId),
        input.data.expectedVersion,
        input.data.expectedSessionVersion,
        input.data.videoFileId,
        this.actor(identity, context),
      ),
    );
  }
  private canUseWork(identity: IdentityUser) {
    return roleHasPermission(identity.role, "production.work.execute");
  }
  private read(identity: IdentityUser) {
    if (!this.canUseWork(identity)) throw new ForbiddenException();
  }
  private execute(identity: IdentityUser) {
    if (!this.canUseWork(identity)) throw new ForbiddenException();
  }
  private owner(identity: IdentityUser) {
    if (!roleHasPermission(identity.role, "production.work.assign"))
      throw new ForbiddenException();
  }
  private id(value: string) {
    const parsed = InventoryIdSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException("Invalid ID");
    return parsed.data;
  }
  private actor(identity: IdentityUser, context: Context) {
    const key = IdempotencyKeySchema.safeParse(context.idempotencyKey);
    if (!key.success)
      throw new BadRequestException("A valid Idempotency-Key is required");
    return {
      actorUserId: identity.id,
      requestId: context.requestId,
      idempotencyKey: key.data,
    };
  }
}
