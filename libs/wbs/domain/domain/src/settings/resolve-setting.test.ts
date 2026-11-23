import { expect, it } from 'bun:test';
import fc from 'fast-check';

import type { ScopeChain } from '../access-role';
import type { SettingMarker, SettingScope } from './catalogue';
import { resolveSetting, type SettingsSnapshot } from './resolve-setting';

const organization = { level: 'organization', id: 'org-a' } as const;
const space = { level: 'space', id: 'space-a' } as const;
const project = { level: 'project', id: 'project-a' } as const;
const workPackage = { level: 'work_package', id: 'package-a' } as const;
const fullChain: ScopeChain = {
  level: 'work_package',
  organizationId: 'org-a',
  spaceId: 'space-a',
  projectId: 'project-a',
  workPackageId: 'package-a',
};
const empty: SettingsSnapshot = { values: [], markers: [] };
const cases: readonly { chain: ScopeChain; frames: readonly SettingScope[] }[] = [
  { chain: { level: 'organization', organizationId: 'org-a' }, frames: [organization] },
  {
    chain: { level: 'space', organizationId: 'org-a', spaceId: 'space-a' },
    frames: [organization, space],
  },
  {
    chain: {
      level: 'project',
      organizationId: 'org-a',
      spaceId: 'space-a',
      projectId: 'project-a',
    },
    frames: [organization, space, project],
  },
  {
    chain: { level: 'project', organizationId: 'org-a', spaceId: null, projectId: 'project-a' },
    frames: [organization, project],
  },
  { chain: fullChain, frames: [organization, space, project, workPackage] },
  { chain: { ...fullChain, spaceId: null }, frames: [organization, project, workPackage] },
];

it('resolves detached defaults without requiring a project at organization or space', () => {
  for (const { chain } of cases) {
    expect(resolveSetting(chain, 'timezone', empty)).toEqual({
      value: 'UTC',
      provenance: { level: 'default' },
    });
    expect(resolveSetting(chain, 'pertWeights', empty)).toEqual({
      value: { optimistic: 1, realistic: 4, pessimistic: 1 },
      provenance: { level: 'default' },
    });
    expect(resolveSetting(chain, 'allowedWorkItemTypes', empty)).toEqual({
      value: [],
      provenance: { level: 'default' },
    });
    expect(resolveSetting(chain, 'budgetFactor', empty)).toEqual({
      value: 1,
      provenance: { level: 'default' },
    });
    expect(resolveSetting(chain, 'calendarMarkers', empty)).toEqual([]);
  }
});

it('selects the nearest timezone and exact provenance for every chain terminus', () => {
  const zones = {
    organization: 'UTC',
    space: 'Europe/Kyiv',
    project: 'Europe/Berlin',
    work_package: 'Asia/Tokyo',
  };
  fc.assert(
    fc.property(
      fc.constantFrom(...cases),
      fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
      ({ chain, frames }, selected) => {
        const included = frames.filter(
          (scope) =>
            selected[['organization', 'space', 'project', 'work_package'].indexOf(scope.level)],
        );
        const winner = included.at(-1);
        const captured: SettingsSnapshot = {
          values: included
            .toReversed()
            .map((scope) => ({ scope, key: 'timezone', value: zones[scope.level] })),
          markers: [],
        };
        expect(resolveSetting(chain, 'timezone', captured)).toEqual(
          winner === undefined
            ? { value: 'UTC', provenance: { level: 'default' } }
            : { value: zones[winner.level], provenance: winner },
        );
      },
    ),
    { numRuns: 200 },
  );
});

it('lets an explicit empty project type set replace a narrower inherited set', () => {
  expect(
    resolveSetting(fullChain, 'allowedWorkItemTypes', {
      values: [
        { scope: organization, key: 'allowedWorkItemTypes', value: ['restricted'] },
        { scope: project, key: 'allowedWorkItemTypes', value: [] },
      ],
      markers: [],
    }),
  ).toEqual({ value: [], provenance: project });
});

