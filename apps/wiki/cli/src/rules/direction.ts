import type { KindedFile, KindGraph, ServiceKind } from './kinds';
import type { RuleObservation } from './rule';

/** One resolved import edge, as `extractRelationships().typescript.imports` spells it. */
export interface ImportEdge {
  readonly source: string;
  readonly specifier: string;
  readonly target: string;
  readonly importKind: string;
}

const ReExportKinds = new Set(['re-export', 'type-re-export']);

/**
 * Every file one import reaches: the direct target, plus everything that target re-exports, and so
 * on. A barrel therefore cannot hide the kind of the file behind it, which is what lint cannot see
 * and this check must. External targets are returned but never expanded. The visited set makes a
 * re-export cycle terminate.
 */
export function reachedTargets(imports: readonly ImportEdge[], target: string): readonly string[] {
  const reached: string[] = [];
  const seen = new Set<string>();
  const queue = [target];
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    reached.push(next);
    if (next.startsWith('external:')) continue;
    for (const edge of imports) {
      // Proof: on 2026-09-20, returning only the direct target made the barrel test receive
      // `findings: []` instead of the expected repository finding.
      if (edge.source === next && ReExportKinds.has(edge.importKind)) queue.push(edge.target);
    }
  }
  return reached;
}

/** One direction rule: which importing kind it governs and which kinds it may not reach. */
export interface Direction {
  readonly from: ServiceKind;
  readonly forbidden: readonly ServiceKind[];
}

function kindedByPath(graph: KindGraph): Map<string, KindedFile> {
  return new Map(graph.files.map((file) => [file.path, file]));
}

function sorted(observations: RuleObservation[]): readonly RuleObservation[] {
  return observations.sort((left, right) =>
    `${left.path}\u0000${left.subject ?? ''}` < `${right.path}\u0000${right.subject ?? ''}`
      ? -1
      : 1,
  );
}

/** Every import a file of the governed kind makes into a forbidden kind, barrels resolved. */
export function directionObservations(
  graph: KindGraph,
  imports: readonly ImportEdge[],
  direction: Direction,
): readonly RuleObservation[] {
  const kinded = kindedByPath(graph);
  const reported = new Set<string>();
  const observations: RuleObservation[] = [];
  for (const edge of imports) {
    const source = kinded.get(edge.source);
    // Written as an optional chain because `lint:source` refuses
    // `source === undefined || source.kind !== direction.from` with `prefer-optional-chain`.
    if (source?.kind !== direction.from) continue;
    for (const target of reachedTargets(imports, edge.target)) {
      const reachedFile = kinded.get(target);
      // Proof: on 2026-09-20, dropping the forbidden-kind membership test made the allowed-resource
      // test receive one K3 debt finding instead of `findings: []`.
      if (reachedFile === undefined || !direction.forbidden.includes(reachedFile.kind)) continue;
      const key = `${edge.source}\u0000${target}`;
      if (reported.has(key)) continue;
      reported.add(key);
      observations.push({
        path: edge.source,
        subject: target,
        message: `${direction.from} imports ${reachedFile.kind} ${target} through '${edge.specifier}'`,
      });
    }
  }
  return sorted(observations);
}

/** K6: a kind importing the same kind from another module. */
export function sidewaysObservations(
  graph: KindGraph,
  imports: readonly ImportEdge[],
): readonly RuleObservation[] {
  const kinded = kindedByPath(graph);
  const reported = new Set<string>();
  const observations: RuleObservation[] = [];
  for (const edge of imports) {
    const source = kinded.get(edge.source);
    if (source === undefined) continue;
    for (const target of reachedTargets(imports, edge.target)) {
      const reachedFile = kinded.get(target);
      if (reachedFile === undefined) continue;
      // Proof: on 2026-09-20, forcing the same-module comparison true removed the cross-module K6
      // finding; forcing it false added a same-module K6 finding where the two named tests expected
      // the opposite outcomes.
      if (reachedFile.kind !== source.kind || reachedFile.module === source.module) continue;
      const key = `${edge.source}\u0000${target}`;
      if (reported.has(key)) continue;
      reported.add(key);
      observations.push({
        path: edge.source,
        subject: target,
        message: `${source.kind} in ${source.module} imports ${reachedFile.kind} in ${reachedFile.module}`,
      });
    }
  }
  return sorted(observations);
}

