/** A project as the picker shows it: a name, and the id it selects. */
export interface PickableProject {
  id: string;
  name: string;
}

/**
 * The projects the picker may offer, narrowed by what was typed.
 *
 * A case-insensitive substring over the name, the same rule the Depends on
 * picker uses — two pickers side by side that filter differently is a surprise
 * with nothing to gain from it.
 *
 * **Order is the order given, always.** be-01 answers in this account's own
 * order — opened first by recency, then never-opened by creation — and that is
 * the whole point of the change: re-sorting here, even by "best match", would
 * be a second ordering rule quietly overruling the one the server computed.
 */
export function matchingProjects<T extends PickableProject>(
  projects: readonly T[],
  typed: string,
): T[] {
  const wanted = typed.trim().toLowerCase();
  if (wanted === '') return [...projects];
  return projects.filter((project) => project.name.toLowerCase().includes(wanted));
}
