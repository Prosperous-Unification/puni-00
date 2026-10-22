import { clientFromShapes, getWorkItems, validateSchema } from '@wbs/contracts';
import { canonicalConnectedStageInput, sliceKey } from '@wbs/domain';
import { expect, test } from 'bun:test';

import { presentConnectedTree } from '../module/work-item/work-item.resource';
import {
  createConnectedOptimizationRead as captured,
  createConnectedOptimizationTree,
  createFractionalConnectedOptimizationTree,
} from '../testing/connected-optimization-view.fixture';
import { projectConnectedTree } from './connected-tree';

const key = (id: string) => sliceKey(id, 'build');

test('fractional fixture prepares the actual empty integer window and retains its real dates', async () => {
  const tree = createFractionalConnectedOptimizationTree();
  expect(tree.optimization).toMatchObject({
    displayed: 'fast',
    variants: {
      time: { state: 'boundary-infeasible', certificate: { evidence: 'contradictory-bounds' } },
    },
    finishDays: { fast: 1.2 },
    sameOrderAsFast: {},
  });
  expect(tree.workItems[0]?.schedule).toMatchObject({ earliestStart: 0.2, earliestFinish: 1.2 });
  expect(tree.workItems[0]?.deadline).toBeNull();
  expect(tree.optimization?.scope?.fixed.find((fixed) => fixed.projectId === 'A')).toMatchObject({
    start: 0,
    finish: 0.2,
  });
  expect(tree.optimization?.scope?.fixed.find((fixed) => fixed.projectId === 'C')).toMatchObject({
    start: 1.2,
    finish: 2.2,
  });
  expect((await validateSchema(getWorkItems.responses[0].schema, tree)).issues).toBeUndefined();
});

test.each(['idle', 'pending', 'failed'] as const)(
  'fractional terminal Time leaves the captured Pri %s state independent through decoding',
  async (sibling) => {
    const tree = createFractionalConnectedOptimizationTree(sibling);
    expect(tree.optimization?.variants.pri.state).toBe(sibling);
    expect(tree.optimization?.variants.time.state).toBe('boundary-infeasible');
    expect(tree.optimization?.finishDays).toEqual({ fast: 1.2 });
    expect(tree.slices).toMatchObject([{ earliestStart: 0.2, earliestFinish: 1.2 }]);
    const serialized: unknown = JSON.parse(JSON.stringify(tree));
    const decoded = await clientFromShapes([getWorkItems], () =>
      Promise.resolve({ kind: 'json', status: 200, body: serialized }),
    )['getApiProjectsByIdWork-items']({ params: { id: 'B' } });
    expect(decoded).toMatchObject({ kind: 'success', body: tree });
  },
);

test('mixed fixture exposes captured C=8 independently of its final common-axis C=6', () => {
  const a = createConnectedOptimizationTree('ready', 'A');
  const c = createConnectedOptimizationTree('ready', 'C');
  expect(a.optimization?.scope?.fixed.find((fixed) => fixed.projectId === 'C')).toMatchObject({
    start: 8,
    finish: 9,
  });
  // C's Wednesday anchor is two workdays after the Monday component origin.
  expect(c.workItems[0]?.schedule).toMatchObject({ earliestStart: 4, earliestFinish: 5 });
  expect(c.startDate).toBe('2026-10-07');
});

test('projects retained scope and target-only comparisons through the real connected tree producer', () => {
  const observation = captured();
  const a = projectConnectedTree(observation, 'A');
  const b = projectConnectedTree(observation, 'B');
  const c = projectConnectedTree(observation, 'C');
  expect(a.optimizationView).toMatchObject({
    enabled: true,
    engine: 'optimized',
    objective: 'time',
    displayed: 'time',
    generation: null,
    scope: {
      kind: 'connected-stage',
      projectId: 'A',
      mode: 'isolated',
      quantum: 48,
      wireVersion: 5,
    },
    finishDays: { fast: 8, pri: 2, time: 2 },
    sameOrderAsFast: { pri: true, time: true },
  });
  expect(b.optimizationView).toMatchObject({ displayed: 'fast', finishDays: { fast: 5, time: 3 } });
  expect(c.optimizationView).toMatchObject({ displayed: 'time', finishDays: { fast: 7, time: 5 } });
  expect(a.optimizationView?.scope.fixed.find((slice) => slice.projectId === 'C')).toEqual({
    projectId: 'C',
    projectName: 'C',
    projectAbbreviation: 'PC',
    workItemId: 'c',
    workItemName: 'c',
    stepId: 'build',
    stepName: 'Build',
    start: 8,
    finish: 9,
  });
  if (a.optimization === null) throw new Error('missing stage');
  expect(a.optimizationView?.scope.boundary).toEqual({
    format: 'wbs-connected-stage',
    version: 1,
    canonical: canonicalConnectedStageInput(a.optimization.stage),
  });
  if (c.placement.kind !== 'scheduled') throw new Error('missing placement');
  expect(c.placement.schedule.slices.get(key('c'))?.earliestStart).toBe(4);
  expect(JSON.parse(JSON.stringify(a.optimizationView))).toEqual(a.optimizationView);
});

