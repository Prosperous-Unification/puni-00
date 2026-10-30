import type { ParticipantSnapshot } from './dependency-participant-transition';
import { orderMounts } from './docker-inventory';
import { assertSame, readFields, readIdentity } from './managed-cohort';
import { parseSolverSnapshot } from './solver-cohort';

function captureMembers(values: readonly unknown[]): Map<string, Record<string, unknown>> {
  const members = new Map<string, Record<string, unknown>>();
  for (const value of values) {
    // Proof: separately dropping State, Config or NetworkSettings admitted the respective parked-peer drift; all three omission tests failed.
    const member = structuredClone(readFields(value));
    const id = readIdentity(member['Id']);
    // Proof: omitting duplicate admission let a repeated current ID collapse into the map; duplicate test failed.
    if (members.has(id)) throw new Error('participant inventory duplicated');
    member['Mounts'] = orderMounts(member['Mounts']);
    members.set(id, member);
  }
  return members;
}
/** Compares full native inventory, retaining State and every network/configuration field. Selected replacements come from explicit lifecycle checks; removals must decode as terminal managed solvers. */
export function assertParticipantInventory(
  parked: readonly unknown[],
  current: readonly unknown[],
  selected: ReadonlySet<string>,
  running: ReadonlyMap<string, ParticipantSnapshot>,
  removed: ReadonlySet<string>,
): void {
  const original = captureMembers(parked);
  const observed = captureMembers(current);
  // Proof: omitting the exact three-member roster admitted a missing parked selected role; selected-missing test failed.
  if (selected.size !== 3) throw new Error('participant selected roster differs');
  // Proof: omitting membership admitted a foreign selected ID; selected-foreign test failed.
  for (const id of selected)
    if (!original.has(id)) throw new Error('participant selected identity is foreign');
  for (const [id, bound] of running) {
    // Proof: omitting selection admitted a rebound Caddy peer; unknown-binding test failed.
    if (!selected.has(id) || bound.id !== id)
      throw new Error('participant running binding is foreign');
    const replacement = captureMembers([bound.native]).get(id);
    if (replacement === undefined) throw new Error('participant running binding is absent');
    original.set(id, replacement);
  }
  for (const id of removed) {
    const member = original.get(id);
    if (member === undefined || selected.has(id)) throw new Error('participant removal is foreign');
    // Proof: omitting managed-solver decoding let the Caddy peer disappear; removed-peer test failed.
    const solver = parseSolverSnapshot(member, id);
    if (solver.solver.phase === 'running') throw new Error('participant solver removal was live');
    original.delete(id);
  }
  // Proof: omitting membership admitted an additional full-ID peer; extra-container test failed.
  assertSame(
    [...original.keys()].sort(),
    [...observed.keys()].sort(),
    'participant complete inventory membership',
  );
  for (const [id, expected] of original)
    assertSame(expected, observed.get(id), 'participant complete native identity');
}
