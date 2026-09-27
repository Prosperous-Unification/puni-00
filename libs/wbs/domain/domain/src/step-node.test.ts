import { describe, expect, it } from 'bun:test';

import { formatStepNodeId, listStepNodes, parseStepNodeId } from './step-node';

const WORK_ITEM = '0f8fad5b-d9cb-469f-a165-70867728950e';
const STEP = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('formatStepNodeId', () => {
  it('encodes the pair behind a version prefix', () => {
    expect(formatStepNodeId({ workItemId: WORK_ITEM, stepId: STEP })).toBe(
      `sn1.${WORK_ITEM}.${STEP}`,
    );
  });
});

describe('parseStepNodeId', () => {
  it('round-trips an encoded pair', () => {
    const ref = { workItemId: WORK_ITEM, stepId: STEP };
    expect(parseStepNodeId(formatStepNodeId(ref))).toEqual({ ok: true, ref });
  });

  it('refuses an unknown encoding version', () => {
    expect(parseStepNodeId(`sn2.${WORK_ITEM}.${STEP}`)).toEqual({
      ok: false,
      reason: 'unknown_encoding',
    });
  });

  it('refuses the wrong number of parts', () => {
    for (const bad of [`sn1.${WORK_ITEM}`, `sn1.${WORK_ITEM}.${STEP}.x`, 'sn1', '']) {
      expect(parseStepNodeId(bad)).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('refuses parts that are not ids', () => {
    expect(parseStepNodeId(`sn1.${WORK_ITEM}.dev`)).toEqual({ ok: false, reason: 'malformed' });
    expect(parseStepNodeId(`sn1.010.${STEP}`)).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('listStepNodes', () => {
  const steps = [
    { id: 'qa', code: 'qa', position: 20 },
    { id: 'dev', code: 'dev', position: 10 },
  ];

  it('answers one node per project step for a leaf, in step order, facts or no facts', () => {
    expect(listStepNodes('w', steps)).toEqual([
      { workItemId: 'w', stepId: 'dev' },
      { workItemId: 'w', stepId: 'qa' },
    ]);
  });

  it('answers none in a project with no steps: the leaf keeps its work-item boundary', () => {
    expect(listStepNodes('w', [])).toEqual([]);
  });
});
