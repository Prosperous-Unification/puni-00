import Ajv2020 from 'ajv/dist/2020.js';

import schema from '../solver-wire.v5.json';
import type { ConnectedSolverRequest } from './wire-types';

// Proof: replacing this checked-in JSON dependency with an import.meta.url
// filesystem read made the release-style bundled local/connected caller exit
// 1 with ENOENT; the source entry still ran. Bun must inline these bytes.
const validator = new Ajv2020({ strict: false, allErrors: true }).compile({
  $schema: schema.$schema,
  $ref: '#/$defs/request-connected',
  $defs: schema.$defs,
});

/** Find retained occupancy whose rounded coordinates exceed the safe integer range. */
export function findUnrepresentableOccupancy(
  occupancy: ConnectedSolverRequest['scope']['occupancy'],
  quantum: number,
): string | null {
  for (const holder of occupancy) {
    // For a well-formed holder 0 <= start < finish, finish dominates both
    // scaled coordinates. Malformed holders are refused by request validation.
    const scaledFinish = holder.finish * quantum;
    if (scaledFinish > Number.MAX_SAFE_INTEGER) return holder.key;
  }
  return null;
}

/** Check the complete normative connected arm before preparing a terminal finding. */
export function validateConnectedSolverRequest(request: ConnectedSolverRequest): void {
  if (!validator(request)) {
    throw new Error(
      `connected solver request violates wire 5: ${JSON.stringify(validator.errors)}`,
    );
  }
  // Proof: 28 individually weakened predicates each failed a named Bun
  // contract test; the corruptions include duplicate keys, wrong owners,
  // unmatched occupancy and bookings outside the request horizon.
  const keys = new Set(request.slices.map((slice) => slice.key));
  if (keys.size !== request.slices.length) throw new Error('connected solver slice keys repeat');
  for (const [name, offsets] of [
    ['movementReferenceOffsets', request.movementReferenceOffsets],
    ['feasibleBaselineOffsets', request.feasibleBaselineOffsets],
    ['seedOffsets', request.seedOffsets],
  ] as const) {
    if (offsets === null) continue;
    if (Object.keys(offsets).length !== keys.size)
      throw new Error(`${name} does not key on all local slices`);
    for (const [key, offset] of Object.entries(offsets)) {
      if (!keys.has(key) || offset > request.horizonUnits)
        throw new Error(`${name} contains a missing or out-of-horizon slice`);
    }
  }
  for (const edge of request.edges) {
    if (!keys.has(edge.predecessorKey) || !keys.has(edge.successorKey))
      throw new Error('connected solver edge does not name local slices');
  }
  const projects = new Set(request.scope.projects.map((project) => project.projectId));
  if (projects.size !== request.scope.projects.length || !projects.has(request.scope.projectId))
    throw new Error('connected solver projects are inconsistent');
  const fixed = new Map(request.scope.fixed.map((entry) => [entry.key, entry]));
  if (fixed.size !== request.scope.fixed.length) throw new Error('connected fixed keys repeat');
  for (const entry of request.scope.fixed) {
    if (
      keys.has(entry.key) ||
      !projects.has(entry.projectId) ||
      entry.projectId === request.scope.projectId
    )
      throw new Error('connected fixed slice has invalid ownership');
    if (entry.start > entry.finish) throw new Error('connected fixed slice has reversed placement');
  }
  for (const boundary of request.scope.boundaries) {
    const foreign = fixed.get(boundary.foreignKey);
    if (!keys.has(boundary.localKey))
      throw new Error('connected boundary has invalid endpoints or owner');
    if (foreign === undefined) throw new Error('connected boundary has invalid endpoints or owner');
    if (foreign.projectId !== boundary.foreignProjectId)
      throw new Error('connected boundary has invalid endpoints or owner');
  }
  for (const holder of request.scope.occupancy) {
    const foreign = fixed.get(holder.key);
    if (foreign === undefined)
      throw new Error('connected occupancy does not match fixed foreign slice');
    if (
      foreign.projectId !== holder.projectId ||
      foreign.start !== holder.start ||
      foreign.finish !== holder.finish ||
      holder.start >= holder.finish
    )
      throw new Error('connected occupancy does not match fixed foreign slice');
  }
  // Proof: moving this check below local-person filtering let a foreign-only
  // 1e15-day holder reach a terminal that the installed CLI refused with 64.
  const unsafeHolder = findUnrepresentableOccupancy(request.scope.occupancy, request.quantum);
  if (unsafeHolder !== null)
    throw new Error(`connected occupancy ${unsafeHolder} exceeds safe quantization range`);
  const localPeople = new Set(
    request.slices.flatMap((slice) =>
      slice.durationUnits > 0 && slice.personId !== null ? [slice.personId] : [],
    ),
  );
  const expected = new Map<string, [number, number][]>();
  for (const holder of request.scope.occupancy) {
    if (!localPeople.has(holder.personId)) continue;
    const startUnits = Math.max(0, Math.floor(holder.start * request.quantum));
    const endUnits = Math.ceil(holder.finish * request.quantum);
    const intervals = expected.get(holder.personId) ?? [];
    intervals.push([startUnits, endUnits]);
    expected.set(holder.personId, intervals);
  }
  for (const intervals of expected.values()) {
    intervals.sort(([left], [right]) => left - right);
    for (let index = intervals.length - 1; index > 0; index -= 1) {
      const current = intervals[index];
      const previous = intervals[index - 1];
      if (current[0] < previous[1]) {
        previous[1] = Math.max(previous[1], current[1]);
        intervals.splice(index, 1);
      }
    }
  }
  if (Object.keys(request.elsewhere).length !== expected.size)
    throw new Error('connected elsewhere person set differs from foreign occupancy');
  for (const [person, intervals] of expected) {
    const actual = request.elsewhere[person];
    if (JSON.stringify(actual) !== JSON.stringify(intervals))
      throw new Error('connected elsewhere intervals differ from foreign occupancy');
  }
  for (const bookings of Object.values(request.elsewhere)) {
    for (const [, end] of bookings) {
      // Positive ordered spans already follow from equality to the union of
      // rounded retained holders; only the request horizon remains to check.
      if (end > request.horizonUnits) throw new Error('connected person booking is invalid');
    }
  }
}