/** A store or geometry module the consumer's policy declares plain TypeScript. */
export type PlainSelector =
  | { readonly kind: 'path'; readonly value: string }
  | { readonly kind: 'prefix'; readonly value: string };

export type SelectorOutcome =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Refuses a selector the candidate no longer satisfies. Without this a stale selector silently
 * leaves F1's coverage, so it is a failure to evaluate rather than an allowed candidate.
 */
export function resolvePlainSelectors(
  selectors: readonly PlainSelector[],
  entryPaths: ReadonlySet<string>,
): SelectorOutcome {
  for (const selector of selectors) {
    // Proof: on 2026-09-20, deleting this branch made the exact-path invocation expect exit 1 and
    // receive 0.
    if (selector.kind === 'path' && !entryPaths.has(selector.value)) {
      return {
        ok: false,
        reason: `the rule policy declares plain TypeScript at ${selector.value}, which the candidate does not contain`,
      };
    }
    if (selector.kind === 'prefix') {
      const covered = [...entryPaths].some((path) => path.startsWith(`${selector.value}/`));
      // Proof: on 2026-09-20, neutralizing this refusal made the prefix invocation expect exit 1
      // and receive 0.
      if (!covered) {
        return {
          ok: false,
          reason: `the rule policy declares plain TypeScript under ${selector.value}, which covers no candidate file`,
        };
      }
    }
  }
  return { ok: true };
}

function matchesSelector(path: string, selectors: readonly PlainSelector[]): boolean {
  // Proof: on 2026-09-20, disabling the prefix arm removed its expected store finding; dropping
  // the trailing slash produced two findings because `src/more/store.ts` also matched `src/m`.
  return selectors.some((selector) =>
    selector.kind === 'path' ? path === selector.value : path.startsWith(`${selector.value}/`),
  );
}

const ReactTargets = new Set(['external:react', 'external:react-dom']);
const ReactScopePrefix = 'external:@tanstack/react-';

/**
 * F1: a service file, a store or a geometry module reaching React. Delivery may; the others may not.
 * Policy-declared selectors cover stores and geometry because their paths carry no kind marker.
 */
export function reactObservations(
  graph: KindGraph,
  imports: readonly ImportEdge[],
  plainSelectors: readonly PlainSelector[],
): readonly RuleObservation[] {
  const kinded = kindedByPath(graph);
  const reported = new Set<string>();
  const observations: RuleObservation[] = [];
  for (const edge of imports) {
    const source = kinded.get(edge.source);
    // Proof: on 2026-09-20, deleting this skip added a delivery-to-React finding where the delivery
    // exemption test expected none.
    if (source?.kind === 'delivery') continue;
    const declaredPlain = matchesSelector(edge.source, plainSelectors);
    // Proof: on 2026-09-20, ignoring `declaredPlain` removed the exact-path store finding; the test
    // expected one and received none.
    if (source === undefined && !declaredPlain) continue;
    for (const target of reachedTargets(imports, edge.target)) {
      // Proof: on 2026-09-20, dropping the scoped prefix removed the expected
      // `external:@tanstack/react-query` finding.
      if (!ReactTargets.has(target) && !target.startsWith(ReactScopePrefix)) continue;
      const key = `${edge.source}\u0000${target}`;
      if (reported.has(key)) continue;
      reported.add(key);
      observations.push({
        path: edge.source,
        subject: target,
        message: `${source?.kind ?? 'declared plain TypeScript'} imports ${target} through '${edge.specifier}'`,
      });
    }
  }
  return sorted(observations);
}
