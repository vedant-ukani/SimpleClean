export default function OfflinePage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="offline-heading">
        <div className="brand-mark" aria-hidden="true">
          L
        </div>
        <p className="eyebrow">Laundrorama Operations</p>
        <h1 id="offline-heading">You are offline</h1>
        <p className="lede">
          Reconnect before viewing records or recording work. Operational data
          is not stored on this device for offline use.
        </p>
        <p>
          <a className="button-link" href="/">
            Try again
          </a>
        </p>
      </section>
    </main>
  );
}
