import type {
  TestSessionEvent,
  TestSessionItemState,
} from "@laundrorama/contracts";

type TimingSummary = {
  elapsedSeconds: number;
  unallocatedSeconds: number;
  allocatedSeconds: Record<string, number>;
};

// Events are the clock. Each interval is charged to the items eligible at its start.
export function summarizeSessionTime(
  events: TestSessionEvent[],
  asOf: string,
): TimingSummary {
  const ordered = [...events].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  if (!ordered.length)
    return { elapsedSeconds: 0, unallocatedSeconds: 0, allocatedSeconds: {} };
  const states = new Map<string, TestSessionItemState>();
  const allocated = new Map<string, number>();
  let active = false;
  let elapsed = 0;
  let unallocated = 0;
  let previous = Date.parse(ordered[0]!.createdAt);
  for (const event of [
    ...ordered,
    {
      ...ordered[ordered.length - 1]!,
      id: "~",
      createdAt: asOf,
      action: "finished" as const,
      orderId: null,
      itemState: null,
    },
  ]) {
    const at = Math.max(previous, Date.parse(event.createdAt));
    const delta = active ? Math.max(0, at - previous) : 0;
    elapsed += delta;
    if (delta) {
      const eligible = [...states]
        .filter(([, state]) => state === "working" || state === "running_cycle")
        .map(([id]) => id)
        .sort();
      if (!eligible.length) unallocated += delta;
      else {
        const each = Math.floor(delta / eligible.length);
        const remainder = delta % eligible.length;
        eligible.forEach((id, index) =>
          allocated.set(
            id,
            (allocated.get(id) ?? 0) + each + (index < remainder ? 1 : 0),
          ),
        );
      }
    }
    previous = at;
    if (event.id === "~") break;
    if (event.action === "created" || event.action === "added") {
      if (event.action === "created") active = true;
      if (event.orderId) states.set(event.orderId, "working");
    } else if (event.action === "paused") active = false;
    else if (event.action === "resumed") active = true;
    else if (event.action === "finished") active = false;
    else if (event.orderId && event.itemState)
      states.set(event.orderId, event.itemState);
  }
  const buckets = [...allocated.entries()].map(([id, ms]) => ({ id, ms }));
  buckets.push({ id: "", ms: unallocated });
  const target = Math.floor(elapsed / 1000);
  const seconds = new Map(
    buckets.map(({ id, ms }) => [id, Math.floor(ms / 1000)]),
  );
  let remainder =
    target - [...seconds.values()].reduce((sum, value) => sum + value, 0);
  for (const bucket of buckets.sort(
    (a, b) => (b.ms % 1000) - (a.ms % 1000) || a.id.localeCompare(b.id),
  )) {
    if (remainder-- <= 0) break;
    seconds.set(bucket.id, seconds.get(bucket.id)! + 1);
  }
  return {
    elapsedSeconds: target,
    unallocatedSeconds: seconds.get("") ?? 0,
    allocatedSeconds: Object.fromEntries([...seconds].filter(([id]) => id)),
  };
}
