import type { DependencyStore, StoredDependency, WriteStamp } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

export const DEPENDENCY_SURVIVOR_IDS = [
  'dependency-survivor-one',
  'dependency-survivor-two',
] as const;

function byId(edges: StoredDependency[]): StoredDependency[] {
  return edges.toSorted((left, right) => left.id.localeCompare(right.id));
}

function edge(
  id: string,
  workPackageId: string,
  predecessorId: string,
  successorId: string,
): StoredDependency {
  return { id, workPackageId, predecessorId, successorId };
}

async function addEdge(
  port: DependencyStore,
  dependency: StoredDependency,
  stamp: WriteStamp,
): Promise<void> {
  await port.add(structuredClone(dependency), stamp);
}

/** Shared dependency cases observed through complete public work package lists. */
export function dependencyRegistrations(
  open: OpenCase<'dependencies'>,
): readonly CaseRegistration[] {
  return [
    storeCase(
      'dependencies',
      'dependencies.listByWorkItems:incident-scope',
      open,
      async ({ port, seed }) => {
        const [firstId, secondId] = seed.workItemIds[0];
        await addEdge(
          port,
          edge('edge-targeted', seed.workPackageIds[0], firstId, secondId),
          seed.stamps[0],
        );
        expect(
          (await port.listByWorkItems(seed.workPackageIds[0], [firstId])).map(({ id }) => id),
        ).toEqual(['edge-targeted']);
        // Proof: an unrelated edge in this answer makes the exact id list fail.
        expect(await port.listByWorkItems(seed.workPackageIds[0], ['work-missing'])).toEqual([]);
        expect(
          await port.listByWorkItems(seed.workPackageIds[0], [seed.workItemIds[1][0]]),
        ).toEqual([]);
        expect(await port.listByWorkItems(seed.workPackageIds[0], [])).toEqual([]);
        await addEdge(
          port,
          edge(
            'edge-cross-work-package',
            seed.workPackageIds[0],
            seed.workItemIds[1][0],
            seed.workItemIds[1][1],
          ),
          seed.stamps[0],
        );
        // Proof: dropping endpoint work package validation returned this malformed
        // edge when the other work package's id was targeted.
        expect(
          port.listByWorkItems(seed.workPackageIds[0], [seed.workItemIds[1][0]]),
        ).rejects.toThrow(/endpoint outside work package/);
      },
    ),
    storeCase(
      'dependencies',
      'dependencies.add:idempotent-pair',
      open,
      async ({ port, readers, seed }) => {
        const [predecessorId, successorId] = seed.workItemIds[0];
        const [survivorOneId, survivorTwoId] = DEPENDENCY_SURVIVOR_IDS;
        const original = edge(
          'dependency-idempotent-original',
          seed.workPackageIds[0],
          predecessorId,
          successorId,
        );
        const samePair = edge(
          'dependency-idempotent-second-id',
          seed.workPackageIds[0],
          predecessorId,
          successorId,
        );
        const surviving = edge(
          'dependency-idempotent-surviving',
          seed.workPackageIds[0],
          survivorOneId,
          survivorTwoId,
        );
        const otherWorkPackage = edge(
          'dependency-idempotent-other-work-package',
          seed.workPackageIds[1],
          seed.workItemIds[1][0],
          seed.workItemIds[1][1],
        );

        await addEdge(port, original, seed.stamps[0]);
        await addEdge(port, surviving, seed.stamps[0]);
        await addEdge(port, otherWorkPackage, seed.stamps[1]);
        // Proof: in-place input-ID faults on both real sources store the
        // complete mutated edge while this independent original remains fixed.
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[0]))).toEqual(
          byId([original, surviving]),
        );
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[1]))).toEqual([
          otherWorkPackage,
        ]);

        await addEdge(port, samePair, seed.stamps[1]);
        // Proof: both ID-keyed source faults retain the original and add this
        // complete second-ID edge through adapter-owned storage.
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[0]))).toEqual(
          byId([original, surviving]),
        );
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[1]))).toEqual([
          otherWorkPackage,
        ]);

        await addEdge(port, samePair, seed.stamps[1]);
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[0]))).toEqual(
          byId([original, surviving]),
        );
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[1]))).toEqual([
          otherWorkPackage,
        ]);
      },
    ),
    storeCase('dependencies', 'dependencies.remove:pair', open, async ({ port, readers, seed }) => {
      const [predecessorId, successorId] = seed.workItemIds[0];
      const [survivorOneId, survivorTwoId] = DEPENDENCY_SURVIVOR_IDS;
      const selected = edge(
        'dependency-remove-selected',
        seed.workPackageIds[0],
        predecessorId,
        successorId,
      );
      const samePredecessor = edge(
        'dependency-remove-same-predecessor',
        seed.workPackageIds[0],
        predecessorId,
        survivorOneId,
      );
      const sameSuccessor = edge(
        'dependency-remove-same-successor',
        seed.workPackageIds[0],
        survivorTwoId,
        successorId,
      );
      const surviving = edge(
        'dependency-remove-surviving',
        seed.workPackageIds[0],
        survivorOneId,
        survivorTwoId,
      );
      const otherWorkPackage = edge(
        'dependency-remove-other-work-package',
        seed.workPackageIds[1],
        seed.workItemIds[1][0],
        seed.workItemIds[1][1],
      );
      const workPackageA = [selected, samePredecessor, sameSuccessor, surviving];
      for (const seeded of workPackageA) await addEdge(port, seeded, seed.stamps[0]);
      await addEdge(port, otherWorkPackage, seed.stamps[1]);
      expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[0]))).toEqual(
        byId(workPackageA),
      );
      expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[1]))).toEqual([
        otherWorkPackage,
      ]);

      await port.remove(predecessorId, successorId, seed.stamps[1]);
      // Proof: both source proofs omit the successor half of the pair
      // predicate; the received list loses the exact same-predecessor edge.
      expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[0]))).toEqual(
        byId([samePredecessor, sameSuccessor, surviving]),
      );
      expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[1]))).toEqual([
        otherWorkPackage,
      ]);

      await port.remove(predecessorId, successorId, seed.stamps[1]);
      expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[0]))).toEqual(
        byId([samePredecessor, sameSuccessor, surviving]),
      );
      expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[1]))).toEqual([
        otherWorkPackage,
      ]);
    }),
    storeCase(
      'dependencies',
      'dependencies.removeAllFor:touching-set',
      open,
      async ({ port, readers, seed }) => {
        const [doomedOneId, doomedTwoId] = seed.workItemIds[0];
        const [survivorOneId, survivorTwoId] = DEPENDENCY_SURVIVOR_IDS;
        const incoming = edge(
          'dependency-remove-all-incoming',
          seed.workPackageIds[0],
          survivorOneId,
          doomedOneId,
        );
        const outgoing = edge(
          'dependency-remove-all-outgoing',
          seed.workPackageIds[0],
          doomedTwoId,
          survivorTwoId,
        );
        const doomed = edge(
          'dependency-remove-all-doomed',
          seed.workPackageIds[0],
          doomedOneId,
          doomedTwoId,
        );
        const surviving = edge(
          'dependency-remove-all-surviving',
          seed.workPackageIds[0],
          survivorOneId,
          survivorTwoId,
        );
        const otherWorkPackage = edge(
          'dependency-remove-all-other-work-package',
          seed.workPackageIds[1],
          seed.workItemIds[1][0],
          seed.workItemIds[1][1],
        );
        const workPackageA = [incoming, outgoing, doomed, surviving];
        for (const seeded of workPackageA) await addEdge(port, seeded, seed.stamps[0]);
        await addEdge(port, otherWorkPackage, seed.stamps[1]);
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[0]))).toEqual(
          byId(workPackageA),
        );
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[1]))).toEqual([
          otherWorkPackage,
        ]);

        await port.removeAllFor([doomedOneId, doomedTwoId], seed.stamps[1]);
        // Proof: the outgoing-only source faults leave the exact incoming edge;
        // the incomplete-set faults leave the exact outgoing edge for doomed two.
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[0]))).toEqual([
          surviving,
        ]);
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[1]))).toEqual([
          otherWorkPackage,
        ]);

        await port.removeAllFor([doomedOneId, doomedTwoId], seed.stamps[1]);
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[0]))).toEqual([
          surviving,
        ]);
        expect(byId(await readers.dependencies.listByWorkPackage(seed.workPackageIds[1]))).toEqual([
          otherWorkPackage,
        ]);
      },
    ),
  ];
}
