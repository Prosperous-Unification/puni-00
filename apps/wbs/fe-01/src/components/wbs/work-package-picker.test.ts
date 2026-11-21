import { describe, expect, it } from 'vitest';

import type { ProjectSummaryView } from '@/lib/wbs-api';

import {
  entryMeta,
  groupWorkPackages,
  matchingWorkPackages,
  workPackageCardMeta,
} from './work-package-picker';

/**
 * The entries as the page really hands them over — meta and all.
 *
 * Not `{ id, name }` pairs: the claim below is that the owner's name is
 * **there** and is still not searched, and a fixture that left it out would
 * make that test pass by having nothing to match against.
 */
const workPackages = [
  { id: 'p1', name: 'Rewire the shed', createdByName: 'kat', createdAt: 1_780_000_000_000 },
  { id: 'p2', name: 'Repaint the hall', createdByName: 'strip', createdAt: 1_780_000_000_000 },
  { id: 'p3', name: 'HALLWAY lighting', createdByName: 'kat', createdAt: 1_780_000_000_000 },
];

describe('matchingWorkPackages', () => {
  it('offers everything when nothing is typed', () => {
    expect(matchingWorkPackages(workPackages, '').map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(matchingWorkPackages(workPackages, '   ').map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('matches a substring of the name, ignoring case', () => {
    expect(matchingWorkPackages(workPackages, 'hall').map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(matchingWorkPackages(workPackages, 'SHED').map((p) => p.id)).toEqual(['p1']);
  });

  it('keeps the order it was given rather than sorting by name or match', () => {
    // The server's order is this account's recency order. A picker that
    // re-sorted would quietly overrule it — `hall` matching `Repaint the hall`
    // at position 8 and `HALLWAY lighting` at position 0 must not promote the
    // second one.
    const reversed = [...workPackages].reverse();
    expect(matchingWorkPackages(reversed, 'hall').map((p) => p.id)).toEqual(['p3', 'p2']);
  });

  it('offers nothing when nothing matches', () => {
    expect(matchingWorkPackages(workPackages, 'garage')).toEqual([]);
  });

  it('never matches a creator, however plainly the entry shows one', () => {
    // The recorded non-goal, made breakable. `strip` owns `Repaint the hall`
    // and the entry says so on screen; typing it must still offer nothing,
    // because the box narrows by name and nothing tells anybody otherwise.
    // `kat` is the second half of the same claim — she owns two, so a filter
    // reading the owner would answer with a pair rather than with an empty
    // list, and an assertion about emptiness alone could not tell the two
    // faults apart.
    expect(matchingWorkPackages(workPackages, 'strip')).toEqual([]);
    expect(matchingWorkPackages(workPackages, 'kat')).toEqual([]);
    // And the name still matches, which is what stops the check above being
    // satisfied by a filter that has stopped matching anything at all.
    expect(matchingWorkPackages(workPackages, 'shed').map((p) => p.id)).toEqual(['p1']);
  });
});

describe('workPackageCardMeta', () => {
  // The card reads a fixed calendar day `startDate` and two instants
  // (`createdAt`, `lastOpenedAt`); the dates are built rather than pinned so
  // the assertions hold in any zone the suite runs in.
  const reading = new Date(2026, 0, 15);
  const entry = {
    createdByName: 'kat',
    createdAt: new Date(2025, 11, 1, 12).getTime(),
    startDate: '2026-03-12',
    lastOpenedAt: new Date(2026, 0, 10, 9).getTime(),
  };

  it('prints the creator, the start day and the last open', () => {
    expect(workPackageCardMeta(entry, reading)).toEqual({
      creation: "(1 Dec '25 · kat)",
      start: 'Start 12 Mar',
      lastOpened: 'Last opened 10 Jan',
    });
  });

  it('says so rather than printing nothing for a plan with no start day', () => {
    expect(workPackageCardMeta({ ...entry, startDate: null }, reading).start).toBe('Not scheduled');
  });

  it('says so rather than printing nothing for a work package never opened', () => {
    expect(workPackageCardMeta({ ...entry, lastOpenedAt: null }, reading).lastOpened).toBe(
      'Never opened',
    );
  });

  it('reads the start day as a calendar day, not as a moment', () => {
    // A `startDate` parsed as a moment lands on midnight UTC and prints a day
    // early west of Greenwich — the fault `shortIsoDate` exists to refuse. The
    // card goes through it, so a zone-free day stays the same day everywhere.
    expect(workPackageCardMeta({ ...entry, startDate: '2026-03-01' }, reading).start).toBe(
      'Start 1 Mar',
    );
  });
});

describe('entryMeta', () => {
  it('prints the captured creator instead of retained owner metadata', () => {
    const entry = {
      createdByName: 'Creator',
      ownerName: 'Former owner',
      createdAt: new Date(2026, 0, 1, 12).getTime(),
    };
    expect(entryMeta(entry, new Date(2026, 0, 15))).toBe('(1 Jan · Creator)');
  });

  it('reads the creation instant in the reader’s own zone, not as a calendar day', () => {
    // The formatter is chosen by the **type** of the value: `createdAt` is an
    // epoch millisecond, so this is `shortInstant`. Building the moment here
    // rather than pinning an epoch keeps the assertion true in every zone the
    // suite runs in — the day is whatever the reader's machine says it is,
    // which is `short-date.test.ts`'s stated cost and not this file's to
    // re-decide.
    const madeOn = new Date(2027, 5, 1, 12);
    const reading = new Date(2026, 0, 15);

    expect(entryMeta({ createdByName: 'kat', createdAt: madeOn.getTime() }, reading)).toBe(
      "(1 Jun '27 · kat)",
    );
    expect(entryMeta({ createdByName: 'kat', createdAt: madeOn.getTime() }, madeOn)).toBe(
      '(1 Jun · kat)',
    );
  });
});

const groupedPackages = [
  { id: 'unknown-one', name: 'Shared unknown', projectId: 'unavailable' },
  { id: 'b-one', name: 'Shared B first', projectId: 'parent-b' },
  { id: 'a-one', name: 'Shared A first', projectId: 'parent-a' },
  { id: 'b-two', name: 'Shared B second', projectId: 'parent-b' },
  { id: 'unknown-two', name: 'Shared unknown again', projectId: 'unavailable' },
  { id: 'a-two', name: 'Shared A second', projectId: 'parent-a' },
];
const groupedProjects = [
  { id: 'parent-a', name: 'Project A' },
  { id: 'parent-b', name: 'Project B' },
  { id: 'empty-parent', name: 'Empty project' },
];

describe('groupWorkPackages', () => {
  it('orders known groups by first match, preserves their child order and retains unresolved rows last', () => {
    const grouped = groupWorkPackages(groupedPackages, groupedProjects);
    expect(
      grouped.groups.map((group) => ({
        projectId: group.project.id,
        ids: group.workPackages.map((workPackage) => workPackage.id),
      })),
    ).toEqual([
      { projectId: 'parent-b', ids: ['b-one', 'b-two'] },
      { projectId: 'parent-a', ids: ['a-one', 'a-two'] },
    ]);
    expect(grouped.unresolved.map((workPackage) => workPackage.id)).toEqual([
      'unknown-one',
      'unknown-two',
    ]);
    expect(
      [...grouped.groups.flatMap((group) => group.workPackages), ...grouped.unresolved].map(
        (workPackage) => workPackage.id,
      ),
    ).toEqual(['b-one', 'b-two', 'a-one', 'a-two', 'unknown-one', 'unknown-two']);
  });

  it('keys same-name groups by their different actual IDs', () => {
    const projects = groupedProjects.map((project) => ({ ...project, name: 'Shared heading' }));
    const grouped = groupWorkPackages(groupedPackages, projects);
    expect(
      grouped.groups.map((group) => ({ id: group.project.id, name: group.project.name })),
    ).toEqual([
      { id: 'parent-b', name: 'Shared heading' },
      { id: 'parent-a', name: 'Shared heading' },
    ]);
    expect(
      grouped.groups.map((group) => group.workPackages.map((workPackage) => workPackage.id)),
    ).toEqual([
      ['b-one', 'b-two'],
      ['a-one', 'a-two'],
    ]);
  });

  it('uses the supplied renamed metadata at the same project ID without manufacturing a parent', () => {
    const renamed = { id: 'parent-b', name: 'Renamed project B' };
    const grouped = groupWorkPackages(groupedPackages, [
      renamed,
      ...groupedProjects.filter((project) => project.id !== 'parent-b'),
    ]);
    expect(grouped.groups.map((group) => group.project.name)).toEqual([
      'Renamed project B',
      'Project A',
    ]);
    expect(grouped.groups[0]?.project).toBe(renamed);
    expect(grouped.unresolved.map((workPackage) => workPackage.projectId)).toEqual([
      'unavailable',
      'unavailable',
    ]);
  });

  it('retains every actual package as unresolved for ready empty metadata and creates no empty group', () => {
    const grouped = groupWorkPackages(groupedPackages, []);
    expect(grouped.groups).toEqual([]);
    expect(grouped.unresolved).toEqual(groupedPackages);
    expect(groupWorkPackages([], groupedProjects)).toEqual({ groups: [], unresolved: [] });
  });

  it('does not mutate either input or re-sort server-relative child records', () => {
    const packages = structuredClone(groupedPackages);
    const projects = structuredClone(groupedProjects);
    const beforePackages = structuredClone(packages);
    const beforeProjects = structuredClone(projects);
    const grouped = groupWorkPackages(packages, projects);
    expect(packages).toEqual(beforePackages);
    expect(projects).toEqual(beforeProjects);
    expect(grouped.groups[0]?.workPackages.map((workPackage) => workPackage.id)).toEqual([
      'b-one',
      'b-two',
    ]);
    expect(grouped.groups[1]?.workPackages.map((workPackage) => workPackage.id)).toEqual([
      'a-one',
      'a-two',
    ]);
  });

  it('groups only package-name matches, without searching project headings or creator metadata', () => {
    const packages = groupedPackages.map((workPackage) => ({
      ...workPackage,
      createdByName: 'Visible creator',
    }));
    expect(groupWorkPackages(matchingWorkPackages(packages, 'Project A'), groupedProjects)).toEqual(
      { groups: [], unresolved: [] },
    );
    expect(
      groupWorkPackages(matchingWorkPackages(packages, 'Visible creator'), groupedProjects),
    ).toEqual({ groups: [], unresolved: [] });
    const grouped = groupWorkPackages(matchingWorkPackages(packages, 'second'), groupedProjects);
    expect(
      grouped.groups.flatMap((group) => group.workPackages.map((workPackage) => workPackage.id)),
    ).toEqual(['b-two', 'a-two']);
    expect(grouped.unresolved).toEqual([]);
  });
});

it('retains an actual list-shell label without adding a count or private metadata to grouped navigation', () => {
  const shell: ProjectSummaryView = { id: 'parent-b', name: 'Package-only parent' };
  const grouped = groupWorkPackages(groupedPackages, [shell]);
  expect(
    grouped.groups.map((group) => ({
      project: group.project,
      ids: group.workPackages.map((workPackage) => workPackage.id),
    })),
  ).toEqual([
    { project: { id: 'parent-b', name: 'Package-only parent' }, ids: ['b-one', 'b-two'] },
  ]);
  expect(grouped.unresolved.map((workPackage) => workPackage.id)).toEqual([
    'unknown-one',
    'a-one',
    'unknown-two',
    'a-two',
  ]);
  expect(Object.keys(shell).sort()).toEqual(['id', 'name']);
});
