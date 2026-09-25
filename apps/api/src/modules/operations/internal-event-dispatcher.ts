import { Injectable } from "@nestjs/common";
import type { OperationsAction } from "@laundrorama/contracts";

import type {
  DispatchableInternalEvent,
  InternalEventDispatcher,
} from "./operations.ports.js";

export type InternalEventHandler = (
  event: DispatchableInternalEvent,
) => Promise<void>;

@Injectable()
export class InternalEventHandlerRegistry implements InternalEventDispatcher {
  private readonly handlers = new Map<
    OperationsAction,
    InternalEventHandler[]
  >();

  register(
    eventType: OperationsAction,
    handler: InternalEventHandler,
  ): () => void {
    const current = this.handlers.get(eventType) ?? [];
    current.push(handler);
    this.handlers.set(eventType, current);
    return () => {
      const next = (this.handlers.get(eventType) ?? []).filter(
        (candidate) => candidate !== handler,
      );
      if (next.length) this.handlers.set(eventType, next);
      else this.handlers.delete(eventType);
    };
  }

  async dispatch(event: DispatchableInternalEvent): Promise<void> {
    for (const handler of this.handlers.get(event.eventType) ?? []) {
      await handler(event);
    }
  }
}
