import Link from "next/link";

export default function ProtectedNotFound() {
  return (
    <main className="page-main">
      <section className="panel state-panel" aria-labelledby="missing-heading">
        <p className="eyebrow">Record not found</p>
        <h1 id="missing-heading">This record is not available</h1>
        <p className="lede">
          It may not exist, or your account may not have permission to view it.
        </p>
        <Link className="button-link" href="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
