import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import { buildScheduleBody, serialiseScheduleBody } from '../saved-plan-schedule-body';
import { schedule } from '../schedule';
import { canonicalisePlanInput, serialiseCanonicalPlanInput } from './canonical-plan-input';
import { connectedHistoryFixture, connectedPlanFixtureRows } from './connected-history.fixture';
import { readSavedDependencyHistory, serializeSavedDependencyHistory } from './dependency-history';
import manifest from './fixtures/manifest.json';
import { normalisePlanInputForward } from './normalise-plan-input';
import { planFixtureRows } from './plan-fixture';
import { canonicalisePlanInputV10, readSavedPlanInput } from './versioned-plan-input';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const frozen = Array.from({ length: 8 }, (_, index) => ({
  version: index + 1,
  bytes: readFileSync(
    new URL(`./fixtures/input-v${String(index + 1)}.txt`, import.meta.url),
    'utf8',
  ),
}));

describe('versioned saved input readers', () => {
  for (const fixture of frozen) {
    it(`reads frozen input v${String(fixture.version)} as local without rewriting bytes`, () => {
      const before = manifest[fixture.version - 1].sha256;
      expect(hash(fixture.bytes)).toBe(before);
      const parsed: unknown = JSON.parse(fixture.bytes);
      const source = JSON.stringify(parsed);
      const input = readSavedPlanInput(parsed, fixture.version);
      expect(input.schemaVersion).toBe(10);
      expect(input.dependencyHistory).toEqual({ kind: 'local' });
      expect(input.project.id).toBe('p1');
      expect(input).toEqual(
        canonicalisePlanInputV10(normalisePlanInputForward(parsed, fixture.version), {
          kind: 'local',
        }),
      );
      expect(JSON.stringify(parsed)).toBe(source);
      expect(hash(fixture.bytes)).toBe(before);
    });
  }

  it('keeps the published schema9 writer and reads its measures without rewriting bytes', () => {
    const input = canonicalisePlanInput(planFixtureRows);
    const bytes = serialiseCanonicalPlanInput(input);
    expect(input.schemaVersion).toBe(9);
    const decoded = readSavedPlanInput(JSON.parse(bytes), 9);
    expect(decoded).toEqual({ ...input, schemaVersion: 10, dependencyHistory: { kind: 'local' } });
    expect(serialiseCanonicalPlanInput(input)).toBe(bytes);
  });

  it('preserves the frozen legacy schedule1 byte contract and retired algorithm identity', () => {
    const bytes = readFileSync(new URL('./fixtures/schedule-v1.txt', import.meta.url), 'utf8');
    expect(
      serialiseScheduleBody(buildScheduleBody(schedule([], [], []), null, 'retired-fast-v0')),
    ).toBe(bytes);
  });

  it('requires explicit dependency history on input10', () => {
    const local = canonicalisePlanInputV10(planFixtureRows, { kind: 'local' });
    expect(readSavedPlanInput(local, 10)).toEqual(local);
    const { dependencyHistory: ignored, ...incomplete } = local;
    expect(() => readSavedPlanInput(incomplete, 10)).toThrow('dependencyHistory');
  });

  it('refuses header/body version mismatch and malformed new fields', () => {
    const local = canonicalisePlanInputV10(planFixtureRows, { kind: 'local' });
    expect(() => readSavedPlanInput({ ...local, schemaVersion: 8 }, 10)).toThrow('version');
    expect(() => readSavedPlanInput({ ...local, assignments: null }, 10)).toThrow();
    expect(() =>
      readSavedPlanInput({ ...local, project: { ...local.project, name: null } }, 10),
    ).toThrow();
    expect(() => readSavedPlanInput(local, 11)).toThrow('from-the-future');
  });

  it('refuses external claims before a legacy local upgrade can erase them', () => {
    const previous = JSON.parse(frozen[7].bytes) as Record<string, unknown>;
    for (const contaminated of [
      { ...previous, dependencyHistory: { kind: 'connected' } },
      { ...previous, externalDependencies: [] },
      {
        ...previous,
        typedDependencies: [
          {
            id: 'foreign',
            type: 'FS',
            predecessor: { scope: 'whole', projectId: 'foreign', workItemId: 'w1' },
            successor: { scope: 'whole', workItemId: 'w2' },
          },
        ],
      },
    ])
      expect(() => readSavedPlanInput(contaminated, 8)).toThrow();
  });

  for (const version of [1, 2]) {
    it(`refuses original v${String(version)} scoped claims before an upgrade can erase them`, () => {
      const original = JSON.parse(frozen[version - 1].bytes) as Record<string, unknown>;
      const claim = {
        id: 'foreign',
        type: 'FS',
        predecessor: { scope: 'whole', projectId: 'remote', workItemId: 'remote-row' },
        successor: { scope: 'whole', workItemId: 'w2' },
      };
      for (const contaminated of [
        { ...original, typedDependencies: [claim] },
        { ...original, typedDependencies: [{ ...claim, projectId: 'remote' }] },
        { ...original, dependencyHistory: { kind: 'connected' } },
        { ...original, externalDependencies: [] },
      ]) {
        const bytes = JSON.stringify(contaminated);
        expect(() => readSavedPlanInput(contaminated, version)).toThrow('legacy_external');
        expect(JSON.stringify(contaminated)).toBe(bytes);
      }
    });
  }

  it('canonicalizes unordered captured history before future writer activation', () => {
    const captured = connectedHistoryFixture();
    const history = readSavedDependencyHistory(captured.history);
    if (history.kind !== 'connected') throw new Error('fixture must be connected');
    const rows = connectedPlanFixtureRows(history);
    const left = canonicalisePlanInputV10(rows, history);
    const right = canonicalisePlanInputV10(rows, {
      ...history,
      projects: [...history.projects].reverse(),
      ownership: [...history.ownership].reverse(),
      relationships: [...history.relationships].reverse(),
      readiness: [...history.readiness].reverse(),
    });
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
  });

  it('retains direct-fact ownership and duplicate refusal in new bodies', () => {
    const local = canonicalisePlanInputV10(planFixtureRows, { kind: 'local' });
    for (const invalid of [
      { ...local, stepParallels: [{ workItemId: 'missing', stepId: 's1', maxParallel: 2 }] },
      { ...local, stepBlockages: [{ workItemId: 'missing', stepId: 's1', blockedAt: 1 }] },
      {
        ...local,
        stepParallels: [
          { workItemId: 'w2', stepId: 's1', maxParallel: 2 },
          { workItemId: 'w2', stepId: 's1', maxParallel: 3 },
        ],
      },
    ])
      expect(() => readSavedPlanInput(invalid, 10)).toThrow();
  });

  it('retains connected target-owned values, measures, assignments and row facts', () => {
    const history = readSavedDependencyHistory(connectedHistoryFixture().history);
    if (history.kind !== 'connected') throw new Error('fixture must be connected');
    const rows = {
      ...connectedPlanFixtureRows(history),
      stepValues: [
        {
          workItemId: 'a',
          stepId: 'design',
          optimistic: 1,
          realistic: 1,
          pessimistic: 1,
          derived: null,
          actual: null,
          progress: null,
        },
      ],
      measures: [
        {
          workItemId: 'a',
          stepId: 'design',
          metric: 'cost',
          value: 1,
          currency: 'USD',
          rateCardDigest: 'card',
        },
      ],
      assignments: [{ workItemId: 'a', stepId: 'design', personId: 'p-1' }],
      workItemTeams: [{ workItemId: 'a', teamId: 'team-1' }],
      workItemServices: [{ workItemId: 'a', serviceId: 'svc-1' }],
    };
    const input = canonicalisePlanInputV10(rows, history);
    expect(readSavedPlanInput(input, 10)).toMatchObject({
      stepValues: rows.stepValues,
      measures: rows.measures,
      assignments: rows.assignments,
      workItemTeams: rows.workItemTeams,
      workItemServices: rows.workItemServices,
    });
  });

  it('folds converted connected context without live capabilities', () => {
    const captured = connectedHistoryFixture();
    const history = readSavedDependencyHistory(captured.history);
    if (history.kind !== 'connected') throw new Error('fixture must be connected');
    const input = canonicalisePlanInputV10(connectedPlanFixtureRows(history), history);
    expect(input.dependencyHistory).toEqual(
      readSavedDependencyHistory(JSON.parse(serializeSavedDependencyHistory(history))),
    );
    expect(readSavedPlanInput(input, 10)).toEqual(input);
    expect(() => canonicalisePlanInputV10(planFixtureRows, history)).toThrow('target');
  });
});

it('requires complete measure fields on dependency-aware input10', () => {
  const input = canonicalisePlanInputV10(planFixtureRows, { kind: 'local' });
  for (const key of ['measureEstimates', 'budgets'] as const) {
    const invalid = structuredClone(input);
    Reflect.deleteProperty(invalid, key);
    expect(() => readSavedPlanInput(invalid, 10)).toThrow('shape');
  }
  const missingFactor = structuredClone(input);
  Reflect.deleteProperty(missingFactor.project, 'budgetFactor');
  expect(() => readSavedPlanInput(missingFactor, 10)).toThrow('shape');
  const historical = canonicalisePlanInput(planFixtureRows);
  expect(() =>
    readSavedPlanInput({ ...historical, dependencyHistory: { kind: 'local' } }, 9),
  ).toThrow('legacy_external');
});
