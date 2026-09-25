"use client";

import type {
  MachineDetail,
  ProductionWorkDestination,
} from "@laundrorama/contracts";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  fallbackCodeForLookup,
  loginPathForScanToken,
  tokenFromFragment,
} from "../../../lib/qr-client";
import { requestStatus } from "../../../lib/request-status";
import { useOnlineStatus } from "../online-status";
import { QrCameraScanner } from "./qr-camera-scanner";

type ScanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "forbidden" }
  | { status: "offline" }
  | { status: "error" }
  | { status: "work_error" }
  | { status: "success"; detail: MachineDetail };

type ScanResultProps =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "invalid" }
  | { state: "forbidden" }
  | { state: "offline" }
  | { state: "error" }
  | { state: "work_error" }
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
  if (props.state === "offline") {
    return (
      <p className="form-error" role="alert">
        Reconnect before looking up this private Machine record.
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
  if (props.state === "work_error") {
    return (
      <p className="form-error" role="alert">
        Machine found, but active Test work could not be checked. Try again.
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

export function scanFailureState(
  error: unknown,
): "invalid" | "forbidden" | "error" {
  const status = requestStatus(error);
  if (status === 400 || status === 404) return "invalid";
  if (status === 401 || status === 403) return "forbidden";
  return "error";
}

export function ScanView({
  navigateToLogin = (path) => window.location.assign(path),
  navigateToWork = (path) => window.location.assign(path),
  canRouteToWork = false,
}: Readonly<{
  navigateToLogin?: (path: string) => void;
  navigateToWork?: (path: string) => void;
  canRouteToWork?: boolean;
}> = {}) {
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const [fallbackCode, setFallbackCode] = useState("");
  const submittedFragment = useRef(false);
  const resolving = useRef(false);
  const online = useOnlineStatus();

  async function resolve(input: { token: string } | { fallbackCode: string }) {
    if (resolving.current) return;
    if (!online) {
      setState({ status: "offline" });
      return;
    }
    resolving.current = true;
    setState({ status: "loading" });
    try {
      const { resolveQrLabel } = await import("../../../lib/qr-client");
      const detail = await resolveQrLabel(input);
      if (canRouteToWork) {
        let destination: ProductionWorkDestination;
        try {
          const { getProductionWorkDestination } =
            await import("../../../lib/production-client");
          destination = await getProductionWorkDestination(detail.machine.id);
        } catch (error) {
          if (requestStatus(error) === 401) {
            navigateToLogin(
              "token" in input
                ? (loginPathForScanToken(input.token) ?? "/login")
                : "/login",
            );
          } else {
            setState({ status: "work_error" });
          }
          return;
        }
        if (destination.kind === "session") {
          navigateToWork(
            `/work/session/${destination.sessionId}?machine=${detail.machine.id}`,
          );
          return;
        }
        if (destination.kind === "test") {
          navigateToWork(`/work/${destination.orderId}`);
          return;
        }
        if (destination.kind === "initial_check") {
          navigateToWork(`/work/initial-check/${destination.machineId}`);
          return;
        }
      }
      setState({ status: "success", detail });
    } catch (error) {
      if (requestStatus(error) === 401) {
        const loginPath =
          "token" in input ? loginPathForScanToken(input.token) : "/login";
        navigateToLogin(loginPath ?? "/login");
        return;
      }
      setState({ status: scanFailureState(error) });
    } finally {
      resolving.current = false;
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
        <QrCameraScanner
          online={online}
          busy={state.status === "loading"}
          onToken={(token) => void resolve({ token })}
        />
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
          <button
            disabled={state.status === "loading" || !online}
            type="submit"
          >
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
