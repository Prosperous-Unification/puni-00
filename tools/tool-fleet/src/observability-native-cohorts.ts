import { expandNativeOwner } from './observability-cold-start';

/** Reserve both full source cohorts; slots are accounting coordinates, never observed Pod identities. */
export function expandNativeCohorts(
  input: Omit<Parameters<typeof expandNativeOwner>[0], 'templates' | 'claimPointer' | 'pods'>,
  population: number,
) {
  // Proof: Task25c3b cohort-count and Task25c3g cohort-count removals lost the full replacement wave.
  return expandNativeOwner({
    ...input,
    pods: 2 * population,
    templates: [],
    claimPointer: () => {
      throw new Error('Replacement cohort claim template impossible');
    },
  }).map((charge, index) => {
    // Proof: Task25c3b cohort/slot substitutions and Task25c3g slot0 duplication failed exact source accounting identities.
    const cohort = index < population ? ('initial' as const) : ('replacement' as const);
    const slot = index % population;
    return {
      ...charge,
      kind: 'pod' as const,
      identity: `${input.identity}/${cohort}/${String(slot)}`,
      concurrency: { pods: 2 * population, cohort, slot },
    };
  });
}
