import { deepStrictEqual } from 'node:assert';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';
interface FixtureRankFacts {
  organizationId: string;
  position: number;
  createdAt: number;
  updatedAt: number | null;
  createdBy: string;
}
interface Fixture<Rank> {
  format: string;
  version: number;
  organizations: { organizationId: string; mode: string }[];
  ranks: Rank[];
}
const legacy = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-shared-people-save1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Fixture<FixtureRankFacts & { projectId: string }>;
const current = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../openspec/changes/wbs-work-packages/fixtures/shared-people-save2.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Fixture<FixtureRankFacts & { workPackageId: string }>;
import { digestSharedPeople, readSharedPeopleBackup } from './shared-people-backup';
import { readSavedWorkPackageRanks } from './work-package-rank-rollback';

describe('retained recovery backup wire identity', () => {
  it('retains published shared-save1 project-keyed canonical value and original digest', () => {
    deepStrictEqual(readSharedPeopleBackup(legacy), legacy);
    expect(digestSharedPeople(legacy)).toBe(
      'ea65189d5af61518fddf5bb825351667d2983f08ee9bf08c87ebe4ffd9a18117',
    );
    expect(legacy.ranks[0]).toHaveProperty('projectId', 'a1');
    expect(legacy.ranks[0]).not.toHaveProperty('workPackageId');
  });
  it('keeps renamed shared-save2 canonical identity distinct from equivalent version1', () => {
    deepStrictEqual(readSharedPeopleBackup(current), current);
    expect(digestSharedPeople(current)).toBe(
      '2aac813ad69f223b8ad8ddec6cba39bf9023d3d60a361070d4ff9292e5bdd206',
    );
    expect(digestSharedPeople(current)).not.toBe(
      'ea65189d5af61518fddf5bb825351667d2983f08ee9bf08c87ebe4ffd9a18117',
    );
  });
  it('refuses shared backup mixed owner spelling and unknown declared generations', () => {
    for (const malformed of [
      { ...legacy, ranks: current.ranks },
      { ...current, ranks: legacy.ranks },
      { ...legacy, ranks: [{ ...legacy.ranks[0], workPackageId: 'a1' }] },
      { ...current, ranks: [{ ...current.ranks[0], projectId: 'a1' }] },
      { ...current, version: 3 },
      { ...legacy, version: null },
    ])
      expect(() => readSharedPeopleBackup(malformed)).toThrow('invalid');
  });
  it('reads only the published standalone project-rank-save1 pair in its original shape', () => {
    const saved = { format: 'project-rank-save', version: 1, ranks: legacy.ranks };
    deepStrictEqual(readSavedWorkPackageRanks(saved), saved);
  });
  it('reads current standalone work-package-rank-save2 without erasing its generation', () => {
    const saved = { format: 'work-package-rank-save', version: 2, ranks: current.ranks };
    deepStrictEqual(readSavedWorkPackageRanks(saved), saved);
  });
  it('refuses unshipped standalone format1 and every mixed format-version-owner pair', () => {
    for (const malformed of [
      { format: 'work-package-rank-save', version: 1, ranks: current.ranks },
      { format: 'project-rank-save', version: 2, ranks: legacy.ranks },
      { format: 'project-rank-save', version: 1, ranks: current.ranks },
      { format: 'work-package-rank-save', version: 2, ranks: legacy.ranks },
      { format: 'work-package-rank-save', version: 3, ranks: current.ranks },
    ])
      expect(() => readSavedWorkPackageRanks(malformed)).toThrow('invalid');
  });
});

for (const [generation, fixture] of [
  ['legacy1', legacy],
  ['current2', current],
] as const) {
  for (const [field, value] of [
    ['organizationId', ''],
    ['position', 1.5],
    ['createdAt', 1.5],
    ['updatedAt', false],
    ['createdBy', ''],
  ] as const)
    it('refuses ' + generation + ' invalid rank fact ' + field, () => {
      expect(() =>
        readSharedPeopleBackup({ ...fixture, ranks: [{ ...fixture.ranks[0], [field]: value }] }),
      ).toThrow('invalid');
    });
  for (const extra of ['root', 'organization', 'rank'] as const)
    it('refuses ' + generation + ' undeclared ' + extra + ' fields', () => {
      const malformed =
        extra === 'root'
          ? { ...fixture, extra: true }
          : extra === 'organization'
            ? { ...fixture, organizations: [{ ...fixture.organizations[0], extra: true }] }
            : { ...fixture, ranks: [{ ...fixture.ranks[0], extra: true }] };
      expect(() => readSharedPeopleBackup(malformed)).toThrow('invalid');
    });
  for (const duplicate of ['organization', 'rank'] as const)
    it('refuses ' + generation + ' duplicate ' + duplicate + ' identities', () => {
      const malformed =
        duplicate === 'organization'
          ? { ...fixture, organizations: [...fixture.organizations, fixture.organizations[0]] }
          : { ...fixture, ranks: [...fixture.ranks, fixture.ranks[0]] };
      expect(() => readSharedPeopleBackup(malformed)).toThrow('invalid');
    });
  it('detaches ' + generation + ' full canonical facts from caller aliases', () => {
    const caller = structuredClone(fixture),
      original = structuredClone(caller),
      saved = readSharedPeopleBackup(caller);
    caller.organizations[0].organizationId = 'changed';
    caller.ranks[0].createdBy = 'changed';
    deepStrictEqual(saved, original);
    deepStrictEqual(saved.version, fixture.version);
  });
}
it('orders current2 organization and rank identities ordinally before canonical digest', () => {
  const caller = {
    ...current,
    organizations: ['ä', 'Z', 'a'].map((organizationId) => ({ organizationId, mode: 'isolated' })),
    ranks: ['ä', 'Z', 'a'].map((workPackageId) => ({
      ...current.ranks[0],
      workPackageId,
      organizationId: 'a',
    })),
  };
  const saved = readSharedPeopleBackup(caller);
  if (saved.version !== 2) throw Error('current2 wire generation lost');
  expect(saved.organizations.map((organization) => organization.organizationId)).toEqual([
    'Z',
    'a',
    'ä',
  ]);
  expect(saved.ranks.map((rank) => rank.workPackageId)).toEqual(['Z', 'a', 'ä']);
  expect(
    digestSharedPeople({
      ...caller,
      ranks: [...caller.ranks].reverse(),
      organizations: [...caller.organizations].reverse(),
    }),
  ).toBe(digestSharedPeople(saved));
});
