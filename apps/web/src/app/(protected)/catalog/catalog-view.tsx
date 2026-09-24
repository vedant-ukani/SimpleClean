import type { CatalogListResponse } from "@simply-clean/contracts";
import Link from "next/link";

function equipmentLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pageHref(page: number, query: string, manufacturer: string): string {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (manufacturer) params.set("manufacturer", manufacturer);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/catalog?${suffix}` : "/catalog";
}

export function CatalogView({
  initialResults,
  initialQuery,
  initialManufacturer,
}: Readonly<{
  initialResults: CatalogListResponse;
  initialQuery: string;
  initialManufacturer: string;
}>) {
  const totalPages = Math.max(
    1,
    Math.ceil(initialResults.total / initialResults.pageSize),
  );
  const hasPrevious = initialResults.page > 1;
  const hasNext = initialResults.page < totalPages;

  return (
    <div className="inventory-stack">
      <section className="panel" aria-labelledby="catalog-search-heading">
        <h2 id="catalog-search-heading">Find a model</h2>
        <form className="search-form" method="get">
          <label>
            Search model or family
            <input
              name="query"
              defaultValue={initialQuery}
              maxLength={240}
              placeholder="e.g. T-400 or WCVD"
            />
          </label>
          <label>
            Manufacturer
            <input
              name="manufacturer"
              defaultValue={initialManufacturer}
              maxLength={240}
              placeholder="e.g. Dexter"
            />
          </label>
          <button type="submit">Search Catalog</button>
        </form>
      </section>

      <section className="panel" aria-labelledby="catalog-results-heading">
        <div className="section-heading-row">
          <h2 id="catalog-results-heading">
            {initialResults.total} approved model
            {initialResults.total === 1 ? "" : "s"}
          </h2>
          <span className="status">
            Page {initialResults.page} of {totalPages}
          </span>
        </div>
        {initialResults.models.length === 0 ? (
          <p className="empty-state">
            No approved Catalog models match these filters.
          </p>
        ) : (
          <div className="import-table-wrap">
            <table className="import-table catalog-table">
              <caption className="sr-only">Approved Catalog models</caption>
              <thead>
                <tr>
                  <th scope="col">Manufacturer</th>
                  <th scope="col">Family</th>
                  <th scope="col">Model</th>
                  <th scope="col">Equipment class</th>
                  <th scope="col">Revision</th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {initialResults.models.map((model) => (
                  <tr key={model.revisionId}>
                    <td>{model.manufacturer}</td>
                    <td>{model.family}</td>
                    <td>
                      <strong>{model.model}</strong>
                    </td>
                    <td>{equipmentLabel(model.equipmentClass)}</td>
                    <td>{model.revision}</td>
                    <td>
                      <Link
                        className="button-link"
                        href={`/catalog/${encodeURIComponent(model.revisionId)}`}
                      >
                        View model
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 ? (
          <nav className="pagination" aria-label="Catalog pagination">
            {hasPrevious ? (
              <Link
                href={pageHref(
                  initialResults.page - 1,
                  initialQuery,
                  initialManufacturer,
                )}
              >
                Previous page
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            {hasNext ? (
              <Link
                href={pageHref(
                  initialResults.page + 1,
                  initialQuery,
                  initialManufacturer,
                )}
              >
                Next page
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
