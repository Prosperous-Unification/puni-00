/** A work item as the picker shows it: a number and the name beside it. */
export interface PickableRow {
  id: string;
  number: string;
  name: string;
}

/**
 * The rows the Depends on picker may offer, narrowed by what was typed.
 *
 * The row picking its predecessors is never offered — a row cannot wait for
 * itself — and neither are the predecessors it already has: offering one would
 * be offering a click that be-01's unique pair turns into nothing. Anything
 * else is offered, including rows be-01 would refuse as a cycle or an ancestor;
 * the refusal carries a reason and the UI already relays it, whereas guessing
 * the graph here would be a second implementation of that judgement.
 *
 * The filter is a case-insensitive substring over the number and the name,
 * because those are the two things a person knows about the row they want.
 * Order is the order given, which is table order — the same order the eye
 * searches the table in.
 */
export function pickerEntries(
  rows: readonly PickableRow[],
  forRow: { id: string; dependsOn: readonly string[] },
  typed: string,
): PickableRow[] {
  const wanted = typed.trim().toLowerCase();
  const taken = new Set(forRow.dependsOn);
  return rows.filter(
    (row) =>
      row.id !== forRow.id &&
      !taken.has(row.id) &&
      (wanted === '' ||
        row.number.toLowerCase().includes(wanted) ||
        row.name.toLowerCase().includes(wanted)),
  );
}
