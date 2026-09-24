import Link from "next/link";
import { headers } from "next/headers";

import { getCatalogModel } from "../../../../lib/catalog-client";
import { readProtectedRouteData } from "../../../../lib/server-route-state";
import { CatalogDetailView } from "./catalog-detail-view";

export default async function CatalogDetailPage({
  params,
}: Readonly<{ params: Promise<{ revisionId: string }> }>) {
  const [{ revisionId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const model = await readProtectedRouteData(
    getCatalogModel(revisionId, fetch, process.env, cookie),
  );

  return (
    <main className="page-main page-main--wide">
      <p className="back-link">
        <Link href="/catalog">← Back to Catalog</Link>
      </p>
      <CatalogDetailView model={model} />
    </main>
  );
}