test.each(['pending', 'boundary-infeasible'] as const)(
  '%s retains dates and supplies no fabricated candidate comparison',
  (state) => {
    const observation = captured(state);
    const tree = projectConnectedTree(observation, 'A');
    expect(tree.optimizationView).toMatchObject({
      displayed: 'fast',
      variants: { time: { state } },
      finishDays: { fast: 8 },
      sameOrderAsFast: {},
    });
    expect(tree.optimizationView?.finishDays).not.toHaveProperty('time');
    if (tree.placement.kind !== 'scheduled') throw new Error('missing placement');
    expect(tree.placement.schedule.slices.get(key('a'))?.earliestStart).toBe(3);
  },
);

test.each(['project', 'row', 'step'] as const)(
  'refuses missing captured foreign %s labels through the tree producer',
  (fault) => {
    const observation = captured();
    const metadata = new Map(observation.metadataByProject);
    const c = metadata.get('C');
    if (c === undefined) throw new Error('missing metadata');
    const changed = structuredClone(c);
    const label =
      fault === 'project'
        ? changed.project
        : fault === 'row'
          ? changed.workItems.at(0)
          : changed.steps.at(0);
    if (label === undefined) throw new Error('missing fixture label');
    Reflect.set(label, 'name', null);
    metadata.set('C', changed);
    expect(() =>
      projectConnectedTree({ ...observation, metadataByProject: metadata }, 'A'),
    ).toThrow();
  },
);

test('quantisation floor compares the published baseline without fabricating an improved finish', () => {
  const tree = projectConnectedTree(captured('floor'), 'A');
  expect(tree.optimizationView).toMatchObject({
    displayed: 'time',
    variants: { time: { state: 'ready', proof: 'quantisation-floor' } },
    finishDays: { fast: 8, time: 8 },
    sameOrderAsFast: { time: true },
  });
});

test('disabled and idle members have no generated optimization identity', () => {
  const observation = captured();
  if (observation.projection.placement.kind !== 'scheduled')
    throw new Error('missing fixture placement');
  const placement = observation.projection.placement;
  const disabled = {
    ...observation,
    projection: {
      ...observation.projection,
      placement: {
        ...placement,
        stages: placement.stages.map((selection) =>
          selection.stage.projectId === 'A'
            ? {
                ...selection,
                optimization: null,
                chosen: null,
                decisions: { pri: null, time: null },
              }
            : selection,
        ),
      },
    },
  };
  expect(projectConnectedTree(disabled, 'A').optimizationView).toBeNull();
  const idle = {
    ...observation,
    projection: {
      ...observation.projection,
      placement: {
        ...placement,
        stages: placement.stages.filter((selection) => selection.stage.projectId !== 'A'),
        idleProjects: ['A'],
      },
    },
  };
  expect(projectConnectedTree(idle, 'A').optimizationView).toBeNull();
  const missing = {
    ...idle,
    projection: {
      ...idle.projection,
      placement: { ...idle.projection.placement, idleProjects: [] },
    },
  };
  expect(() => projectConnectedTree(missing, 'A')).toThrow(
    'missing connected optimization stage A',
  );
});

test('unavailable placement has no optimization view and preserves inspectable relationships', () => {
  const observation = captured();
  const unavailable = {
    ...observation,
    projection: {
      ...observation.projection,
      placement: { kind: 'unavailable' as const, reason: 'calendar_range' as const },
    },
  };
  const tree = projectConnectedTree(unavailable, 'A');
  expect(tree.optimizationView).toBeNull();
  expect(tree.dependencies).toHaveLength(1);
});

