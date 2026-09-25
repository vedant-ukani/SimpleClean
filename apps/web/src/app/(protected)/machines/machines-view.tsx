"use client";

import type { MachineSearchResponse } from "@laundrorama/contracts";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { useOnlineStatus } from "../online-status";
import { useServerState } from "../use-server-state";
import { recorded } from "./machine-labels";

function pageHref(page: number, query: string): string {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/machines?${suffix}` : "/machines";
}

export function MachinesView({
  initialResults,
  initialQuery,
}: Readonly<{
  initialResults: MachineSearchResponse;
  initialQuery: string;
}>) {
  const [machines] = useServerState(initialResults.machines);
  const online = useOnlineStatus();
  const totalPages = Math.max(
    1,
    Math.ceil(initialResults.total / initialResults.pageSize),
  );

  return (
    <div className="inventory-stack">
      <section className="panel machines-search-panel">
        <form className="machines-search-form" method="get">
          <label htmlFor="machine-query">Search Machines</label>
          <div className="machines-search-controls">
            <input
              id="machine-query"
              name="query"
              type="search"
              placeholder="ID, manufacturer, model, serial, or load"
              defaultValue={initialQuery}
              maxLength={160}
            />
            <button type="submit" disabled={!online}>
              Search
            </button>
          </div>
        </form>
      </section>
      <section
        className="panel machines-results-panel"
        aria-labelledby="machines-results-heading"
      >
        <h2 className="sr-only" id="machines-results-heading">
          {initialResults.total} Machine{initialResults.total === 1 ? "" : "s"}
        </h2>
        {machines.length === 0 ? (
          <p className="empty-state">No Machines match this search.</p>
        ) : (
          <div className="machines-results">
            <div className="machines-results-header" aria-hidden="true">
              <span>Machine</span>
              <span>Serial</span>
              <span>Model Number</span>
              <span>Type / Capacity</span>
              <span />
            </div>
            <ul className="machines-results-list">
              {machines.map((machine) => {
                const name = `${recorded(machine.manufacturer)} ${recorded(machine.model)}`;
                const serial = recorded(machine.serial);
                const modelNumber = recorded(machine.model);
                const type =
                  machine.machineType === "washer"
                    ? "Washer"
                    : machine.machineType === "dryer"
                      ? "Dryer"
                      : "Other";
                const typeAndCapacity =
                  machine.capacityLb == null
                    ? type
                    : `${type} · ${machine.capacityLb} lb`;

                return (
                  <li key={machine.id}>
                    <Link
                      className="machines-results-row"
                      href={`/machines/${machine.id}`}
                      aria-label={`Open Machine details for ${name}, serial ${serial}, model number ${modelNumber}, ${typeAndCapacity}`}
                    >
                      <strong className="machines-result-name">{name}</strong>
                      <span className="machines-result-serial">
                        <span className="machines-result-mobile-label">
                          Serial:{" "}
                        </span>
                        {serial}
                      </span>
                      <span className="machines-result-model">
                        <span className="machines-result-mobile-label">
                          Model Number:{" "}
                        </span>
                        {modelNumber}
                      </span>
                      <span className="machines-result-type">
                        <span className="machines-result-mobile-label">
                          Type / Capacity:{" "}
                        </span>
                        {typeAndCapacity}
                      </span>
                      <ChevronRight
                        className="machines-result-chevron"
                        size={20}
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {totalPages > 1 ? (
          <nav className="pagination" aria-label="Machines pagination">
            {initialResults.page > 1 ? (
              <Link href={pageHref(initialResults.page - 1, initialQuery)}>
                Previous page
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            <span>
              Page {initialResults.page} of {totalPages}
            </span>
            {initialResults.page < totalPages ? (
              <Link href={pageHref(initialResults.page + 1, initialQuery)}>
                Next page
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
