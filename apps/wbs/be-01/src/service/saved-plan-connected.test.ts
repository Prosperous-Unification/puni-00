import { captureConnectedHistory } from '@wbs/core/module/saved-plans/connected-history';
import {
  canonicalConnectedStageInput,
  readSavedPlanInput,
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