it.each([
  ['work_package/allowedWorkItemTypes', workPackage, 'allowedWorkItemTypes', ['a']],
  ['work_package/budgetFactor', workPackage, 'budgetFactor', 2],
  ['space/pertWeights', space, 'pertWeights', { optimistic: 1, realistic: 3, pessimistic: 1 }],
  [
    'organization/pertWeights',
    organization,
    'pertWeights',
    { optimistic: 1, realistic: 3, pessimistic: 1 },
  ],
  ['organization/budgetFactor', organization, 'budgetFactor', 2],
] as const)('refuses forbidden stored %s with a valid value', (_label, scope, key, value) => {
  expect(() =>
    resolveSetting(fullChain, 'timezone', { values: [{ scope, key, value }], markers: [] }),
  ).toThrow('not overridable');
});

it.each([
  ['unknown-key', 1],
  ['calendarMarkers', []],
  ['timezone', 'Kyiv'],
  ['timezone', null],
  ['budgetFactor', 0],
  ['allowedWorkItemTypes', ['a', 'a']],
] as const)('refuses malformed stored %s without hiding it behind a valid winner', (key, value) => {
  expect(() =>
    resolveSetting(fullChain, 'timezone', {
      values: [
        { scope: workPackage, key: 'timezone', value: 'Europe/Kyiv' },
        { scope: project, key, value },
      ],
      markers: [],
    }),
  ).toThrow(key);
});

it('refuses duplicate scope/key rows and foreign or out-of-chain scopes', () => {
  const row = { scope: project, key: 'timezone', value: 'UTC' };
  expect(() => resolveSetting(fullChain, 'timezone', { values: [row, row], markers: [] })).toThrow(
    'duplicate',
  );
  expect(() =>
    resolveSetting(fullChain, 'timezone', {
      values: [{ ...row, scope: { level: 'project', id: 'foreign' } }],
      markers: [],
    }),
  ).toThrow('outside');
  expect(() =>
    resolveSetting({ ...fullChain, spaceId: null }, 'timezone', {
      values: [{ ...row, scope: space }],
      markers: [],
    }),
  ).toThrow('outside');
  expect(() => resolveSetting(cases[0].chain, 'timezone', { values: [row], markers: [] })).toThrow(
    'outside',
  );
});

it('detaches winning arrays, coefficient objects and provenance from the captured rows', () => {
  const weights = { optimistic: 2, realistic: 3, pessimistic: 0 };
  const types = ['a'];
  const captured: SettingsSnapshot = {
    values: [
      { scope: project, key: 'pertWeights', value: weights },
      { scope: project, key: 'allowedWorkItemTypes', value: types },
    ],
    markers: [],
  };
  const resolvedWeights = resolveSetting(fullChain, 'pertWeights', captured);
  const resolvedTypes = resolveSetting(fullChain, 'allowedWorkItemTypes', captured);
  resolvedWeights.value.optimistic = 77;
  resolvedTypes.value.push('caller');
  Reflect.set(resolvedWeights.provenance, 'id', 'caller');
  expect(weights.optimistic).toBe(2);
  expect(types).toEqual(['a']);
  expect(resolveSetting(fullChain, 'pertWeights', captured)).toEqual({
    value: weights,
    provenance: project,
  });
});

function marker(id: string, date = '2026-11-01', createdAt = 1): SettingMarker {
  return { id, date, createdAt, name: 'Holiday', color: null };
}

it('adds every level, preserving equal payloads with different IDs and established order', () => {
  const captured: SettingsSnapshot = {
    values: [],
    markers: [
      { scope: workPackage, marker: marker('z', '2026-11-02') },
      { scope: project, marker: marker('b') },
      { scope: space, marker: marker('a') },
      { scope: organization, marker: marker('first', '2026-10-31') },
    ],
  };
  expect(resolveSetting(fullChain, 'calendarMarkers', captured)).toEqual([
    { marker: marker('first', '2026-10-31'), provenance: organization },
    { marker: marker('a'), provenance: space },
    { marker: marker('b'), provenance: project },
    { marker: marker('z', '2026-11-02'), provenance: workPackage },
  ]);
});

