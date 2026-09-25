import { describe, expect, it } from "vitest";
import type { TestSessionEvent } from "@laundrorama/contracts";
import { summarizeSessionTime } from "../src/modules/production/session-timing.js";

const sessionId = "00000000-0000-4000-8000-000000000001";
const washer = "00000000-0000-4000-8000-000000000002";
const dryer = "00000000-0000-4000-8000-000000000003";
function event(
  index: number,
  second: number,
  action: TestSessionEvent["action"],
  orderId: string | null = null,
  itemState: TestSessionEvent["itemState"] = null,
): TestSessionEvent {
  return {
    id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    sessionId,
    orderId,
    action,
    itemState,
    actorUserId: "worker",
    createdAt: new Date(1_000_000 + second * 1000).toISOString(),
  };
}
const at = (second: number) =>
  new Date(1_000_000 + second * 1000).toISOString();

describe("Production session timing", () => {
  it("allocates active time equally and excludes waiting items", () => {
    const events = [
      event(1, 0, "created", washer, "working"),
      event(2, 10, "added", dryer, "working"),
      event(3, 20, "item_state_changed", dryer, "waiting"),
      event(4, 30, "item_state_changed", washer, "running_cycle"),
    ];
    expect(summarizeSessionTime(events, at(40))).toEqual({
      elapsedSeconds: 40,
      unallocatedSeconds: 0,
      allocatedSeconds: { [washer]: 35, [dryer]: 5 },
    });
  });
  it("pauses, resumes, preserves unallocated time, and freezes completed history", () => {
    const events = [
      event(1, 0, "created", washer, "working"),
      event(2, 10, "paused"),
      event(3, 20, "resumed"),
      event(4, 30, "item_state_changed", washer, "waiting"),
      event(5, 40, "item_completed", washer, "completed"),
      event(6, 50, "finished"),
    ];
    expect(summarizeSessionTime(events, at(60))).toEqual({
      elapsedSeconds: 40,
      unallocatedSeconds: 20,
      allocatedSeconds: { [washer]: 20 },
    });
  });
  it("orders same-time events by stable ID and conserves rounded seconds", () => {
    const events = [
      event(2, 0, "added", dryer, "working"),
      event(1, 0, "created", washer, "working"),
    ];
    const summary = summarizeSessionTime(
      events,
      new Date(1_000_000 + 1_001).toISOString(),
    );
    expect(summary.elapsedSeconds).toBe(1);
    expect(
      summary.unallocatedSeconds +
        Object.values(summary.allocatedSeconds).reduce((a, b) => a + b, 0),
    ).toBe(1);
  });
  it("never creates negative elapsed time from reversed timestamps", () => {
    expect(
      summarizeSessionTime(
        [event(1, 10, "created", washer, "working"), event(2, 5, "paused")],
        at(4),
      ).elapsedSeconds,
    ).toBe(0);
  });
});
