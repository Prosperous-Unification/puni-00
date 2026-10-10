import { describe, expect, it } from 'vitest';

import { planRead, workItemView } from '@/testing/views';

import { projectStepBoard } from './step-board';

describe('projectStepBoard', () => {
  it('keeps held and unestimated leaves with no slices, excludes parents, and counts step progress', () => {
    const plan = planRead({
      seq: 42,
      projectRevision: 7,
      slices: [],
      steps: [
        { id: 'qa', name: 'QA', allowancePercent: 0 },
        { id: 'dev', name: 'Development', allowancePercent: 0 },
      ],
      workItems: [
        workItemView({
          id: 'held',
          parentId: 'parent',
          number: '010.1',
          name: 'Held leaf',
          status: 'on_hold',
          hold: 'on_hold',
          progress: { qa: 'done' },
        }),
        workItemView({
          id: 'unestimated',
          parentId: 'parent',
          number: '010.2',
          name: 'Unestimated leaf',
          status: 'draft',
          progress: { dev: 'in_progress' },
        }),
        workItemView({ id: 'parent', number: '010', name: 'Branch', status: 'in_progress' }),
      ],
    });

    expect(projectStepBoard(plan)).toEqual({
      seq: 42,
      projectRevision: 7,
      columns: {
        unknown: [
          {
            id: 'sn1.held.dev',
            workItemId: 'held',
            stepId: 'dev',
            workItemNumber: '010.1',
            title: 'Held leaf',
            stepName: 'Development',
            workItemStatus: 'on_hold',
          },
          {
            id: 'sn1.unestimated.qa',
            workItemId: 'unestimated',
            stepId: 'qa',
            workItemNumber: '010.2',
            title: 'Unestimated leaf',
            stepName: 'QA',
            workItemStatus: 'draft',
          },
        ],
        inProgress: [
          {
            id: 'sn1.unestimated.dev',
            workItemId: 'unestimated',
            stepId: 'dev',
            workItemNumber: '010.2',
            title: 'Unestimated leaf',
            stepName: 'Development',
            workItemStatus: 'draft',
          },
        ],
        done: [
          {
            id: 'sn1.held.qa',
            workItemId: 'held',
            stepId: 'qa',
            workItemNumber: '010.1',
            title: 'Held leaf',
            stepName: 'QA',
            workItemStatus: 'on_hold',
          },
        ],
      },
    });
  });

  it('keeps card identity through label changes and changes it when a step is recreated', () => {
    const leaf = workItemView({ id: 'leaf', number: '010', name: 'Build' });
    const first = projectStepBoard(
      planRead({
        workItems: [leaf],
        steps: [{ id: 'original', name: 'QA', allowancePercent: 0 }],
      }),
    );
    const renamed = projectStepBoard(
      planRead({
        workItems: [{ ...leaf, number: '020', name: 'Build again' }],
        steps: [{ id: 'original', name: 'Review', allowancePercent: 0 }],
      }),
    );
    const recreated = projectStepBoard(
      planRead({
        workItems: [{ ...leaf, number: '020' }],
        steps: [{ id: 'replacement', name: 'Review', allowancePercent: 0 }],
      }),
    );

    expect(first.columns.unknown).toMatchObject([{ id: 'sn1.leaf.original' }]);
    expect(renamed.columns.unknown).toMatchObject([
      {
        id: 'sn1.leaf.original',
        workItemNumber: '020',
        title: 'Build again',
        stepName: 'Review',
      },
    ]);
    expect(recreated.columns.unknown).toMatchObject([{ id: 'sn1.leaf.replacement' }]);
  });

  it('produces no cards when work items have no project steps', () => {
    expect(projectStepBoard(planRead({ workItems: [workItemView()] })).columns).toEqual({
      unknown: [],
      inProgress: [],
      done: [],
    });
  });

  it('rejects malformed progress instead of treating it as Unknown', () => {
    const leaf = workItemView({ progress: { qa: 'blocked' as 'done' } });
    expect(() =>
      projectStepBoard(
        planRead({
          workItems: [leaf],
          steps: [{ id: 'qa', name: 'QA', allowancePercent: 0 }],
        }),
      ),
    ).toThrow(/progress/);
  });

  it('rejects progress naming a step absent from this delivered tree', () => {
    const leaf = workItemView({ progress: { oldStep: 'done' } });
    expect(() =>
      projectStepBoard(
        planRead({
          workItems: [leaf],
          steps: [{ id: 'qa', name: 'QA', allowancePercent: 0 }],
        }),
      ),
    ).toThrow(/oldStep/);
  });

  it('preserves delivered leaf and step order independently of IDs and numbers', () => {
    const plan = planRead({
      workItems: [
        workItemView({ id: 'z-leaf', number: '020' }),
        workItemView({ id: 'a-leaf', number: '010' }),
      ],
      steps: [
        { id: 'qa', name: 'QA', allowancePercent: 0 },
        { id: 'dev', name: 'Development', allowancePercent: 0 },
      ],
    });
    expect(projectStepBoard(plan).columns.unknown.map((card) => card.id)).toEqual([
      'sn1.z-leaf.qa',
      'sn1.z-leaf.dev',
      'sn1.a-leaf.qa',
      'sn1.a-leaf.dev',
    ]);
    expect(
      projectStepBoard({ ...plan, steps: [...plan.steps].reverse() }).columns.unknown.map(
        (card) => card.id,
      ),
    ).toEqual(['sn1.z-leaf.dev', 'sn1.z-leaf.qa', 'sn1.a-leaf.dev', 'sn1.a-leaf.qa']);
  });

  it('rejects duplicate card identities from repeated leaf IDs', () => {
    const step = { id: 'qa', name: 'QA', allowancePercent: 0 };
    const leaf = workItemView({ id: 'leaf' });
    expect(() =>
      projectStepBoard(
        planRead({
          workItems: [leaf, { ...leaf, number: '020' }],
          steps: [step],
        }),
      ),
    ).toThrow(/sn1\.leaf\.qa/);
  });

  it('rejects duplicate card identities from repeated step IDs', () => {
    const step = { id: 'qa', name: 'QA', allowancePercent: 0 };
    const leaf = workItemView({ id: 'leaf' });
    expect(() =>
      projectStepBoard(
        planRead({
          workItems: [leaf],
          steps: [step, { ...step, name: 'Repeated' }],
        }),
      ),
    ).toThrow(/sn1\.leaf\.qa/);
  });
});
