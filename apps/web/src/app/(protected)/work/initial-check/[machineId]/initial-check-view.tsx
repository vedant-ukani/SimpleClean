"use client";

import type {
  Machine,
  RecordInitialCheckRequest,
} from "@laundrorama/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  getProductionWorkDestination,
  recordInitialCheck,
} from "../../../../../lib/production-client";
import { useOnlineStatus } from "../../../online-status";

const choices: {
  choice: RecordInitialCheckRequest["choice"];
  label: string;
  help: string;
}[] = [
  {
    choice: "smooth",
    label: "Smooth — no bearing concern",
    help: "The drum spins freely without concerning noise or movement.",
  },
  {
    choice: "bearing_concern",
    label: "Bearing noise or movement detected",
    help: "Stop testing and send this Machine for Owner review.",
  },
  {
    choice: "unable_to_assess",
    label: "Unable to assess",
    help: "Send this Machine for Owner review.",
  },
];

export function InitialCheckView({ machine }: Readonly<{ machine: Machine }>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const router = useRouter();
  const online = useOnlineStatus(() => router.refresh());

  async function choose(choice: RecordInitialCheckRequest["choice"]) {
    if (!online || busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await recordInitialCheck(machine.id, {
        expectedMachineVersion: machine.version,
        choice,
      });
      if (choice === "smooth") {
        const destination = await getProductionWorkDestination(machine.id);
        if (destination.kind === "test") {
          router.push(`/work/${destination.orderId}`);
          return;
        }
      }
      router.push("/work");
      router.refresh();
    } catch {
      setMessage(
        "The Machine changed or the check could not be saved. Refresh and try again.",
      );
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">
          {machine.machineType === "washer" ? "Washer" : "Dryer"} · Initial
          check
        </p>
        <h1>Check the bearing</h1>
        <p className="lede">
          Confirm this Machine, spin the drum, and tap the result. No typing is
          needed.
        </p>
      </div>
      <p>
        <Link href="/work">Back to My Work</Link>
      </p>
      <section
        className="panel work-machine-summary"
        aria-label="Machine identity"
      >
        <h2>
          {machine.manufacturer ?? "Manufacturer not recorded"}{" "}
          {machine.model ?? "Model not recorded"}
        </h2>
        <dl>
          <div>
            <dt>Serial</dt>
            <dd>{machine.serial ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt>Machine type</dt>
            <dd>{machine.machineType}</dd>
          </div>
        </dl>
        <Link href={`/machines/${machine.id}`}>View Machine record</Link>
      </section>
      {!online ? (
        <p className="form-message" role="status">
          Reconnect before saving this check.
        </p>
      ) : null}
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      <section className="panel" aria-label="Bearing check result">
        <h2>What did you observe?</h2>
        <div className="initial-check-actions">
          {choices.map((item) => (
            <button
              type="button"
              key={item.choice}
              disabled={busy || !online}
              onClick={() => void choose(item.choice)}
            >
              <strong>{item.label}</strong>
              <span>{item.help}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
