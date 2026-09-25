import type { CatalogModelDetail } from "@laundrorama/contracts";

function equipmentLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function valueOrUnknown(value: number | null): string {
  return value === null ? "Unknown" : String(value);
}

function listOrUnknown(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "Unknown";
}

export function CatalogDetailView({
  model,
}: Readonly<{ model: CatalogModelDetail }>) {
  const specs = [
    ["Width", valueOrUnknown(model.specs.widthIn), "in"],
    ["Depth", valueOrUnknown(model.specs.depthIn), "in"],
    ["Height", valueOrUnknown(model.specs.heightIn), "in"],
    ["Weight", valueOrUnknown(model.specs.weightLb), "lb"],
    ["Capacity", valueOrUnknown(model.specs.capacityLb), "lb"],
  ] as const;

  return (
    <div className="inventory-stack">
      <div className="page-heading">
        <p className="eyebrow">Approved Catalog model</p>
        <h1>{model.model}</h1>
        <p className="lede">
          {model.manufacturer} · {model.family} ·{" "}
          {equipmentLabel(model.equipmentClass)}
        </p>
      </div>

      <section
        className="panel detail-grid"
        aria-labelledby="catalog-facts-heading"
      >
        <h2 id="catalog-facts-heading">Model facts</h2>
        <dl>
          <div>
            <dt>Manufacturer</dt>
            <dd>{model.manufacturer}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{model.model}</dd>
          </div>
          <div>
            <dt>Family</dt>
            <dd>{model.family}</dd>
          </div>
          <div>
            <dt>Equipment class</dt>
            <dd>{equipmentLabel(model.equipmentClass)}</dd>
          </div>
          <div>
            <dt>Production range</dt>
            <dd>
              {model.productionStartYear ?? "Unknown"}–
              {model.productionEndYear ?? "Unknown"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel" aria-labelledby="catalog-specs-heading">
        <h2 id="catalog-specs-heading">Specifications</h2>
        <div className="import-table-wrap">
          <table className="import-table">
            <caption className="sr-only">Approved model specifications</caption>
            <thead>
              <tr>
                <th scope="col">Specification</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {specs.map(([label, value, unit]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value === "Unknown" ? value : `${value} ${unit}`}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Voltage</th>
                <td>{listOrUnknown(model.specs.voltage)}</td>
              </tr>
              <tr>
                <th scope="row">Phase</th>
                <td>{listOrUnknown(model.specs.phase.map(equipmentLabel))}</td>
              </tr>
              <tr>
                <th scope="row">Fuel</th>
                <td>{listOrUnknown(model.specs.fuel.map(equipmentLabel))}</td>
              </tr>
              <tr>
                <th scope="row">Configuration</th>
                <td>{listOrUnknown(model.specs.configuration)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="catalog-sources-heading">
        <h2 id="catalog-sources-heading">Official sources</h2>
        {model.sources.length === 0 ? (
          <p className="empty-state">No source documents are recorded.</p>
        ) : (
          <div className="inventory-list">
            {model.sources.map((source) => (
              <article className="inventory-row" key={source.id}>
                <div>
                  <strong>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                  </strong>
                  <span>Retrieved {source.retrievedAt.slice(0, 10)}</span>
                  <small>
                    Document revision: {source.documentRevision ?? "Unknown"}
                  </small>
                  <small>
                    {source.checksum
                      ? "Checksum verified"
                      : `Checksum unavailable: ${source.checksumUnavailableReason ?? "Reason not recorded"}`}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