test('refuses absent captured labels and returns detached variant evidence', () => {
  const observation = captured('boundary-infeasible');
  const view = projectConnectedTree(observation, 'A').optimizationView;
  if (view === null) throw new Error('missing optimization view');
  Reflect.set(view.variants.time, 'state', 'pending');
  expect(projectConnectedTree(observation, 'A').optimizationView?.variants.time.state).toBe(
    'boundary-infeasible',
  );
  const c = observation.metadataByProject.get('C');
  if (c === undefined) throw new Error('missing metadata');
  Reflect.deleteProperty(c.project, 'name');
  expect(() => projectConnectedTree(observation, 'A')).toThrow(
    'missing connected optimization project name C',
  );
});

test.each(['ready', 'pending', 'boundary-infeasible', 'floor'] as const)(
  'public connected %s projection survives strict response and generated client decoding',
  async (state) => {
    const projection = projectConnectedTree(captured(state), 'A');
    const tree = createConnectedOptimizationTree(state);
    if (projection.optimizationView === null) throw new Error('missing projected fixture');
    expect(tree.optimization).toEqual(projection.optimizationView);
    expect((await validateSchema(getWorkItems.responses[0].schema, tree)).issues).toBeUndefined();
    const decodeTree = (body: unknown) =>
      clientFromShapes([getWorkItems], () => Promise.resolve({ kind: 'json', status: 200, body }))[
        'getApiProjectsByIdWork-items'
      ]({ params: { id: 'A' } });
    expect(await decodeTree(tree)).toMatchObject({
      kind: 'success',
      body: { optimization: projection.optimizationView },
    });
    const optimization = tree.optimization;
    if (optimization?.scope === undefined) throw new Error('missing public connected scope');
    const malformed: unknown[] = [
      { ...optimization, scope: { ...optimization.scope, kind: 'unknown' } },
      {
        ...optimization,
        scope: { ...optimization.scope, boundary: { ...optimization.scope.boundary, version: 2 } },
      },
      { ...optimization, scope: { ...optimization.scope, quantum: undefined } },
      { ...optimization, variants: { ...optimization.variants, time: { state: 'unknown' } } },
    ];
    for (const field of Object.keys(optimization.scope)) {
      malformed.push({ ...optimization, scope: { ...optimization.scope, [field]: undefined } });
    }
    for (const field of Object.keys(optimization.scope.boundary)) {
      malformed.push({
        ...optimization,
        scope: {
          ...optimization.scope,
          boundary: { ...optimization.scope.boundary, [field]: undefined },
        },
      });
    }
    const foreign = optimization.scope.fixed.at(0);
    if (foreign === undefined) throw new Error('missing fixed fixture');
    for (const field of Object.keys(foreign)) {
      malformed.push({
        ...optimization,
        scope: { ...optimization.scope, fixed: [{ ...foreign, [field]: undefined }] },
      });
    }
    if (state === 'boundary-infeasible') {
      malformed.push({
        ...optimization,
        variants: { ...optimization.variants, time: { state: 'boundary-infeasible' } },
      });
      const terminal = optimization.variants.time;
      if (terminal.state !== 'boundary-infeasible') throw new Error('missing terminal fixture');
      malformed.push({
        ...optimization,
        variants: { ...optimization.variants, time: { certificate: terminal.certificate } },
      });
      for (const field of Object.keys(terminal.certificate)) {
        malformed.push({
          ...optimization,
          variants: {
            ...optimization.variants,
            time: { ...terminal, certificate: { ...terminal.certificate, [field]: undefined } },
          },
        });
      }
      for (const field of Object.keys(terminal.certificate.question)) {
        malformed.push({
          ...optimization,
          variants: {
            ...optimization.variants,
            time: {
              ...terminal,
              certificate: {
                ...terminal.certificate,
                question: { ...terminal.certificate.question, [field]: undefined },
              },
            },
          },
        });
      }
      const unscoped = { ...optimization, scope: undefined };
      malformed.push(unscoped);
      malformed.push({
        ...optimization,
        variants: {
          ...optimization.variants,
          time: {
            state: 'boundary-infeasible',
            certificate: { kind: 'boundary-infeasible', question: {} },
          },
        },
      });
    }
    for (const altered of malformed) {
      const invalid: unknown = JSON.parse(JSON.stringify(altered));
      expect(
        (await validateSchema(getWorkItems.responses[0].schema, { ...tree, optimization: invalid }))
          .issues,
      ).toBeDefined();
      expect(await decodeTree({ ...tree, optimization: invalid })).toMatchObject({
        kind: 'failure',
        failure: { code: 'invalid_response' },
      });
    }
  },
);