it('orders marker creation ties and retained Unicode IDs by SQLite UTF-8 binary order', () => {
  const ids = ['𐀀', '\ue000', 'aa', 'a'];
  const captured: SettingsSnapshot = {
    values: [],
    markers: [
      ...ids.map((id) => ({ scope: project, marker: marker(id) })),
      { scope: project, marker: marker('older', '2026-11-01', -1) },
    ],
  };
  expect(
    resolveSetting(fullChain, 'calendarMarkers', captured).map(({ marker: point }) => point.id),
  ).toEqual(['older', 'a', 'aa', '\ue000', '𐀀']);
});

it.each(['space', 'project'] as const)('refuses a repeated global marker ID at %s', (level) => {
  const scope = level === 'space' ? space : project;
  expect(() =>
    resolveSetting(fullChain, 'calendarMarkers', {
      values: [],
      markers: [
        { scope: project, marker: marker('duplicate') },
        { scope, marker: marker('duplicate') },
      ],
    }),
  ).toThrow('duplicate');
});

it('validates marker values and scope instead of hiding malformed trusted evidence', () => {
  for (const malformed of [
    null,
    { ...marker('a'), date: '2026-02-31' },
    { ...marker('a'), name: '' },
    { ...marker('a'), color: 4 },
    { ...marker('a'), createdAt: 0.5 },
  ]) {
    expect(() =>
      resolveSetting(fullChain, 'calendarMarkers', {
        values: [],
        markers: [{ scope: project, marker: malformed }],
      }),
    ).toThrow('marker');
  }
  expect(() =>
    resolveSetting(fullChain, 'calendarMarkers', {
      values: [],
      markers: [{ scope: { level: 'space', id: 'foreign' }, marker: marker('a') }],
    }),
  ).toThrow('outside');
});

it('detaches each inherited point and its provenance', () => {
  const point = marker('a');
  const captured: SettingsSnapshot = { values: [], markers: [{ scope: project, marker: point }] };
  const resolved = resolveSetting(fullChain, 'calendarMarkers', captured);
  const first = resolved.at(0);
  if (first === undefined) throw new Error('expected inherited point');
  Reflect.set(first.marker, 'name', 'caller');
  Reflect.set(first.provenance, 'id', 'caller');
  expect(point.name).toBe('Holiday');
  expect(resolveSetting(fullChain, 'calendarMarkers', captured)).toEqual([
    { marker: point, provenance: project },
  ]);
});

it('resolves a project budget and a zero-component work-package PERT override', () => {
  const captured: SettingsSnapshot = {
    values: [
      { scope: project, key: 'budgetFactor', value: 2.5 },
      {
        scope: project,
        key: 'pertWeights',
        value: { optimistic: 1, realistic: 4, pessimistic: 1 },
      },
      {
        scope: workPackage,
        key: 'pertWeights',
        value: { optimistic: 2, realistic: 3, pessimistic: 0 },
      },
    ],
    markers: [],
  };
  expect(resolveSetting(fullChain, 'budgetFactor', captured)).toEqual({
    value: 2.5,
    provenance: project,
  });
  expect(resolveSetting(fullChain, 'pertWeights', captured)).toEqual({
    value: { optimistic: 2, realistic: 3, pessimistic: 0 },
    provenance: workPackage,
  });
});

it('stops additive resolution at each actual chain terminus and skips absent spaces', () => {
  for (const { chain, frames } of cases) {
    const markers = frames.map((scope) => ({ scope, marker: marker(scope.level) }));
    const resolved = resolveSetting(chain, 'calendarMarkers', { values: [], markers });
    expect(resolved.length).toBe(frames.length);
    expect(
      resolved
        .map(({ provenance }) => provenance)
        .sort((left, right) => (left.level < right.level ? -1 : left.level > right.level ? 1 : 0)),
    ).toEqual(
      [...frames].sort((left, right) =>
        left.level < right.level ? -1 : left.level > right.level ? 1 : 0,
      ),
    );
  }
});
