import { headers } from "next/headers";

import { getCatalogModels } from "../../../lib/catalog-client";
import { readProtectedRouteData } from "../../../lib/server-route-state";
import { CatalogView } from "./catalog-view";

export default async function CatalogPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    query?: string;
    manufacturer?: string;
    page?: string;
  }>;
}>) {
  const [params, requestHeaders] = await Promise.all([searchParams, headers()]);
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const parsedPage = Number(params.page);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const results = await readProtectedRouteData(
    getCatalogModels(
      {
        ...(params.query ? { query: params.query } : {}),
        ...(params.manufacturer ? { manufacturer: params.manufacturer } : {}),
        page,
      },
      fetch,
      process.env,
      cookie,
    ),
  );

  return (
    <main className="page-main page-main--wide">
      <div className="page-heading">
        <p className="eyebrow">Verified equipment reference</p>
        <h1>Catalog</h1>
        <p className="lede">
          Browse approved manufacturer model specifications and the official
          evidence behind each revision.
        </p>
      </div>
      <CatalogView
        initialResults={results}
        initialQuery={params.query ?? ""}
        initialManufacturer={params.manufacturer ?? ""}
      />
    </main>
  );
}
