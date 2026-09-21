import type { Machine } from "@simply-clean/contracts";

export function recorded(value: string | null): string {
  return value ?? "Not recorded";
}

export function MachineIdentityStatus({
  machine,
}: Readonly<{ machine: Machine }>) {
  if (machine.identityVerificationState === "conflict") {
    return (
      <span className="status status--danger">
        Identity conflict
        {machine.conflictingMachineId
          ? ` with ${machine.conflictingMachineId}`
          : ""}
      </span>
    );
  }
  if (machine.identityVerificationState === "verified") {
    return <span className="status status--success">Identity verified</span>;
  }
  return <span className="status">Provisional identity — not verified</span>;
}