const questionFaults = {
  projectId: 'other',
  objective: 'pri',
  inputHash: 'other',
  contractVersion: 'other',
  budgetMs: 101,
  quantum: 49,
  wireVersion: 6,
  stageBytes: 'other',
};
for (const [field, altered] of Object.entries(questionFaults)) {
  test(`connected terminal rejects semantic question mismatch: ${field}`, async () => {
    const tree = {
      ...presentConnectedTree(projectConnectedTree(captured('boundary-infeasible'), 'A')),
      undoable: false,
      redoable: false,
    };
    const optimization = tree.optimization;
    if (
      optimization?.scope === undefined ||
      optimization.variants.time.state !== 'boundary-infeasible'
    )
      throw new Error('missing terminal');
    const terminal = optimization.variants.time;
    const invalid = {
      ...tree,
      optimization: {
        ...optimization,
        variants: {
          ...optimization.variants,
          time: {
            ...terminal,
            certificate: {
              ...terminal.certificate,
              question: { ...terminal.certificate.question, [field]: altered },
            },
          },
        },
      },
    };
    const decoded = await clientFromShapes([getWorkItems], () =>
      Promise.resolve({ kind: 'json', status: 200, body: invalid }),
    )['getApiProjectsByIdWork-items']({ params: { id: 'A' } });
    expect(decoded).toMatchObject({ kind: 'failure', failure: { code: 'invalid_response' } });
    const checked = await validateSchema(getWorkItems.responses[0].schema, invalid);
    expect(checked.issues).toBeDefined();
    expect(
      checked.issues?.some(
        (issue) =>
          JSON.stringify(issue.path) ===
          JSON.stringify(['optimization', 'variants', 'time', 'certificate', 'question', field]),
      ),
    ).toBe(true);
  });
}

test('connected nonselected terminal objective and unrelated question hash are valid', async () => {
  const tree = {
    ...presentConnectedTree(projectConnectedTree(captured('boundary-infeasible'), 'A')),
    undoable: false,
    redoable: false,
  };
  const optimization = tree.optimization;
  if (optimization?.scope === undefined) throw new Error('missing scope');
  const valid = { ...tree, optimization: { ...optimization, objective: 'pri', displayed: 'fast' } };
  expect((await validateSchema(getWorkItems.responses[0].schema, valid)).issues).toBeUndefined();
  expect(
    await clientFromShapes([getWorkItems], () =>
      Promise.resolve({ kind: 'json', status: 200, body: valid }),
    )['getApiProjectsByIdWork-items']({ params: { id: 'A' } }),
  ).toMatchObject({ kind: 'success' });
});

for (const fault of [
  'displayed',
  'ready-finish',
  'ready-order',
  'nonready-finish',
  'nonready-order',
] as const) {
  test(`connected comparisons reject semantic mismatch: ${fault}`, async () => {
    const tree = {
      ...presentConnectedTree(
        projectConnectedTree(captured(fault.startsWith('ready') ? 'ready' : 'pending'), 'A'),
      ),
      undoable: false,
      redoable: false,
    };
    const optimization = tree.optimization;
    if (optimization?.scope === undefined) throw new Error('missing scope');
    const invalid = {
      ...tree,
      optimization: {
        ...optimization,
        ...(fault === 'displayed' ? { displayed: 'pri' } : {}),
        finishDays: {
          ...optimization.finishDays,
          ...(fault === 'ready-finish'
            ? { pri: undefined }
            : fault === 'nonready-finish'
              ? { pri: 1 }
              : {}),
        },
        sameOrderAsFast: {
          ...optimization.sameOrderAsFast,
          ...(fault === 'ready-order'
            ? { pri: undefined }
            : fault === 'nonready-order'
              ? { pri: true }
              : {}),
        },
      },
    };
    const body: unknown = JSON.parse(JSON.stringify(invalid));
    expect(
      await clientFromShapes([getWorkItems], () =>
        Promise.resolve({ kind: 'json', status: 200, body }),
      )['getApiProjectsByIdWork-items']({ params: { id: 'A' } }),
    ).toMatchObject({ kind: 'failure', failure: { code: 'invalid_response' } });
    expect((await validateSchema(getWorkItems.responses[0].schema, body)).issues).toBeDefined();
  });
}
