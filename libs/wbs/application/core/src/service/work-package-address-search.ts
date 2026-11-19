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
  AddressWorkPackage,
  CapturedWorkPackageAddresses,
  WorkPackageAddressSearchStore,
  WorkPackageAddressSnapshot,
} from '../ports/work-package-address-search';
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
import { digestQualifiedAddressSpace } from './work-package-address-revision';

export type AddressEndpoint =
  | { scope: 'whole'; workItemId: string }
  | { scope: 'node'; workItemId: string; stepId: string }
  | { scope: 'descendant-step'; workItemId: string; stepId: string };
export interface AddressCandidate {
  workPackageId: string;
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
  // Proof: removing this guard failed all four mounted JSON-null cases (alphabetic/numeric/empty discovery and selected-work-package paging returned 200 instead of 400, 2026-10-22).
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
function prepareAddresses(captured: CapturedWorkPackageAddresses) {
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
  captured: CapturedWorkPackageAddresses,
  prepared: ReturnType<typeof prepareAddresses>,
): Generator<AddressCandidate> {
  const steps = orderSteps(captured.steps);
  const parents = new Set(prepared.workItems.map((workItem) => workItem.parentId));
  for (const workItem of prepared.workItems) {
    const base = {
      workPackageId: captured.workPackage.workPackageId,
      workItemId: workItem.id,
      number: workItem.number,
      name: workItem.name,
    };
    yield {
      ...base,
      endpoint: { scope: 'whole', workItemId: workItem.id },
      reference: `${captured.workPackage.abbreviation}.${workItem.number}`,
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
            : `${captured.workPackage.abbreviation}.${formatStepReference(workItem.number, step.code, index + 1, steps.length)}`,
        step: { ...step, ordinal: index + 1 },
      };
    }
  }
}
/** Read observations only; selected IDs are reauthorized by later command transactions. */
export class WorkPackageAddressSearch {
  constructor(
    private readonly store: WorkPackageAddressSearchStore,
    private readonly digest: Digest,
  ) {}
  private digestBinding(
    snapshot: WorkPackageAddressSnapshot,
    search: string,
    workPackageId: string | null,
  ) {
    return this.digest.sha256(
      JSON.stringify([
        'work-package-address',
        snapshot.access.kind === 'legacy'
          ? 'legacy'
          : `org:${snapshot.access.scope.organizationId}`,
        search.toLowerCase(),
        workPackageId,
      ]),
    );
  }
  discoverWorkPackages(principal: OrganizationPrincipal, query: Query) {
    return this.store.withSnapshot(principal, async (snapshot) => {
      const binding = await this.digestBinding(snapshot, query.search, null);
      const cursor = query.cursor;
      // Proof: removing this binding comparison failed mounted cursor reuse (changed query returned 200 instead of 400, 2026-10-22).
      if (
        cursor !== null &&
        (!isCursorOf(cursor, ['kind', 'binding', 'abbreviation', 'workPackageId']) ||
          cursor['kind'] !== 'address-work-packages' ||
          cursor['binding'] !== binding ||
          typeof cursor['abbreviation'] !== 'string' ||
          typeof cursor['workPackageId'] !== 'string')
      )
        return invalid;
      const workPackages: AddressWorkPackage[] = [];
      // Proof: removing the ASCII-letter gate failed mounted `numeric input is not external discovery` (NUM leaked for 010, 2026-10-22).
      if (!/^[A-Za-z]/.test(query.search))
        return { kind: 'work_packages', workPackages, nextCursor: null } as const;
      let after: { abbreviation: string; workPackageId: string } | null = null;
      if (cursor !== null) {
        const abbreviation = cursor['abbreviation'];
        const workPackageId = cursor['workPackageId'];
        if (typeof abbreviation !== 'string' || typeof workPackageId !== 'string') return invalid;
        after = { abbreviation, workPackageId };
      }
      while (workPackages.length <= query.limit) {
        const chunk = snapshot.searchWorkPackages(query.search, after, query.limit + 1);
        for (const workPackage of chunk) {
          after = workPackage;
          if (
            workPackage.abbreviation.toLowerCase().startsWith(query.search.toLowerCase()) ||
            nameMatches(workPackage.name, query.search)
          )
            workPackages.push(workPackage);
          if (workPackages.length > query.limit) break;
        }
        if (workPackages.length > query.limit || chunk.length < query.limit + 1) break;
      }
      const more = workPackages.length > query.limit;
      // Proof: removing this cut failed mounted `alphabetic prefix is bounded and organization scoped` (two work packages instead of one, 2026-10-22).
      const page = workPackages.slice(0, query.limit);
      const last = page.at(-1);
      return {
        kind: 'work_packages',
        workPackages: page,
        nextCursor:
          more && last !== undefined
            ? encodeCursor({
                v: 1,
                kind: 'address-work-packages',
                binding,
                abbreviation: last.abbreviation,
                workPackageId: last.workPackageId,
              })
            : null,
      } as const;
    });
  }
  discoverCandidates(principal: OrganizationPrincipal, workPackageId: string, query: Query) {
    return this.store.withSnapshot(principal, async (snapshot) => {
      const captured = snapshot.capture(workPackageId);
      if (captured === null) return missing;
      const prepared = prepareAddresses(captured);
      const addressRevision = await digestQualifiedAddressSpace(
        workPackageId,
        captured.workPackage.abbreviation,
        prepared.space,
        this.digest,
      );
      const binding = await this.digestBinding(snapshot, query.search, workPackageId);
      const cursor = query.cursor;
      // Proof: removing endpoint binding failed mounted cursor reuse (changed query/work-package returned 200 instead of 400, 2026-10-22).
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
      // Proof: removing this cut failed mounted `selected workPackage scopes steps and work items and caps flattened candidates` (three candidates instead of two, 2026-10-22).
      const page = candidates.slice(0, query.limit);
      const last = page.at(-1);
      const key = last === undefined ? null : describeCoordinate(last);
      return {
        kind: 'candidates',
        workPackage: captured.workPackage,
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
    workPackageId: string,
    reference: string,
    revision: string,
  ) {
    return this.store.withSnapshot(principal, async (snapshot) => {
      const captured = snapshot.capture(workPackageId);
      if (captured === null) return missing;
      const parsed = parseWorkItemAddress(reference);
      // Proof: removing syntax refusal failed mounted `manual punctuation and lowercase resolve and malformed syntax precedes stale` (409 instead of 422, 2026-10-22).
      if (parsed.kind === 'invalid') return { kind: 'unresolvable', reason: 'malformed' } as const;
      const prepared = prepareAddresses(captured);
      const addressRevision = await digestQualifiedAddressSpace(
        workPackageId,
        captured.workPackage.abbreviation,
        prepared.space,
        this.digest,
      );
      // Proof: removing this comparison failed the mounted punctuation/stale test (404 instead of 409 after abbreviation rename, 2026-10-22).
      if (revision !== addressRevision) return { kind: 'stale', addressRevision } as const;
      // Proof: removing prefix agreement failed mounted missing-endpoint checks (422 instead of generic 404 for OTHER.080, 2026-10-22).
      if (parsed.kind === 'qualified' && parsed.abbreviation !== captured.workPackage.abbreviation)
        return missing;
      if (parseStepReference(parsed.reference) !== null) {
        const resolved = resolveStepReference(parsed.reference, prepared.space);
        if (!resolved.ok)
          return resolved.reason === 'unknown_work_item' || resolved.reason === 'unknown_code'
            ? missing
            : ({ kind: 'unresolvable', reason: resolved.reason } as const);
        return {
          kind: 'resolved',
          workPackageId,
          endpoint: { scope: 'node', ...resolved.ref },
          stepNodeId: formatStepNodeId(resolved.ref),
          reference: `${captured.workPackage.abbreviation}.${resolved.reference}`,
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
        workPackageId,
        endpoint: { scope: 'whole', workItemId: holder.id },
        reference: `${captured.workPackage.abbreviation}.${parsed.reference}`,
        addressRevision,
      } as const;
    });
  }
}
