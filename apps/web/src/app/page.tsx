import { getPlatformHealth } from "../lib/api-client";

export const dynamic = "force-dynamic";

interface HealthView {
  connected: boolean;
  databaseReady: boolean;
  checkedAt: string;
}

async function loadHealth(): Promise<HealthView> {
  try {
    const health = await getPlatformHealth();
    return {
      connected: health.live.status === "ok",
      databaseReady: health.ready.dependencies.database === "up",
      checkedAt: health.ready.timestamp,
    };
  } catch {
    return {
      connected: false,
      databaseReady: false,
      checkedAt: new Date().toISOString(),
    };
  }
}

function Status({ ready, label }: Readonly<{ ready: boolean; label: string }>) {
  return (
    <div className="status-row">
      <span className={ready ? "status-dot status-dot--ready" : "status-dot"} />
      <span>{label}</span>
      <strong>{ready ? "Ready" : "Unavailable"}</strong>
    </div>
  );
}

export default async function Home() {
  const health = await loadHealth();
  return (
    <main>
      <section className="hero">
        <div className="brand-mark" aria-hidden="true">
          SC
        </div>
        <p className="eyebrow">Simply Clean</p>
        <h1>Core Operations Platform</h1>
        <p className="lede">
          The secure operational foundation for every machine, from receiving
          through fulfillment.
        </p>
      </section>

      <section className="health-card" aria-labelledby="health-heading">
        <div className="card-heading">
          <div>
            <p className="eyebrow">System check</p>
            <h2 id="health-heading">Foundation health</h2>
          </div>
          <span
            className={
              health.connected && health.databaseReady
                ? "pill pill--ready"
                : "pill"
            }
          >
            {health.connected && health.databaseReady
              ? "Operational"
              : "Needs attention"}
          </span>
        </div>
        <Status ready={health.connected} label="API service" />
        <Status ready={health.databaseReady} label="Database" />
        <p className="checked-at">
          Last checked {new Date(health.checkedAt).toLocaleString("en-US")}
        </p>
      </section>
    </main>
  );
}
