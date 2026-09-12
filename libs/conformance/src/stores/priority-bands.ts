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
        const projectsBefore = structuredClone(
          await Promise.all(
            seed.projectIds.map((projectId) => readers.projects.findById(projectId)),
          ),
        );
        const teamsBefore = structuredClone(await readers.directory.listTeams());
        expect(projectsBefore.map((project) => project?.id)).toEqual([...seed.projectIds]);
        expect(teamsBefore.map(({ id }) => id).sort()).toEqual([...seed.teamIds]);

        const observed = {
          projectA: await port.listFor(seed.projectIds[0]),
          projectB: await port.listFor(seed.projectIds[1]),
        };
        // Proof: both source faults returned no fallback after each real read;
        // the complete observation received two empty ladders instead of defaults.
        expect(observed).toEqual({
          projectA: [...DEFAULT_PRIORITY_BANDS],
          projectB: [...DEFAULT_PRIORITY_BANDS],
        });
        expect(
          await Promise.all(
            seed.projectIds.map((projectId) => readers.projects.findById(projectId)),
          ),
        ).toEqual(projectsBefore);
        expect(await readers.directory.listTeams()).toEqual(teamsBefore);
      },
    ),
    storeCase(
      'priorityBands',
      'priorityBands.replace:whole-project',
      open,
      async ({ port, readers, seed }) => {
        const projectsBefore = structuredClone(
          await Promise.all(
            seed.projectIds.map((projectId) => readers.projects.findById(projectId)),
          ),
        );
        const teamsBefore = structuredClone(await readers.directory.listTeams());
        expect(projectsBefore.map((project) => project?.id)).toEqual([...seed.projectIds]);
        expect(teamsBefore.map(({ id }) => id).sort()).toEqual([...seed.teamIds]);

        expect(await port.replace(seed.projectIds[0], INITIAL_LADDER, seed.stamps[0])).toEqual({
          ok: true,
        });
        expect(await port.replace(seed.projectIds[0], REPLACEMENT_LADDER, seed.stamps[1])).toEqual({
          ok: true,
        });

        const observed = {
          projectA: await port.listFor(seed.projectIds[0]),
          projectB: await port.listFor(seed.projectIds[1]),
        };
        // Proof: both source faults replaced only the first rung; the complete
        // observation retained Soon/Planned/Later/Parked in A while B stayed default.
        expect(observed).toEqual({
          projectA: [...REPLACEMENT_LADDER],
          projectB: [...DEFAULT_PRIORITY_BANDS],
        });
        expect(
          await Promise.all(
            seed.projectIds.map((projectId) => readers.projects.findById(projectId)),
          ),
        ).toEqual(projectsBefore);
        expect(await readers.directory.listTeams()).toEqual(teamsBefore);
      },
    ),
    storeCase(
      'priorityBands',
      'priorityBands.replace:missing-project',
      open,
      async ({ port, readers, seed }) => {
        const projectsBefore = structuredClone(
          await Promise.all(
            seed.projectIds.map((projectId) => readers.projects.findById(projectId)),
          ),
        );
        const teamsBefore = structuredClone(await readers.directory.listTeams());
        expect(projectsBefore.map((project) => project?.id)).toEqual([...seed.projectIds]);
        expect(teamsBefore.map(({ id }) => id).sort()).toEqual([...seed.teamIds]);

        const outcome = await port.replace('project-missing', REPLACEMENT_LADDER, seed.stamps[0]);
        const observed = {
          outcome,
          missing: await port.listFor('project-missing'),
          projectA: await port.listFor(seed.projectIds[0]),
          projectB: await port.listFor(seed.projectIds[1]),
        };
        // Proof: SQLite's fault returned true and changed A; memory's bypass
        // returned true and stored the missing project's ladder. The complete
        // outcome and all three public reads differed from the refusal state.
        expect(observed).toEqual({
          outcome: { ok: false, reason: 'not_found' },
          missing: [...DEFAULT_PRIORITY_BANDS],
          projectA: [...DEFAULT_PRIORITY_BANDS],
          projectB: [...DEFAULT_PRIORITY_BANDS],
        });
        expect(
          await Promise.all(
            seed.projectIds.map((projectId) => readers.projects.findById(projectId)),
          ),
        ).toEqual(projectsBefore);
        expect(await readers.directory.listTeams()).toEqual(teamsBefore);
      },
    ),
  ];
}
