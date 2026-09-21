"use client";

export default function ErrorBoundary({
  reset,
}: Readonly<{ reset: () => void }>) {
  return (
    <main>
      <section className="health-card">
        <p className="eyebrow">Simply Clean</p>
        <h1>We could not load this page.</h1>
        <p className="lede">
          The platform did not expose any sensitive error details.
        </p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
