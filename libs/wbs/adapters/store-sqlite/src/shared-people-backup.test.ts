import { describe, expect, it } from 'bun:test';

import { digestSharedPeople, readSharedPeopleBackup } from './shared-people-backup';

const backup = {
  format: 'shared-people-save',
  version: 1,
  organizations: [
    { organizationId: 'org-a', mode: 'isolated' },
    { organizationId: 'org-z', mode: 'shared' },
  ],
  ranks: [
    {
      projectId: 'a1',
      organizationId: 'org-a',
      position: 3,
      createdAt: 1,
      updatedAt: 2,
      createdBy: 'ada',
    },
  ],
};

const DIGEST = 'ea65189d5af61518fddf5bb825351667d2983f08ee9bf08c87ebe4ffd9a18117';

describe('canonical shared people backup', () => {
  it('hashes the fixed root, organization and rank field order as lowercase SHA-256', () => {
    expect(digestSharedPeople(backup)).toBe(DIGEST);
    expect(
      digestSharedPeople({
        ranks: [
          {
            createdBy: 'ada',
            updatedAt: 2,
            createdAt: 1,
            position: 3,
            organizationId: 'org-a',
            projectId: 'a1',
          },
        ],
        organizations: [
          { mode: 'shared', organizationId: 'org-z' },
          { mode: 'isolated', organizationId: 'org-a' },
        ],
        version: 1,
        format: 'shared-people-save',
      }),
    ).toBe(DIGEST);
  });

  it('orders organization and project IDs ordinally without locale-dependent collation', () => {
    const saved = readSharedPeopleBackup({
      ...backup,
      organizations: ['ä', 'Z', 'a'].map((organizationId) => ({
        organizationId,
        mode: 'isolated',
      })),
      ranks: ['ä', 'Z', 'a'].map((projectId) => ({
        ...backup.ranks[0],
        projectId,
        organizationId: 'a',
      })),
    });
    expect(saved.organizations.map((organization) => organization.organizationId)).toEqual([
      'Z',
      'a',
      'ä',
    ]);
    expect(saved.ranks.map((rank) => rank.projectId)).toEqual(['Z', 'a', 'ä']);
    expect(digestSharedPeople({ ...saved, ranks: [...saved.ranks].reverse() })).toBe(
      digestSharedPeople(saved),
    );
  });

  it('binds every saved fact into the digest', () => {
    const changes = [
      {
        ...backup,
        organizations: [{ organizationId: 'org-a', mode: 'shared' }, backup.organizations[1]],
      },
      {
        ...backup,
        organizations: [...backup.organizations, { organizationId: 'org-b', mode: 'isolated' }],
      },
      { ...backup, ranks: [] },
      ...[
        { projectId: 'another' },
        { organizationId: 'org-z' },
        { position: 4 },
        { createdAt: 2 },
        { updatedAt: null },
        { createdBy: 'sam' },
      ].map((changed) => ({ ...backup, ranks: [{ ...backup.ranks[0], ...changed }] })),
    ];
    for (const changed of changes) expect(digestSharedPeople(changed)).not.toBe(DIGEST);
  });

  it('refuses a rank whose organization is absent from the complete backup', () => {
    expect(() =>
      digestSharedPeople({ ...backup, organizations: [backup.organizations[1]] }),
    ).toThrow('rank organization is absent');
  });

  it('preserves v1 validation before producing any digest', () => {
    const malformed: unknown[] = [
      null,
      { ...backup, version: 2 },
      { ...backup, extra: true },
      { ...backup, organizations: [...backup.organizations, backup.organizations[0]] },
      { ...backup, ranks: [...backup.ranks, backup.ranks[0]] },
      { ...backup, organizations: [{ organizationId: 'org-a', mode: 'unsupported' }] },
      { ...backup, ranks: [{ ...backup.ranks[0], position: 1.5 }] },
      { ...backup, ranks: [{ ...backup.ranks[0], extra: true }] },
    ];
    for (const saved of malformed) expect(() => digestSharedPeople(saved)).toThrow();
  });
});
