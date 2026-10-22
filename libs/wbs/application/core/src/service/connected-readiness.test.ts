import { scheduleResolved, sliceKey } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import type { StoredAttempt } from '../ports/step-node-attempt-store';
import { connectedCapture, connectedReads } from '../testing/connected-plan-fixture';
import { deriveConnectedPlan } from './connected-plan';
import type { ConnectedPlanCapture } from './connected-plan-values';
import { deriveConnectedReadiness } from './connected-readiness';

const capture = () => connectedCapture(connectedReads('A', null), connectedReads('B', null));
const derive = (
  held = capture(),
  attempts: ReadonlyMap<string, readonly StoredAttempt[]> = new Map([
    ['A', []],
    ['B', []],
  ]),
) =>
  deriveConnectedReadiness(
    held,
    deriveConnectedPlan(held, { supports: () => false }, scheduleResolved).authored,
    attempts,
  );
const withType = (held: ConnectedPlanCapture, type: 'SS' | 'FF'): ConnectedPlanCapture => ({
  ...held,
  relationships: held.relationships.map((relationship) => ({ ...relationship, type })),
});

describe('connected live readiness', () => {
  it('requires remote FS completion even without calendars', () => {
    expect(derive().eligibilityByNode.get(sliceKey('b', 'build'))?.canStart).toBe(false);
    const a = connectedReads('A', null);
    const held = connectedCapture(
      { ...a, progress: [{ workItemId: 'a', stepId: 'build', state: 'done' }] },
      connectedReads('B', null),
    );
    expect(derive(held).eligibilityByNode.get(sliceKey('b', 'build'))?.canStart).toBe(true);
    expect(derive(held).predecessorIdsByLeaf.get('b')).toEqual(['a']);
  });
  it('retains remote holds in row and node proxy readings', () => {
    const a = connectedReads('A', null);
    const held = connectedCapture(
      { ...a, workItems: a.workItems.map((row) => ({ ...row, hold: 'on_hold' })) },
      connectedReads('B', null),
    );
    expect(derive(held).statuses.get('b')).toBe('blocked_by_proxy');
    expect(derive(held).nodes.readings.get('b')?.['build']).toBe('blocked_by_proxy');
  });
  it('SS accepts an ended unsuccessful actual attempt, while FF exposes finish only', () => {
    const held = withType(capture(), 'SS');
    expect(derive(held).eligibilityByNode.get(sliceKey('b', 'build'))?.canStart).toBe(false);
    const attempts: ReadonlyMap<string, readonly StoredAttempt[]> = new Map([
      [
        'A',
        [
          {
            workItemId: 'a',
            stepId: 'build',
            attemptNumber: 1,
            startedAt: 1,
            endedAt: 2,
            outcome: 'failed',
            executorPersonId: null,
            reference: null,
            note: null,
          },
        ],
      ],
      ['B', []],
    ]);
    expect(derive(held, attempts).eligibilityByNode.get(sliceKey('b', 'build'))?.canStart).toBe(
      true,
    );
    expect(
      derive(withType(held, 'FF')).eligibilityByNode.get(sliceKey('b', 'build')),
    ).toMatchObject({ canStart: true, canFinish: false });
  });
  it('refuses absent attempts and own-project foreign step evidence', () => {
    expect(() => derive(capture(), new Map([['B', []]]))).toThrow('attempts');
    const a = connectedReads('A');
    const b = connectedReads('B');
    const foreign = { ...b, steps: [...b.steps, { ...b.steps[0], id: 'foreign' }] };
    expect(() =>
      derive(
        connectedCapture(
          { ...a, progress: [{ workItemId: 'a', stepId: 'foreign', state: 'done' }] },
          foreign,
        ),
      ),
    ).toThrow('own project');
    expect(() =>
      derive(
        connectedCapture(
          {
            ...a,
            stepBlockages: [{ workItemId: 'a', stepId: 'foreign', blockedAt: 1, blockedBy: 'u' }],
          },
          foreign,
        ),
      ),
    ).toThrow('own project');
    expect(() =>
      derive(
        connectedCapture(a, foreign),
        new Map([
          [
            'A',
            [
              {
                workItemId: 'a',
                stepId: 'foreign',
                attemptNumber: 1,
                startedAt: 1,
                endedAt: null,
                outcome: null,
                executorPersonId: null,
                reference: null,
                note: null,
              },
            ],
          ],
          ['B', []],
        ]),
      ),
    ).toThrow('own project');
  });
});
