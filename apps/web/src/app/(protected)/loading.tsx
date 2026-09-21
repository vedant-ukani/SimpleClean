export default function ProtectedLoading() {
  return (
    <main className="page-main" aria-busy="true" aria-label="Loading page">
      <div className="loading-skeleton loading-skeleton--heading" />
      <div className="loading-skeleton loading-skeleton--panel" />
      <p className="sr-only" role="status">
        Loading…
      </p>
    </main>
  );
}
