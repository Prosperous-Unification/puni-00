import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import { canonicalisePlanInput } from './canonical-plan-input';
import { readLegacySavedPlanInput11 } from './legacy-input11';
import { planFixtureRows } from './plan-fixture';
import * as versioned from './versioned-plan-input';

interface LegacyCapture {
  name: string;
  path: string;
  sha256: string;
  bytes: number;
  schemaVersion: number;
}
const captures = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-input-captures.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { records: LegacyCapture[] };
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

for (const capture of captures.records)
  test(
    'reads the genuine ' +
      capture.name +
      ' as historical eleven without changing its original identity',
    () => {
      const bytes = readFileSync(
        new URL('../../../../../../' + capture.path, import.meta.url),
        'utf8',
      );
      expect(hash(bytes)).toBe(capture.sha256);
      expect(Buffer.byteLength(bytes)).toBe(capture.bytes);
      const body: unknown = JSON.parse(bytes);
      const original = JSON.stringify(body);
      const decoded = versioned.readSavedPlanInput(body, capture.schemaVersion);
      expect(decoded.schemaVersion).toBe(11);
      expect(decoded.workPackage.id).toBe(capture.name.endsWith('connected') ? 'A' : 'p1');
      expect('project' in decoded).toBe(false);
      expect(decoded.dependencyHistory.kind).toBe(
        capture.name.endsWith('connected') ? 'connected' : 'local',
      );
      expect(JSON.stringify(body)).toBe(original);
      expect(hash(bytes)).toBe(capture.sha256);
    },
  );

test('current canonical assembly carries no historical format label', () => {
  const fields = canonicalisePlanInput(planFixtureRows);
  expect('schemaVersion' in fields).toBe(false);
  expect(fields.workPackage.id).toBe('p1');
  expect('project' in fields).toBe(false);
});

test('the current twelve writer requires explicit captured history', () => {
  const candidate: unknown = Reflect.get(versioned, 'canonicalisePlanInputV12');
  expect(typeof candidate).toBe('function');
  if (typeof candidate !== 'function') throw new Error('current twelve writer absent');
  const build = candidate as typeof versioned.canonicalisePlanInputV12;
  const body = build(planFixtureRows, { kind: 'local' });
  expect(body.schemaVersion).toBe(12);
  expect(body.workPackage.id).toBe('p1');
  expect(body.dependencyHistory).toEqual({ kind: 'local' });
  expect(versioned.readSavedPlanInput(body, 12)).toEqual(body);
  expect(() => build(planFixtureRows, undefined as never)).toThrow();
  expect(() => build(planFixtureRows, { kind: 'future' } as never)).toThrow();
  expect(() => versioned.readSavedPlanInput({ ...body, schemaVersion: 10 }, 12)).toThrow('version');
  expect(() => versioned.readSavedPlanInput(body, 13)).toThrow('from-the-future');
});

for (const capture of captures.records)
  test('historical eleven decoding preserves ' + capture.name + ' captured meaning', () => {
    const bytes = readFileSync(
      new URL('../../../../../../' + capture.path, import.meta.url),
      'utf8',
    );
    const original = versioned.readSavedPlanInput(JSON.parse(bytes), capture.schemaVersion);
    if (original.schemaVersion !== 11) throw new Error('historical projection was relabeled');
    const decoded = readLegacySavedPlanInput11(JSON.parse(JSON.stringify(original)));
    expect(decoded).toEqual(original);
    expect('projectId' in decoded.workPackage).toBe(false);
    expect('ownerId' in decoded.workPackage).toBe(true);
    expect(hash(bytes)).toBe(capture.sha256);
  });

test('frozen eleven refuses mixed and historical field spellings', () => {
  const capture = captures.records.find((capture) => capture.schemaVersion === 9);
  if (capture === undefined) throw new Error('published input9 capture absent');
  const bytes = readFileSync(new URL('../../../../../../' + capture.path, import.meta.url), 'utf8');
  const current = versioned.readSavedPlanInput(JSON.parse(bytes), 9);
  expect(() =>
    versioned.readSavedPlanInput({ ...current, project: current.workPackage }, 11),
  ).toThrow('shape');
  expect(() =>
    versioned.readSavedPlanInput({ ...current, work_package: current.workPackage }, 11),
  ).toThrow('shape');
  const historical = { ...current, schemaVersion: 10 };
  expect(() => versioned.readSavedPlanInput(historical, 10)).toThrow('shape');
  expect(hash(bytes)).toBe(capture.sha256);
});

test('legacy input normalization cannot be retargeted past nine with supplied future steps', async () => {
  const { normalisePlanInputForward } = await import('./normalise-plan-input');
  const capture = captures.records.find((capture) => capture.schemaVersion === 9);
  if (capture === undefined) throw new Error('published input9 capture absent');
  const bytes = readFileSync(new URL('../../../../../../' + capture.path, import.meta.url), 'utf8');
  const body: unknown = JSON.parse(bytes);
  const steps = new Map([
    [9, (body: Record<string, unknown>) => ({ ...body, schemaVersion: 10 })],
    [10, (body: Record<string, unknown>) => ({ ...body, schemaVersion: 11 })],
  ]);
  expect(() => normalisePlanInputForward(body, 9, 11, steps)).toThrow(
    'legacy plan input reader target',
  );
  expect(hash(bytes)).toBe(capture.sha256);
});

for (const placement of ['dependency_calendar_missing', 'engine_unavailable'] as const)
  test('legacy ten projects ' + placement + ' captured owners without new live reads', () => {
    const capture = captures.records.find((capture) => capture.name === 'legacy-input10-connected');
    if (capture === undefined) throw new Error('connected10 capture absent');
    const bytes = readFileSync(
      new URL('../../../../../../' + capture.path, import.meta.url),
      'utf8',
    );
    const legacy = JSON.parse(bytes) as {
      dependencyHistory: {
        projects: { projectId: string; abbreviation: string; name: string }[];
        placementState: unknown;
      };
    };
    const member = legacy.dependencyHistory.projects[0];
    legacy.dependencyHistory.placementState =
      placement === 'dependency_calendar_missing'
        ? {
            kind: placement,
            projects: [
              { projectId: member.projectId, abbreviation: member.abbreviation, name: member.name },
            ],
          }
        : {
            kind: placement,
            engine: 'optimized',
            projects: [member.projectId],
            reason: 'adapter_missing',
          };
    const original = JSON.stringify(legacy);
    const current = versioned.readSavedPlanInput(legacy, 10);
    if (current.dependencyHistory.kind !== 'connected') throw new Error('connected evidence lost');
    expect(current.dependencyHistory.placementState).toEqual(
      placement === 'dependency_calendar_missing'
        ? {
            kind: placement,
            workPackages: [
              {
                workPackageId: member.projectId,
                abbreviation: member.abbreviation,
                name: member.name,
              },
            ],
          }
        : {
            kind: placement,
            engine: 'optimized',
            workPackages: [member.projectId],
            reason: 'adapter_missing',
          },
    );
    expect(JSON.stringify(legacy)).toBe(original);
    expect(hash(bytes)).toBe(capture.sha256);
  });
