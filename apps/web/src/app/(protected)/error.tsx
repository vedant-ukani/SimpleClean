"use client";

import { useOnlineStatus } from "./online-status";

export default function ProtectedError({
  reset,
}: Readonly<{ reset: () => void }>) {
  const online = useOnlineStatus();
  return (
    <main className="page-main">
      <section className="panel state-panel" aria-labelledby="error-heading">
        <p className="eyebrow">Simple Clean Operations</p>
        <h1 id="error-heading">
          {online ? "This workspace is unavailable" : "You are offline"}
        </h1>
        <p className="lede">
          {online
            ? "Your session is still protected. No internal error details were shown. Try again shortly."
            : "Private operational records are not cached on this device. Reconnect before continuing."}
        </p>
        <button type="button" onClick={reset} disabled={!online}>
          Try again
        </button>
      </section>
    </main>
  );
}
