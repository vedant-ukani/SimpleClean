import type { AcquisitionLoad } from "@laundrorama/contracts";

export function expectedArrivalFromDate(value: string): string | null {
  return value ? `${value}T00:00:00.000Z` : null;
}

export function expectedArrivalDate(value: string | null): string {
  return value?.slice(0, 10) ?? "";
}

export function displayExpectedArrival(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString(undefined, { timeZone: "UTC" });
}

export function displayReceived(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not received yet";
}

export function displayReceivedDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { timeZone: "UTC" });
}

export function filterReceivedLoads(
  loads: AcquisitionLoad[],
  name: string,
  receivedDate: string,
): AcquisitionLoad[] {
  const search = name.trim().toLocaleLowerCase();
  return loads
    .filter(
      (load) =>
        load.receivedAt &&
        load.displayName.toLocaleLowerCase().includes(search) &&
        (!receivedDate || load.receivedAt.slice(0, 10) === receivedDate),
    )
    .sort(
      (left, right) =>
        right.receivedAt!.localeCompare(left.receivedAt!) ||
        left.id.localeCompare(right.id),
    );
}

export type ExpectedLoadGroupKey = "overdue" | "today" | "upcoming" | "no_date";

export type ExpectedLoadGroup = {
  key: ExpectedLoadGroupKey;
  label: string;
  status: string;
  loads: AcquisitionLoad[];
};

const expectedGroupDefinitions: ReadonlyArray<
  Omit<ExpectedLoadGroup, "loads">
> = [
  { key: "overdue", label: "Overdue", status: "Overdue" },
  { key: "today", label: "Today", status: "Expected today" },
  { key: "upcoming", label: "Upcoming", status: "Upcoming" },
  {
    key: "no_date",
    label: "No arrival date",
    status: "Arrival date not set",
  },
];

function utcDate(value: string): string {
  return value.slice(0, 10);
}

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function groupExpectedLoads(
  loads: AcquisitionLoad[],
  today = todayUtc(),
): ExpectedLoadGroup[] {
  const groups = new Map<ExpectedLoadGroupKey, AcquisitionLoad[]>(
    expectedGroupDefinitions.map(({ key }) => [key, []]),
  );
  for (const load of loads) {
    if (load.receivedAt) continue;
    const date = load.expectedArrivalAt
      ? utcDate(load.expectedArrivalAt)
      : null;
    const key: ExpectedLoadGroupKey = !date
      ? "no_date"
      : date < today
        ? "overdue"
        : date === today
          ? "today"
          : "upcoming";
    groups.get(key)!.push(load);
  }
  const byName = (left: AcquisitionLoad, right: AcquisitionLoad) =>
    left.displayName.localeCompare(right.displayName) ||
    left.id.localeCompare(right.id);
  groups
    .get("overdue")!
    .sort(
      (left, right) =>
        utcDate(left.expectedArrivalAt!).localeCompare(
          utcDate(right.expectedArrivalAt!),
        ) || byName(left, right),
    );
  groups.get("today")!.sort(byName);
  groups
    .get("upcoming")!
    .sort(
      (left, right) =>
        utcDate(left.expectedArrivalAt!).localeCompare(
          utcDate(right.expectedArrivalAt!),
        ) || byName(left, right),
    );
  return expectedGroupDefinitions.map((definition) => ({
    ...definition,
    loads: groups.get(definition.key)!,
  }));
}
