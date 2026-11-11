/**
 * Planning's canonical command name and aliases.
 * Proof: removing n fails "n selects the same typed planning request".
 */
export const navigator = { name: 'navigator', aliases: ['nav', 'n'] } as const;

/** Static judgment's canonical command name and aliases. */
export const burokrat = { name: 'burokrat', aliases: ['bur', 'b'] } as const;

/** Execution's canonical command name and alias. */
export const dash = { name: 'dash', aliases: ['d'] } as const;

/** One public PUNI tool namespace, independent of how it was spelled on invocation. */
export type Namespace = typeof navigator.name | typeof burokrat.name | typeof dash.name;

/** Resolves only the registered namespace names and aliases, for usage-status attribution. */
export function findNamespace(word: string | undefined): Namespace | undefined {
  for (const namespace of [navigator, burokrat, dash])
    if (word === namespace.name || namespace.aliases.some((alias) => alias === word))
      return namespace.name;
  return undefined;
}
