import type {
  CatalogSpecs,
  MachineActualSpecs,
  MachineEffectiveSpecs,
} from "@simply-clean/contracts";

function effective(
  actual: number | null | undefined,
  machine: number | null | undefined,
  catalog: number | null | undefined,
): MachineEffectiveSpecs["widthIn"] {
  if (actual != null) return { value: actual, source: "actual" };
  if (machine != null) return { value: machine, source: "machine" };
  if (catalog != null) return { value: catalog, source: "catalog" };
  return { value: null, source: "unknown" };
}

export function effectiveMachineSpecs(
  actual: Pick<
    MachineActualSpecs,
    "widthIn" | "depthIn" | "heightIn" | "weightLb"
  > | null,
  machineCapacityLb: number | null | undefined,
  catalog: CatalogSpecs | null,
): MachineEffectiveSpecs {
  return {
    widthIn: effective(actual?.widthIn, null, catalog?.widthIn),
    depthIn: effective(actual?.depthIn, null, catalog?.depthIn),
    heightIn: effective(actual?.heightIn, null, catalog?.heightIn),
    weightLb: effective(actual?.weightLb, null, catalog?.weightLb),
    capacityLb: effective(null, machineCapacityLb, catalog?.capacityLb),
  };
}
