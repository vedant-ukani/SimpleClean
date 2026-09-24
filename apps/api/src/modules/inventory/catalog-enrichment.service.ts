import {
  Inject,
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import {
  CATALOG_OPERATIONS,
  type CatalogOperations,
} from "../catalog/catalog.service.js";
import { InternalEventHandlerRegistry } from "../operations/internal-event-dispatcher.js";
import type { DispatchableInternalEvent } from "../operations/operations.ports.js";
import { InventoryRepository } from "./inventory.repository.js";
import { IntakeRepository } from "./intake/intake.repository.js";

@Injectable()
export class CatalogEnrichmentService implements OnModuleInit, OnModuleDestroy {
  private unregister: (() => void)[] = [];
  constructor(
    @Inject(InventoryRepository)
    private readonly inventory: InventoryRepository,
    @Inject(IntakeRepository)
    private readonly intake: IntakeRepository,
    @Inject(CATALOG_OPERATIONS) private readonly catalog: CatalogOperations,
    @Inject(InternalEventHandlerRegistry)
    private readonly events: InternalEventHandlerRegistry,
  ) {}

  onModuleInit() {
    for (const action of [
      "inventory.intake.recognition.completed",
      "inventory.machine.created",
      "inventory.machine.identity_updated",
    ] as const) {
      this.unregister.push(
        this.events.register(action, (event) => this.handle(event)),
      );
    }
    this.unregister.push(
      this.events.register("catalog.snapshot.imported", (event) =>
        this.refreshUnresolvedMachines(event),
      ),
    );
  }

  onModuleDestroy() {
    this.unregister.forEach((unregister) => unregister());
  }

  async handle(event: DispatchableInternalEvent): Promise<void> {
    if (event.eventType === "catalog.snapshot.imported") {
      await this.refreshUnresolvedMachines(event);
      return;
    }
    if (event.eventType === "inventory.intake.recognition.completed") {
      const identity = await this.intake.readyCandidateIdentityForRecognition(
        event.targetId,
      );
      if (!identity) return;
      await this.catalog.requestDiscovery(identity, {
        requestId: event.requestId,
      });
      return;
    }
    const machine = await this.inventory.findMachine(event.targetId);
    if (!machine) return;
    try {
      await this.catalog.requestDiscovery(machine, {
        requestId: event.requestId,
      });
    } finally {
      const currentMachine = await this.inventory.findMachine(event.targetId);
      if (currentMachine && currentMachine.version === machine.version)
        await this.catalog.resolveAndLinkMachine(
          currentMachine.id,
          currentMachine,
          {
            actorKind: "system",
            requestId: event.requestId,
            identityVersion: currentMachine.version,
          },
        );
    }
  }

  private async refreshUnresolvedMachines(
    event: DispatchableInternalEvent,
  ): Promise<void> {
    let afterMachineId: string | undefined;
    while (true) {
      const machineIds = await this.catalog.listUnresolvedMachineIds(
        afterMachineId,
        500,
      );
      if (!machineIds.length) return;
      for (const machineId of machineIds) {
        const machine = await this.inventory.findMachine(machineId);
        if (!machine) continue;
        await this.catalog.refreshUnresolvedAndLinkMachine(
          machine.id,
          machine,
          {
            actorKind: "system",
            requestId: event.requestId,
            identityVersion: machine.version,
          },
        );
      }
      afterMachineId = machineIds[machineIds.length - 1];
      if (machineIds.length < 500) return;
    }
  }
}
