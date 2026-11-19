import { parseWorkItemAddress } from '@wbs/domain/work-package-address';
import type { ScopedDependencyEndpoint } from '@wbs/domain/typed-dependency';

import type { AddressWorkPackage, DependencyLookup } from '@/modules/dependency-lookup/contract';

import { encodeDependencyEndpoint } from './dependency-selection';
import type { DependencyTokenObservation } from './dependency-token-bindings';
import type { NumberedRow } from './depends-input';

export interface DependencyObservation {
  workPackage: AddressWorkPackage;
  revision: string | null;
}
export interface ResolvedDependencyToken {
  token: string;
  start: number;
  end: number;
  endpoint: ScopedDependencyEndpoint;
}

/** Resolves source spans once; qualified coordinates bind an observed stable work package before authoring. */
export async function resolveDependencyDraft({
  typed,
  workPackageId,
  rows,
  nodes,
  lookup,
  observations,
}: {
  typed: string;
  workPackageId: string;
  rows: readonly NumberedRow[];
  nodes: readonly { workItemId: string; stepId: string; reference: string | null }[];
  lookup: DependencyLookup;
  observations?: readonly DependencyTokenObservation[];
}): Promise<{ found: ResolvedDependencyToken[]; problems: string[] }> {
  const found: ResolvedDependencyToken[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const observed = new Map<string, DependencyObservation>();
  for (const match of typed.matchAll(/[^,\s]+/g)) {
    const token = match[0];
    const parsed = parseWorkItemAddress(token);
    let endpoint: ScopedDependencyEndpoint | null = null;
    let problem = 'not found';
    if (parsed.kind === 'local') {
      const matches = rows.filter((row) => row.number === parsed.reference);
      const steps = nodes.filter((node) => node.reference === parsed.reference);
      if (matches.length === 1) {
        const row = matches[0];
        endpoint = { workPackageId, scope: 'whole', workItemId: row.id };
      } else if (matches.length === 0 && steps.length === 1) {
        const step = steps[0];
        endpoint = {
          workPackageId,
          scope: 'node',
          workItemId: step.workItemId,
          stepId: step.stepId,
        };
      } else if (matches.length > 1 || steps.length > 1) problem = 'ambiguous';
    } else if (parsed.kind === 'qualified') {
      // Proof: removing span matching merged separately selected identical tokens into one holder (mounted round1 test).
      const selected = observations?.find(
        (binding) =>
          binding.start === match.index &&
          binding.end === match.index + token.length &&
          binding.token === token,
      );
      // Proof: dropping the ambiguity marker dependency authored instead of requiring reselection (mounted round1 duplicate-deletion test).
      if (selected?.requiresReselection === true) {
        problems.push(`${token} (choose a work package)`);
        continue;
      }
      // Proof: using abbreviation-wide state rebound the retained selected occurrence to a replacement holder in the mounted round1 test.
      let bound = selected?.observation ?? observed.get(parsed.abbreviation);
      if (bound === undefined) {
        const workPackages = await lookup.discoverWorkPackages(parsed.abbreviation, null);
        if (workPackages.kind !== 'success') {
          problems.push(
            `${token} (${workPackages.kind === 'cancelled' ? 'cancelled' : workPackages.kind === 'refusal' ? workPackages.body.error : 'lookup failed'})`,
          );
          continue;
        }
        const exact = workPackages.body.workPackages.filter(
          (workPackage) => workPackage.abbreviation.toUpperCase() === parsed.abbreviation,
        );
        // Proof: dropping the completeness gate bound PUNI from a truncated page in dependency-draft.test.ts (2026-10-22).
        if (workPackages.body.nextCursor !== null || exact.length !== 1) {
          problems.push(`${token} (choose a work package)`);
          continue;
        }
        const workPackage = exact[0];
        bound = { workPackage, revision: null };
      }
      let revision = bound.revision;
      if (revision === null) {
        const page = await lookup.searchEndpoints(
          bound.workPackage.workPackageId,
          parsed.reference,
          null,
        );
        if (page.kind !== 'success') {
          problems.push(
            `${token} (${page.kind === 'cancelled' ? 'cancelled' : page.kind === 'refusal' ? page.body.error : 'lookup failed'})`,
          );
          continue;
        }
        if (page.body.workPackage.workPackageId !== bound.workPackage.workPackageId) {
          problems.push(`${token} (work package changed)`);
          continue;
        }
        revision = page.body.addressRevision;
        bound = { workPackage: page.body.workPackage, revision };
      }
      if (observations?.some((binding) => binding.start === match.index) !== true)
        observed.set(parsed.abbreviation, bound);
      const resolution = await lookup.resolveReference(
        bound.workPackage.workPackageId,
        token,
        revision,
      );
      if (resolution.kind === 'success') {
        if (
          resolution.body.workPackageId === bound.workPackage.workPackageId &&
          resolution.body.addressRevision === revision
        )
          endpoint = { ...resolution.body.endpoint, workPackageId: resolution.body.workPackageId };
        else problem = 'addresses changed';
      } else
        problem =
          resolution.kind === 'cancelled'
            ? 'cancelled'
            : resolution.kind === 'refusal'
              ? resolution.body.error
              : 'lookup failed';
    } else problem = 'malformed';
    if (endpoint === null) {
      problems.push(`${token} (${problem})`);
      continue;
    }
    const key = encodeDependencyEndpoint(endpoint);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ token, start: match.index, end: match.index + token.length, endpoint });
  }
  return { found, problems };
}
