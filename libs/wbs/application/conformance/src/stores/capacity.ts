import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

/** The shared work-package/team-capacity cases for keyed writes, clearing and refusals. */
export function capacityRegistrations(open: OpenCase<'capacity'>): readonly CaseRegistration[] {
  return [
    storeCase(
      'capacity',
      'capacity.set:work-package-team-key',
      open,
      async ({ port, readers, seed }) => {
        const workPackagesBefore = structuredClone(
          await Promise.all(
            seed.workPackageIds.map((workPackageId) =>
              readers.workPackages.findById(workPackageId),
            ),
          ),
        );
        const teamsBefore = structuredClone(await readers.directory.listTeams());
        expect(workPackagesBefore.map((workPackage) => workPackage?.id)).toEqual([
          ...seed.workPackageIds,
        ]);
        expect(teamsBefore.map(({ id }) => id).sort()).toEqual([...seed.teamIds]);

        expect(await port.set(seed.workPackageIds[0], seed.teamIds[0], 2, seed.stamps[0])).toEqual({
          ok: true,
        });
        expect(await port.set(seed.workPackageIds[1], seed.teamIds[0], 5, seed.stamps[1])).toEqual({
          ok: true,
        });
        expect(await port.set(seed.workPackageIds[0], seed.teamIds[1], 9, seed.stamps[0])).toEqual({
          ok: true,
        });

        const observed = {
          slotsA: await port.slotsFor(seed.workPackageIds[0]),
          listA: await port.listFor(seed.workPackageIds[0]),
          slotsB: await port.slotsFor(seed.workPackageIds[1]),
          listB: await port.listFor(seed.workPackageIds[1]),
        };
        // Proof: both source faults removed the work package half of the key; the
        // complete observation failed with A's `team-a => 5` instead of 2 and B empty.
        expect(observed).toEqual({
          slotsA: new Map([
            [seed.teamIds[0], 2],
            [seed.teamIds[1], 9],
          ]),
          listA: [
            { serviceTeamId: seed.teamIds[0], size: 2 },
            { serviceTeamId: seed.teamIds[1], size: 9 },
          ],
          slotsB: new Map([[seed.teamIds[0], 5]]),
          listB: [{ serviceTeamId: seed.teamIds[0], size: 5 }],
        });
        expect(
          await Promise.all(
            seed.workPackageIds.map((workPackageId) =>
              readers.workPackages.findById(workPackageId),
            ),
          ),
        ).toEqual(workPackagesBefore);
        expect(await readers.directory.listTeams()).toEqual(teamsBefore);
      },
    ),
    storeCase('capacity', 'capacity.set:clear', open, async ({ port, readers, seed }) => {
      const workPackagesBefore = structuredClone(
        await Promise.all(
          seed.workPackageIds.map((workPackageId) => readers.workPackages.findById(workPackageId)),
        ),
      );
      const teamsBefore = structuredClone(await readers.directory.listTeams());
      expect(workPackagesBefore.map((workPackage) => workPackage?.id)).toEqual([
        ...seed.workPackageIds,
      ]);
      expect(teamsBefore.map(({ id }) => id).sort()).toEqual([...seed.teamIds]);

      await port.set(seed.workPackageIds[0], seed.teamIds[0], 2, seed.stamps[0]);
      await port.set(seed.workPackageIds[0], seed.teamIds[1], 9, seed.stamps[0]);
      await port.set(seed.workPackageIds[1], seed.teamIds[0], 5, seed.stamps[1]);
      expect(await port.set(seed.workPackageIds[0], seed.teamIds[0], null, seed.stamps[1])).toEqual(
        {
          ok: true,
        },
      );

      const cleared = await port.slotsFor(seed.workPackageIds[0]);
      const observed = {
        hasClearedKey: cleared.has(seed.teamIds[0]),
        slotsA: cleared,
        listA: await port.listFor(seed.workPackageIds[0]),
        slotsB: await port.slotsFor(seed.workPackageIds[1]),
        listB: await port.listFor(seed.workPackageIds[1]),
      };
      // Proof: both source faults stored zero on the real write path; this
      // failed on `Expected: false · Received: true` for the cleared key.
      expect(observed).toEqual({
        hasClearedKey: false,
        slotsA: new Map([[seed.teamIds[1], 9]]),
        listA: [{ serviceTeamId: seed.teamIds[1], size: 9 }],
        slotsB: new Map([[seed.teamIds[0], 5]]),
        listB: [{ serviceTeamId: seed.teamIds[0], size: 5 }],
      });
      expect(
        await Promise.all(
          seed.workPackageIds.map((workPackageId) => readers.workPackages.findById(workPackageId)),
        ),
      ).toEqual(workPackagesBefore);
      expect(await readers.directory.listTeams()).toEqual(teamsBefore);
    }),
    storeCase(
      'capacity',
      'capacity.set:missing-reference',
      open,
      async ({ port, readers, seed }) => {
        const workPackagesBefore = structuredClone(
          await Promise.all(
            seed.workPackageIds.map((workPackageId) =>
              readers.workPackages.findById(workPackageId),
            ),
          ),
        );
        const teamsBefore = structuredClone(await readers.directory.listTeams());
        expect(workPackagesBefore.map((workPackage) => workPackage?.id)).toEqual([
          ...seed.workPackageIds,
        ]);
        expect(teamsBefore.map(({ id }) => id).sort()).toEqual([...seed.teamIds]);

        const missingWorkPackage = await port.set(
          'work-package-missing',
          seed.teamIds[0],
          3,
          seed.stamps[0],
        );
        const missingTeam = await port.set(
          seed.workPackageIds[0],
          'team-missing',
          4,
          seed.stamps[0],
        );
        const observed = {
          missingWorkPackage,
          missingTeam,
          missingWorkPackageRows: await port.listFor('work-package-missing'),
          workPackageA: await port.listFor(seed.workPackageIds[0]),
          workPackageB: await port.listFor(seed.workPackageIds[1]),
        };
        // Proof: SQLite's fault routed both requests to held references, returning
        // true and leaving work package A's row; memory's bypass returned true and left
        // rows under both missing keys. The complete outcome/state object differed.
        expect(observed).toEqual({
          missingWorkPackage: { ok: false, reason: 'not_found' },
          missingTeam: { ok: false, reason: 'not_found' },
          missingWorkPackageRows: [],
          workPackageA: [],
          workPackageB: [],
        });
        expect(
          await Promise.all(
            seed.workPackageIds.map((workPackageId) =>
              readers.workPackages.findById(workPackageId),
            ),
          ),
        ).toEqual(workPackagesBefore);
        expect(await readers.directory.listTeams()).toEqual(teamsBefore);
      },
    ),
  ];
}
