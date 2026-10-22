import { parseWorkItemAddress } from '@wbs/domain/project-address';
import type { ScopedDependencyEndpoint } from '@wbs/domain/typed-dependency';

import type { AddressProject, DependencyLookup } from '@/modules/dependency-lookup/contract';

import { encodeDependencyEndpoint } from './dependency-selection';
import type { DependencyTokenObservation } from './dependency-token-bindings';
import type { NumberedRow } from './depends-input';

export interface DependencyObservation {
  project: AddressProject;
  revision: string | null;
}
export interface ResolvedDependencyToken {
  token: string;
  start: number;
  end: number;
  endpoint: ScopedDependencyEndpoint;
}

/** Resolves source spans once; qualified coordinates bind an observed stable project before authoring. */
export async function resolveDependencyDraft({
  typed,
  projectId,
  rows,
  nodes,
  lookup,
  observations,
}: {
  typed: string;
  projectId: string;
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
        endpoint = { projectId, scope: 'whole', workItemId: row.id };
      } else if (matches.length === 0 && steps.length === 1) {
        const step = steps[0];
        endpoint = { projectId, scope: 'node', workItemId: step.workItemId, stepId: step.stepId };
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
        problems.push(`${token} (choose a project)`);
        continue;
      }
      // Proof: using abbreviation-wide state rebound the retained selected occurrence to a replacement holder in the mounted round1 test.
      let bound = selected?.observation ?? observed.get(parsed.abbreviation);
      if (bound === undefined) {
        const projects = await lookup.discoverProjects(parsed.abbreviation, null);
        if (projects.kind !== 'success') {
          problems.push(
            `${token} (${projects.kind === 'cancelled' ? 'cancelled' : projects.kind === 'refusal' ? projects.body.error : 'lookup failed'})`,
          );
          continue;
        }
        const exact = projects.body.projects.filter(
          (project) => project.abbreviation.toUpperCase() === parsed.abbreviation,
        );
        // Proof: dropping the completeness gate bound PUNI from a truncated page in dependency-draft.test.ts (2026-10-22).
        if (projects.body.nextCursor !== null || exact.length !== 1) {
          problems.push(`${token} (choose a project)`);
          continue;
        }
        const project = exact[0];
        bound = { project, revision: null };
      }
      let revision = bound.revision;
      if (revision === null) {
        const page = await lookup.searchEndpoints(bound.project.projectId, parsed.reference, null);
        if (page.kind !== 'success') {
          problems.push(
            `${token} (${page.kind === 'cancelled' ? 'cancelled' : page.kind === 'refusal' ? page.body.error : 'lookup failed'})`,
          );
          continue;
        }
        if (page.body.project.projectId !== bound.project.projectId) {
          problems.push(`${token} (project changed)`);
          continue;
        }
        revision = page.body.addressRevision;
        bound = { project: page.body.project, revision };
      }
      if (observations?.some((binding) => binding.start === match.index) !== true)
        observed.set(parsed.abbreviation, bound);
      const resolution = await lookup.resolveReference(bound.project.projectId, token, revision);
      if (resolution.kind === 'success') {
        if (
          resolution.body.projectId === bound.project.projectId &&
          resolution.body.addressRevision === revision
        )
          endpoint = { ...resolution.body.endpoint, projectId: resolution.body.projectId };
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
