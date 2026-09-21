"use client";

import type { MachineDetail } from "@simply-clean/contracts";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  fallbackCodeForLookup,
  loginPathForScanToken,
  tokenFromFragment,
} from "../../../lib/qr-client";

type ScanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "forbidden" }
  | { status: "error" }
  | { status: "success"; detail: MachineDetail };

type ScanResultProps =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "invalid" }
  | { state: "forbidden" }
  | { state: "error" }
  | { state: "success"; detail: MachineDetail };

export function ScanResult(props: Readonly<ScanResultProps>) {
  if (props.state === "idle") {
    return (
      <p className="empty-state">
        Scan a label or enter the fallback code printed beneath it.
      </p>
    );
  }
  if (props.state === "loading") {
    return <p className="scan-status">Looking up equipment…</p>;
  }
  if (props.state === "invalid") {
    return (
      <p className="form-error" role="alert">
        This label is not valid or is no longer active. Check the printed code
        and try again.
      </p>
    );
  }
  if (props.state === "forbidden") {
    return (
      <p className="form-error" role="alert">
        Your account does not have permission to view this Machine.
      </p>
    );
  }
  if (props.state === "error") {
    return (
      <p className="form-error" role="alert">
        The label could not be checked. Try again.
      </p>
    );
  }

  const { machine } = props.detail;
  return (
    <article className="scan-result-card">
      <p className="eyebrow">Machine found</p>
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
          <dt>Location</dt>
          <dd>{machine.currentLocationCode ?? "Not assigned"}</dd>
        </div>
        <div>
          <dt>Inventory state</dt>
          <dd>{machine.inventoryState}</dd>
        </div>
        <div>
          <dt>Production state</dt>
          <dd>{machine.productionState}</dd>
        </div>
      </dl>
      <Link className="button-link" href={`/machines/${machine.id}`}>
        Open Machine details
      </Link>
    </article>
  );
}

function errorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}

export function scanFailureState(
  error: unknown,
): "invalid" | "forbidden" | "error" {
  const status = errorStatus(error);
  if (status === 400 || status === 404) return "invalid";
  if (status === 401 || status === 403) return "forbidden";
  return "error";
}

export function ScanView({
  navigateToLogin = (path) => window.location.assign(path),
}: Readonly<{ navigateToLogin?: (path: string) => void }> = {}) {
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const [fallbackCode, setFallbackCode] = useState("");
  const submittedFragment = useRef(false);

  async function resolve(input: { token: string } | { fallbackCode: string }) {
    setState({ status: "loading" });
    try {
      const { resolveQrLabel } = await import("../../../lib/qr-client");
      setState({ status: "success", detail: await resolveQrLabel(input) });
    } catch (error) {
      if (errorStatus(error) === 401 && "token" in input) {
        const loginPath = loginPathForScanToken(input.token);
        if (loginPath) {
          navigateToLogin(loginPath);
          return;
        }
      }
      setState({ status: scanFailureState(error) });
    }
  }

  useEffect(() => {
    if (submittedFragment.current) return;
    submittedFragment.current = true;
    const hash = window.location.hash;
    const token = tokenFromFragment(hash);
    if (hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
    if (!token) {
      if (hash) setState({ status: "invalid" });
      return;
    }
    void resolve({ token });
  }, [navigateToLogin]);

  function submitFallback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = fallbackCodeForLookup(fallbackCode);
    if (!normalized) {
      setState({ status: "invalid" });
      return;
    }
    void resolve({ fallbackCode: normalized });
  }

  return (
    <div className="scan-layout">
      <div className="page-heading">
        <p className="eyebrow">Warehouse lookup</p>
        <h1>Scan equipment label</h1>
        <p className="lede">
          A scanned label opens here automatically. If scanning is unavailable,
          enter the fallback code printed on the label.
        </p>
      </div>
      <section className="panel scan-panel">
        <form className="scan-form" onSubmit={submitFallback}>
          <label htmlFor="fallback-code">Enter fallback code</label>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            id="fallback-code"
            inputMode="text"
            name="fallbackCode"
            placeholder="ABCDEFGHJKMNPQRS"
            spellCheck={false}
            value={fallbackCode}
            onChange={(event) => setFallbackCode(event.currentTarget.value)}
          />
          <button disabled={state.status === "loading"} type="submit">
            Look up Machine
          </button>
        </form>
        <div aria-live="polite" className="scan-result">
          {state.status === "success" ? (
            <ScanResult state="success" detail={state.detail} />
          ) : (
            <ScanResult state={state.status} />
          )}
        </div>
      </section>
    </div>
  );
}
