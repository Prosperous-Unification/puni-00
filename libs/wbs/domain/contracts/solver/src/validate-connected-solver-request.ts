import { readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';

import type { ConnectedSolverRequest } from './wire-types';

// The checked-in normative schema is trusted package data; a missing or
// malformed copy fails module initialization before a solver is prepared.
const schema = JSON.parse(
  readFileSync(new URL('../solver-wire.v5.json', import.meta.url), 'utf8'),
) as { $schema: string; $defs: Record<string, unknown> };
const validator = new Ajv2020({ strict: false, allErrors: true }).compile({
  $schema: schema.$schema,
  $ref: '#/$defs/request-connected',
  $defs: schema.$defs,
});

/** Check the complete normative connected arm before preparing a terminal finding. */
export function validateConnectedSolverRequest(request: ConnectedSolverRequest): void {
  if (!validator(request)) {
    throw new Error(
      `connected solver request violates wire 5: ${JSON.stringify(validator.errors)}`,
    );
  }
  // Proof: returning after schema validation made nine production-contract
  // corruptions pass, including duplicate keys, owner mismatch, and missing
  // occupancy bookings (one focused Bun test failed with all nine listed).
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
  }
  for (const boundary of request.scope.boundaries) {
    const foreign = fixed.get(boundary.foreignKey);
    if (!keys.has(boundary.localKey) || foreign?.projectId !== boundary.foreignProjectId)
      throw new Error('connected boundary has invalid endpoints or owner');
  }
  for (const holder of request.scope.occupancy) {
    const foreign = fixed.get(holder.key);
    if (
      foreign?.projectId !== holder.projectId ||
      foreign.start !== holder.start ||
      foreign.finish !== holder.finish ||
      holder.start >= holder.finish
    )
      throw new Error('connected occupancy does not match fixed foreign slice');
  }
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
    if (!Number.isSafeInteger(startUnits) || !Number.isSafeInteger(endUnits))
      throw new Error('connected occupancy exceeds safe quantization range');
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
    throw new Error('connected elsewhere differs from foreign occupancy');
  for (const [person, intervals] of expected) {
    const actual = request.elsewhere[person];
    if (JSON.stringify(actual) !== JSON.stringify(intervals))
      throw new Error('connected elsewhere differs from foreign occupancy');
  }
  for (const bookings of Object.values(request.elsewhere)) {
    let previousEnd = 0;
    for (const [start, end] of bookings) {
      if (start >= end || start < previousEnd || end > request.horizonUnits)
        throw new Error('connected person booking is invalid');
      previousEnd = end;
    }
  }
}
