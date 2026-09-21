export function OperationsFilters({
  action,
  targetType,
  targetId,
}: Readonly<{
  action?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
}>) {
  return (
    <section className="panel">
      <form className="search-form" method="get">
        <label>
          Action
          <input
            name="action"
            defaultValue={action ?? ""}
            placeholder="inventory.machine.created"
          />
        </label>
        <label>
          Target type
          <input
            name="targetType"
            defaultValue={targetType ?? ""}
            placeholder="machine"
          />
        </label>
        <label>
          Target ID
          <input
            name="targetId"
            defaultValue={targetId ?? ""}
            placeholder="Exact record ID"
          />
        </label>
        <button type="submit">Filter history</button>
      </form>
    </section>
  );
}
