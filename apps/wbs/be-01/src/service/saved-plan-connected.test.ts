import { captureConnectedHistory } from '@wbs/core/module/saved-plans/connected-history';
import {
  canonicalConnectedStageInput,
  readSavedPlanInput,
  SavedHistoryError,
  serializeSavedConnectedScheduleBody,
  sliceKey,
} from '@wbs/domain';
import { expect, test } from 'bun:test';

import { captureSavedConnectedFixture } from './saved-plan-connected.fixture';

test.each(['isolated', 'shared'] as const)(
  'converts detached migrated %s capture with interleaved stages and original string codes',
  async (mode) => {
    const captured = await captureSavedConnectedFixture(mode);
    const prepared = captureConnectedHistory(captured, 'a1');
    expect(readSavedPlanInput(prepared.input, 9)).toEqual(prepared.input);
    const history = prepared.input.dependencyHistory;
    if (history.kind !== 'connected') throw new Error('connected history expected');
    expect(history.mode).toBe(mode);
    expect(history.relationships.map((relationship) => relationship.id)).toEqual([
      'ab',
      'ba',
      'hb',
    ]);
    expect(
      history.projects
        .find((project) => project.projectId === 'a1')
        ?.steps.map((step) => step.code),
    ).toEqual(['design', 'test']);
    expect(
      history.readiness.find((node) => node.workItemId === 'b' && node.kind === 'step')?.status,
    ).toBe('blocked_by_proxy');
    if (!prepared.schedule.present) throw new Error('selected schedule expected');
    const placement = captured.projection.placement;
    if (placement.kind !== 'scheduled') throw new Error('scheduled placement expected');
    expect(prepared.schedule.body.slices[sliceKey('a', 'test')].earliestStart).toBe(1.75);
    expect(prepared.schedule.body.connection.stages.map((stage) => stage.stageBytes)).toEqual(
      placement.stages.map((selection) => canonicalConnectedStageInput(selection.stage)),
    );
    const bytes = serializeSavedConnectedScheduleBody(prepared.schedule.body);
    Map.prototype.clear.call(captured.metadataByProject);
    expect(serializeSavedConnectedScheduleBody(prepared.schedule.body)).toBe(bytes);
  },
);

test.each([
  ['project', 'name', 'Old project'],
  ['project', 'abbreviation', 'OLD'],
  ['project', 'startDate', '2026-09-01'],
  ['project', 'scheduleEngine', 'optimized'],
  ['project', 'scheduleObjective', 'time'],
  ['project', 'optimizationEnabled', true],
  ['row', 'hold', 'on_hold'],
  ['row', 'name', 'Old row'],
  ['row', 'parentId', 'missing'],
  ['row', 'position', 99],
  ['row', 'frozenNumber', '999'],
  ['step', 'name', 'Old step'],
  ['step', 'code', 'old'],
  ['step', 'position', 99],
] as const)(
  'refuses contradictory foreign %s %s before historical conversion',
  async (kind, field, value) => {
    const captured = await captureSavedConnectedFixture('isolated');
    const foreign = captured.metadataByProject.get('a2');
    if (foreign === undefined) throw new Error('foreign fixture expected');
    const facts =
      kind === 'project'
        ? foreign.project
        : kind === 'row'
          ? foreign.workItems[0]
          : foreign.steps[0];
    Reflect.set(facts, field, value);
    expect(() => captureConnectedHistory(captured, 'a1')).toThrow(SavedHistoryError);
    expect(() => captureConnectedHistory(captured, 'a1')).toThrow('metadata_facts');
  },
);
