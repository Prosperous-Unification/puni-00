import type { DependencyObservation } from './dependency-draft';
import { currentDependencyToken } from './depends-input';

export interface DependencyTokenObservation {
  start: number;
  end: number;
  token: string;
  observation: DependencyObservation;
  requiresReselection?: true;
  selectionId?: number;
}

/** Retains unchanged token occurrences across one text edit; only the active occurrence may extend its selected project prefix. */
export function retainDependencyBindings(
  previous: string,
  typed: string,
  bindings: readonly DependencyTokenObservation[],
): DependencyTokenObservation[] {
  let prefix = 0;
  while (prefix < previous.length && prefix < typed.length && previous[prefix] === typed[prefix])
    prefix += 1;
  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < typed.length - prefix &&
    previous[previous.length - suffix - 1] === typed[typed.length - suffix - 1]
  )
    suffix += 1;
  const tokens = [...typed.matchAll(/[^,\s]+/g)];
  const previousTokens = [...previous.matchAll(/[^,\s]+/g)];
  const ambiguous = new Set(
    bindings
      .filter((binding) => {
        const before = previousTokens.filter((token) => token[0] === binding.token).length;
        const after = tokens.filter((token) => token[0] === binding.token).length;
        return before > 1 && after < before;
      })
      .map((binding) => binding.token),
  );
  const activeStart = currentDependencyToken(previous).prefix.length;
  return bindings.flatMap((binding) => {
    const start =
      binding.end <= prefix
        ? binding.start
        : binding.start >= previous.length - suffix
          ? binding.start + typed.length - previous.length
          : binding.start === activeStart && prefix >= binding.start
            ? binding.start
            : null;
    if (start === null) return [];
    const occurrence = tokens.find((token) => token.index === start);
    if (occurrence === undefined) return [];
    const token = occurrence[0];
    const unchanged = token === binding.token;
    const extendsActive =
      binding.start === activeStart &&
      token.toUpperCase().startsWith(`${binding.observation.project.abbreviation.toUpperCase()}.`);
    // Proof: removing this prefix guard kept the chosen remote scope after numeric replacement (mounted dependency-search round1 negative).
    if (!unchanged && !extendsActive) return [];
    // Proof: without this refusal marker an ambiguous duplicate-token deletion authored a surviving occurrence without explicit reselection (mounted round1 test).
    return [
      {
        ...binding,
        token,
        start,
        end: start + token.length,
        ...(ambiguous.has(binding.token) ? { requiresReselection: true as const } : {}),
      },
    ];
  });
}

/** Captures occurrence authority without treating a refreshed revision as a new user selection. */
export function encodeDependencyBindings(bindings: readonly DependencyTokenObservation[]): string {
  return JSON.stringify(
    bindings.map((binding) => [
      binding.start,
      binding.end,
      binding.token,
      binding.observation.project.projectId,
      binding.selectionId ?? null,
      binding.requiresReselection === true,
    ]),
  );
}
