import {
  deriveNumbers,
  formatStepNodeId,
  formatStepReference,
  orderSteps,
  parseStepReference,
  parseWorkItemAddress,
  resolveStepReference,
} from '@wbs/domain';

import { buildAddressSpace } from '../module/work-item/step-addresses';
import type { OrganizationPrincipal } from '../ports/organization-access';
import type {
  AddressProject,
  CapturedProjectAddresses,
  ProjectAddressSearchStore,
  ProjectAddressSnapshot,
} from '../ports/project-address-search';
import type { Digest } from '../ports/runtime';
import {
  decodeCursor,
  encodeCursor,
  hasRepeatedKey,
  isCursorOf,
  limitOf,
  nameMatches,
  type PageQueryInput,
  searchOf,
} from './list-query';
import { digestQualifiedAddressSpace } from './project-address-revision';

export type AddressEndpoint =
  | { scope: 'whole'; workItemId: string }
  | { scope: 'node'; workItemId: string; stepId: string }
  | { scope: 'descendant-step'; workItemId: string; stepId: string };
export interface AddressCandidate {
  projectId: string;
  workItemId: string;
  number: string;
  name: string;
  endpoint: AddressEndpoint;
  reference: string | null;
  stepNodeId?: string;
  step?: { id: string; code: string | null; name: string; position: number; ordinal: number };
}
const invalid = { kind: 'invalid_query' } as const;
const missing = { kind: 'not_found' } as const;
export function addressPageQueryOf(input: PageQueryInput, url: URL) {
  if (hasRepeatedKey(url)) return null;
  const limit = limitOf(input.limit);
  const search = input.q === undefined || input.q.trim() === '' ? '' : searchOf(input.q);
  const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor);
  // Proof: removing this guard failed all four mounted JSON-null cases (alphabetic/numeric/empty discovery and selected-project paging returned 200 instead of 400, 2026-10-22).
  if (input.cursor !== undefined && cursor === null) return null;
  return limit === null || search === null || cursor === undefined
    ? null
    : { limit, search, cursor };
}
type Query = NonNullable<ReturnType<typeof addressPageQueryOf>>;
function describeCoordinate(candidate: AddressCandidate) {
  return [
    candidate.workItemId,
    candidate.endpoint.scope,
    candidate.endpoint.scope === 'whole' ? null : candidate.endpoint.stepId,
  ];
}
function isSameCoordinate(candidate: AddressCandidate, cursor: Record<string, unknown>) {
  const [workItemId, scope, stepId] = describeCoordinate(candidate);
  return (
    workItemId === cursor['workItemId'] && scope === cursor['scope'] && stepId === cursor['stepId']
  );
}
function prepareAddresses(captured: CapturedProjectAddresses) {
  const numbers = deriveNumbers(captured.placements);
  const workItems = captured.placements
    .map((placement) => {
      const number = numbers.get(placement.id);
      if (number === undefined) throw new Error('address placement has no effective number');
      return { ...placement, number };
    })
    .sort((left, right) =>
      left.number < right.number
        ? -1
        : left.number > right.number
          ? 1
          : left.id < right.id
            ? -1
            : left.id > right.id
              ? 1
              : 0,
    );
  return { workItems, space: buildAddressSpace(workItems, captured.steps) };
}
function* iterateCandidates(
  captured: CapturedProjectAddresses,
  prepared: ReturnType<typeof prepareAddresses>,
): Generator<AddressCandidate> {
  const steps = orderSteps(captured.steps);
  const parents = new Set(prepared.workItems.map((workItem) => workItem.parentId));
  for (const workItem of prepared.workItems) {
    const base = {
      projectId: captured.project.projectId,
      workItemId: workItem.id,
      number: workItem.number,
      name: workItem.name,
    };
    yield {
      ...base,
      endpoint: { scope: 'whole', workItemId: workItem.id },
      reference: `${captured.project.abbreviation}.${workItem.number}`,
    };
    for (const [index, step] of steps.entries()) {
      const isLeaf = !parents.has(workItem.id);
      yield {
        ...base,
        endpoint: {
          scope: isLeaf ? 'node' : 'descendant-step',
          workItemId: workItem.id,
          stepId: step.id,
        },
        ...(isLeaf
          ? { stepNodeId: formatStepNodeId({ workItemId: workItem.id, stepId: step.id }) }
          : {}),
        reference:
          !isLeaf || step.code === null
            ? null
            : `${captured.project.abbreviation}.${formatStepReference(workItem.number, step.code, index + 1, steps.length)}`,
        step: { ...step, ordinal: index + 1 },
      };
    }
  }
}
/** Read observations only; selected IDs are reauthorized by later command transactions. */
export class ProjectAddressSearch {
  constructor(
    private readonly store: ProjectAddressSearchStore,
    private readonly digest: Digest,
  ) {}
  private digestBinding(
    snapshot: ProjectAddressSnapshot,
    search: string,
    projectId: string | null,
  ) {
    return this.digest.sha256(
      JSON.stringify([
        'project-address',
        snapshot.access.kind === 'legacy'
          ? 'legacy'
          : `org:${snapshot.access.scope.organizationId}`,
        search.toLowerCase(),
        projectId,
      ]),
    );
  }
  discoverProjects(principal: OrganizationPrincipal, query: Query) {
    return this.store.withSnapshot(principal, async (snapshot) => {
      const binding = await this.digestBinding(snapshot, query.search, null);
      const cursor = query.cursor;
      // Proof: removing this binding comparison failed mounted cursor reuse (changed query returned 200 instead of 400, 2026-10-22).
      if (
        cursor !== null &&
        (!isCursorOf(cursor, ['kind', 'binding', 'abbreviation', 'projectId']) ||
          cursor['kind'] !== 'address-projects' ||
          cursor['binding'] !== binding ||
          typeof cursor['abbreviation'] !== 'string' ||
          typeof cursor['projectId'] !== 'string')
      )
        return invalid;
      const projects: AddressProject[] = [];
      // Proof: removing the ASCII-letter gate failed mounted `numeric input is not external discovery` (NUM leaked for 010, 2026-10-22).
      if (!/^[A-Za-z]/.test(query.search))
        return { kind: 'projects', projects, nextCursor: null } as const;
      let after: { abbreviation: string; projectId: string } | null = null;
      if (cursor !== null) {
        const abbreviation = cursor['abbreviation'];
        const projectId = cursor['projectId'];
        if (typeof abbreviation !== 'string' || typeof projectId !== 'string') return invalid;
        after = { abbreviation, projectId };
      }
      while (projects.length <= query.limit) {
        const chunk = snapshot.searchProjects(query.search, after, query.limit + 1);
        for (const project of chunk) {
          after = project;
          if (
            project.abbreviation.toLowerCase().startsWith(query.search.toLowerCase()) ||
            nameMatches(project.name, query.search)
          )
            projects.push(project);
          if (projects.length > query.limit) break;
        }
        if (projects.length > query.limit || chunk.length < query.limit + 1) break;
      }
      const more = projects.length > query.limit;
      // Proof: removing this cut failed mounted `alphabetic prefix is bounded and organization scoped` (two projects instead of one, 2026-10-22).
      const page = projects.slice(0, query.limit);
      const last = page.at(-1);
      return {
        kind: 'projects',
        projects: page,
        nextCursor:
          more && last !== undefined
            ? encodeCursor({
                v: 1,
                kind: 'address-projects',
                binding,
                abbreviation: last.abbreviation,
                projectId: last.projectId,
              })
            : null,
      } as const;
    });
  }
  discoverCandidates(principal: OrganizationPrincipal, projectId: string, query: Query) {
    return this.store.withSnapshot(principal, async (snapshot) => {
      const captured = snapshot.capture(projectId);
      if (captured === null) return missing;
      const prepared = prepareAddresses(captured);
      const addressRevision = await digestQualifiedAddressSpace(
        projectId,
        captured.project.abbreviation,
        prepared.space,
        this.digest,
      );
      const binding = await this.digestBinding(snapshot, query.search, projectId);
      const cursor = query.cursor;
      // Proof: removing endpoint binding failed mounted cursor reuse (changed query/project returned 200 instead of 400, 2026-10-22).
      if (
        cursor !== null &&
        (!isCursorOf(cursor, ['kind', 'binding', 'revision', 'workItemId', 'scope', 'stepId']) ||
          cursor['kind'] !== 'address-candidates' ||
          cursor['binding'] !== binding ||
          typeof cursor['revision'] !== 'string' ||
          typeof cursor['workItemId'] !== 'string' ||
          // Proof: removing string/literal scope validation failed mounted `rejects array cursor scope before stale revision checks` (409 instead of 400; current revision remains a passing control, 2026-10-22).
          typeof cursor['scope'] !== 'string' ||
          !['whole', 'node', 'descendant-step'].includes(cursor['scope']) ||
          !(cursor['scope'] === 'whole'
            ? cursor['stepId'] === null
            : typeof cursor['stepId'] === 'string'))
      )
        return invalid;
      // Proof: removing continuation staleness failed mounted `changes revision for leafhood and uncoded step order but keeps label-only edits` (200 instead of 409, 2026-10-22).
      if (cursor !== null && cursor['revision'] !== addressRevision)
        return { kind: 'stale', addressRevision } as const;
      let resumed = cursor === null;
      const candidates: AddressCandidate[] = [];
      for (const candidate of iterateCandidates(captured, prepared)) {
        if (!resumed) {
          if (cursor !== null && isSameCoordinate(candidate, cursor)) resumed = true;
          continue;
        }
        if (
          query.search !== '' &&
          ![
            candidate.number,
            candidate.name,
            candidate.reference,
            candidate.step?.code,
            candidate.step?.name,
          ].some((text) => text !== null && text !== undefined && nameMatches(text, query.search))
        )
          continue;
        candidates.push(candidate);
        if (candidates.length > query.limit) break;
      }
      // Proof: removing this refusal failed mounted impossible-coordinate continuation (200 instead of 400, 2026-10-22).
      if (!resumed) return invalid;
      const more = candidates.length > query.limit;
      // Proof: removing this cut failed mounted `selected project scopes steps and work items and caps flattened candidates` (three candidates instead of two, 2026-10-22).
      const page = candidates.slice(0, query.limit);
      const last = page.at(-1);
      const key = last === undefined ? null : describeCoordinate(last);
      return {
        kind: 'candidates',
        project: captured.project,
        addressRevision,
        candidates: page,
        nextCursor:
          more && key !== null
            ? encodeCursor({
                v: 1,
                kind: 'address-candidates',
                binding,
                revision: addressRevision,
                workItemId: key[0],
                scope: key[1],
                stepId: key[2],
              })
            : null,
      } as const;
    });
  }
  resolveReference(
    principal: OrganizationPrincipal,
    projectId: string,
    reference: string,
    revision: string,
  ) {
    return this.store.withSnapshot(principal, async (snapshot) => {
      const captured = snapshot.capture(projectId);
      if (captured === null) return missing;
      const parsed = parseWorkItemAddress(reference);
      // Proof: removing syntax refusal failed mounted `manual punctuation and lowercase resolve and malformed syntax precedes stale` (409 instead of 422, 2026-10-22).
      if (parsed.kind === 'invalid') return { kind: 'unresolvable', reason: 'malformed' } as const;
      const prepared = prepareAddresses(captured);
      const addressRevision = await digestQualifiedAddressSpace(
        projectId,
        captured.project.abbreviation,
        prepared.space,
        this.digest,
      );
      // Proof: removing this comparison failed the mounted punctuation/stale test (404 instead of 409 after abbreviation rename, 2026-10-22).
      if (revision !== addressRevision) return { kind: 'stale', addressRevision } as const;
      // Proof: removing prefix agreement failed mounted missing-endpoint checks (422 instead of generic 404 for OTHER.080, 2026-10-22).
      if (parsed.kind === 'qualified' && parsed.abbreviation !== captured.project.abbreviation)
        return missing;
      if (parseStepReference(parsed.reference) !== null) {
        const resolved = resolveStepReference(parsed.reference, prepared.space);
        if (!resolved.ok)
          return resolved.reason === 'unknown_work_item' || resolved.reason === 'unknown_code'
            ? missing
            : ({ kind: 'unresolvable', reason: resolved.reason } as const);
        return {
          kind: 'resolved',
          projectId,
          endpoint: { scope: 'node', ...resolved.ref },
          stepNodeId: formatStepNodeId(resolved.ref),
          reference: `${captured.project.abbreviation}.${resolved.reference}`,
          addressRevision,
        } as const;
      }
      const holders = prepared.workItems.filter((workItem) => workItem.number === parsed.reference);
      // Proof: removing the holder count failed mounted `refuses duplicate numbers and missing endpoints without changing database state` (200 instead of 422, 2026-10-22).
      if (holders.length > 1)
        return { kind: 'unresolvable', reason: 'ambiguous_work_item' } as const;
      const holder = holders.at(0);
      if (holder === undefined) return missing;
      return {
        kind: 'resolved',
        projectId,
        endpoint: { scope: 'whole', workItemId: holder.id },
        reference: `${captured.project.abbreviation}.${parsed.reference}`,
        addressRevision,
      } as const;
    });
  }
}
