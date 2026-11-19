import { DEFAULT_PRIORITY_BANDS, type PriorityBand } from '@wbs/domain';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

const INITIAL_LADDER: readonly PriorityBand[] = [
  { startsAt: 1, label: 'Immediate', defaultValue: 4 },
  { startsAt: 11, label: 'Soon', defaultValue: 15 },
  { startsAt: 31, label: 'Planned', defaultValue: 45 },
  { startsAt: 71, label: 'Later', defaultValue: 80 },
  { startsAt: 121, label: 'Parked', defaultValue: 150 },
];

const REPLACEMENT_LADDER: readonly PriorityBand[] = [
  { startsAt: 1, label: 'Blocker', defaultValue: 5 },
  { startsAt: 16, label: 'Urgent', defaultValue: 20 },
  { startsAt: 31, label: 'Normal', defaultValue: 40 },
  { startsAt: 71, label: 'Someday', defaultValue: 75 },
  { startsAt: 200, label: 'Never', defaultValue: 900 },
];

const WORK_PACKAGE_B_LADDER: readonly PriorityBand[] = [
  { startsAt: 1, label: 'Now', defaultValue: 3 },
  { startsAt: 8, label: 'Next', defaultValue: 12 },
  { startsAt: 25, label: 'Queued', defaultValue: 35 },
  { startsAt: 60, label: 'Deferred', defaultValue: 70 },
  { startsAt: 150, label: 'Backlog', defaultValue: 500 },
];

/** The shared priority-ladder cases for defaults, whole replacement and refusal. */
export function priorityBandRegistrations(
  open: OpenCase<'priorityBands'>,
): readonly CaseRegistration[] {
  return [
    storeCase(
      'priorityBands',
      'priorityBands.listFor:defaults',
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

        const observed = {
          workPackageA: await port.listFor(seed.workPackageIds[0]),
          workPackageB: await port.listFor(seed.workPackageIds[1]),
        };
        // Proof: both source faults returned no fallback after each real read;
        // the complete observation received two empty ladders instead of defaults.
        expect(observed).toEqual({
          workPackageA: [...DEFAULT_PRIORITY_BANDS],
          workPackageB: [...DEFAULT_PRIORITY_BANDS],
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
    storeCase(
      'priorityBands',
      'priorityBands.replace:whole-work-package',
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

        expect(await port.replace(seed.workPackageIds[0], INITIAL_LADDER, seed.stamps[0])).toEqual({
          ok: true,
        });
        expect(await port.listFor(seed.workPackageIds[1])).toEqual([...DEFAULT_PRIORITY_BANDS]);
        expect(
          await port.replace(seed.workPackageIds[1], WORK_PACKAGE_B_LADDER, seed.stamps[0]),
        ).toEqual({
          ok: true,
        });
        expect({
          workPackageA: await port.listFor(seed.workPackageIds[0]),
          workPackageB: await port.listFor(seed.workPackageIds[1]),
        }).toEqual({
          workPackageA: [...INITIAL_LADDER],
          workPackageB: [...WORK_PACKAGE_B_LADDER],
        });
        expect(
          await port.replace(seed.workPackageIds[0], REPLACEMENT_LADDER, seed.stamps[1]),
        ).toEqual({
          ok: true,
        });

        const observed = {
          workPackageA: await port.listFor(seed.workPackageIds[0]),
          workPackageB: await port.listFor(seed.workPackageIds[1]),
        };
        // Proof: the source-specific first-rung faults preserved A's Soon,
        // Planned, Later and Parked rungs; this comparison failed with
        // Expected -10 / Received +10 while B's configured ladder stayed exact.
        // Proof: the source-specific work-package-scope faults destroyed B's stored
        // ladder during A's second replacement; this comparison received the
        // Critical/High/Medium/Low/Lowest defaults instead of B's
        // Now/Next/Queued/Deferred/Backlog ladder (Expected -13 / Received +13).
        expect(observed).toEqual({
          workPackageA: [...REPLACEMENT_LADDER],
          workPackageB: [...WORK_PACKAGE_B_LADDER],
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
    storeCase(
      'priorityBands',
      'priorityBands.replace:missing-work-package',
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

        const outcome = await port.replace(
          'work-package-missing',
          REPLACEMENT_LADDER,
          seed.stamps[0],
        );
        const observed = {
          outcome,
          missing: await port.listFor('work-package-missing'),
          workPackageA: await port.listFor(seed.workPackageIds[0]),
          workPackageB: await port.listFor(seed.workPackageIds[1]),
        };
        // Proof: SQLite's fault returned true and changed A; memory's bypass
        // returned true and stored the missing work package's ladder. The complete
        // outcome and all three public reads differed from the refusal state.
        expect(observed).toEqual({
          outcome: { ok: false, reason: 'not_found' },
          missing: [...DEFAULT_PRIORITY_BANDS],
          workPackageA: [...DEFAULT_PRIORITY_BANDS],
          workPackageB: [...DEFAULT_PRIORITY_BANDS],
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
