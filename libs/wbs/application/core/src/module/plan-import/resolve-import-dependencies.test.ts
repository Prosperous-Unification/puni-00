import type { ScopedDependencyEndpoint } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { planDocumentFixture } from '../../testing/plan-document-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { findImportDependencyDuplicate } from './import-values';
import { prepareImport } from './prepare-import';
import { resolveImportDependencies } from './resolve-import-dependencies';

function preparedFixture() {
  const document = planDocumentFixture();
  document.document.version = 11;
  const row = document.workItems.at(0);
  if (row === undefined) throw new Error('fixture lost its row');
  document.workItems.push({ ...structuredClone(row), id: 'row-2', position: 20, externalRefs: [] });
  const external = {
    kind: 'external' as const,
    scope: 'whole' as const,
    projectId: 'original-project',
    workItemId: 'original-row',
    display: {
      projectName: 'Old name',
      abbreviation: 'OLD',
      workItemName: 'Old row name',
      address: 'OLD.99',
    },
  };
  document.typedDependencies = [
    {
      id: 'external-first',
      type: 'SS',
      predecessor: external,
      successor: { kind: 'internal', scope: 'whole', workItem: 'row-2' },
    },
    {
      id: 'internal-second',
      type: 'FS',
      predecessor: { kind: 'internal', scope: 'node', workItem: 'row-1', step: 'step-1' },
      successor: { kind: 'internal', scope: 'node', workItem: 'row-2', step: 'step-2' },
    },
    {
      id: 'external-third',
      type: 'FF',
      predecessor: {
        ...external,
        scope: 'node',
        stepId: 'original-step',
        display: { ...external.display, stepName: 'Old step name' },
      },
      successor: { kind: 'internal', scope: 'whole', workItem: 'row-2' },
    },
  ];
  const prepared = prepareImport(document, fastScheduler);
  if (!prepared.ok) throw new Error(`fixture refused: ${prepared.path}/${String(prepared.detail)}`);
  return prepared.value;
}

const rows = new Map([
  ['row-1', 'allocated-row-1'],
  ['row-2', 'allocated-row-2'],
]);
const steps = new Map([
  ['step-1', 'allocated-step-1'],
  ['step-2', 'allocated-step-2'],
]);

function resolve(prepared = preparedFixture()) {
  let next = 0;
  return resolveImportDependencies(
    prepared,
    'allocated-project',
    rows,
    steps,
    () => `fresh-${String(++next)}`,
  );
}

describe('import relationship allocation', () => {
  it('preserves interleaved document paths and allocates fresh identities in document order', () => {
    const prepared = preparedFixture();
    expect([...prepared.typedDependencyPaths]).toEqual([
      ['internal-second', 'typedDependencies[1]'],
    ]);
    const located = resolve(prepared);
    expect(located.map(({ path }) => path)).toEqual([
      'typedDependencies[0]',
      'typedDependencies[1]',
      'typedDependencies[2]',
    ]);
    expect(located.map(({ relationship }) => relationship.id)).toEqual([
      'fresh-1',
      'fresh-2',
      'fresh-3',
    ]);
    expect(located.map(({ relationship }) => relationship.projectId)).toEqual([
      'allocated-project',
      'allocated-project',
      'allocated-project',
    ]);
    expect(located.at(1)?.relationship).toEqual({
      id: 'fresh-2',
      projectId: 'allocated-project',
      predecessor: {
        scope: 'node',
        projectId: 'allocated-project',
        workItemId: 'allocated-row-1',
        stepId: 'allocated-step-1',
      },
      successor: {
        scope: 'node',
        projectId: 'allocated-project',
        workItemId: 'allocated-row-2',
        stepId: 'allocated-step-2',
      },
      type: 'FS',
    });
  });

  it('orders declaration indices numerically beyond nine', () => {
    const prepared = preparedFixture();
    const external = prepared.externalDependencies.at(0);
    if (external === undefined) throw new Error('fixture lost its external relationship');
    const expanded = {
      ...prepared,
      typedDependencies: [],
      typedDependencyPaths: new Map<string, string>(),
      externalDependencies: Array.from({ length: 12 }, (_, at) => ({
        ...external,
        path: `typedDependencies[${String(11 - at)}]`,
      })),
    };
    expect(resolve(expanded).map(({ path }) => path)).toEqual(
      Array.from({ length: 12 }, (_, at) => `typedDependencies[${String(at)}]`),
    );
  });

  it('remaps whole and descendant-step selectors without changing scope', () => {
    const prepared = preparedFixture();
    const relationship = prepared.typedDependencies.at(0);
    if (relationship === undefined) throw new Error('fixture lost its relationship');
    prepared.typedDependencies = [
      {
        ...relationship,
        predecessor: { scope: 'whole', workItemId: 'row-1' },
        successor: { scope: 'descendant-step', workItemId: 'row-2', stepId: 'step-2' },
      },
    ];
    expect(resolve(prepared).at(1)?.relationship).toMatchObject({
      predecessor: {
        scope: 'whole',
        projectId: 'allocated-project',
        workItemId: 'allocated-row-1',
      },
      successor: {
        scope: 'descendant-step',
        projectId: 'allocated-project',
        workItemId: 'allocated-row-2',
        stepId: 'allocated-step-2',
      },
    });
  });

  it.each<ScopedDependencyEndpoint>([
    { scope: 'whole', projectId: 'chosen-project', workItemId: 'chosen-row' },
    { scope: 'node', projectId: 'chosen-project', workItemId: 'chosen-row', stepId: 'chosen-step' },
    {
      scope: 'descendant-step',
      projectId: 'chosen-project',
      workItemId: 'chosen-row',
      stepId: 'chosen-step',
    },
  ])('retains the selected external destination verbatim: %j', (destination) => {
    const prepared = preparedFixture();
    const external = prepared.externalDependencies.at(0);
    if (external === undefined) throw new Error('fixture lost its external relationship');
    external.destination = destination;
    const allocated = resolve(prepared).at(0)?.relationship;
    expect(allocated?.predecessor).toEqual(destination);
    expect(allocated?.successor).toEqual({
      scope: 'whole',
      projectId: 'allocated-project',
      workItemId: 'allocated-row-2',
    });
  });

  it('retains the original external stable identity when no mapping is supplied', () => {
    const allocated = resolve();
    expect(allocated.at(0)?.relationship.predecessor).toEqual({
      scope: 'whole',
      projectId: 'original-project',
      workItemId: 'original-row',
    });
    expect(allocated.at(2)?.relationship.predecessor).toEqual({
      scope: 'node',
      projectId: 'original-project',
      workItemId: 'original-row',
      stepId: 'original-step',
    });
  });

  it('exposes a full scoped duplicate after an external mapping coincides with an allocated internal endpoint', () => {
    const prepared = preparedFixture();
    const external = prepared.externalDependencies.at(1);
    if (external === undefined) throw new Error('fixture lost its external relationship');
    external.destination = {
      scope: 'node',
      projectId: 'allocated-project',
      workItemId: 'allocated-row-1',
      stepId: 'allocated-step-1',
    };
    external.successor = { scope: 'node', workItemId: 'row-2', stepId: 'step-2' };
    external.type = 'FS';
    expect(
      findImportDependencyDuplicate(
        resolve(prepared).map(({ path, relationship }) => ({ path, ...relationship })),
      ),
    ).toBe('typedDependencies[2]');
  });

  it('throws when a trusted internal diagnostic path disappears', () => {
    const prepared = preparedFixture();
    expect(() => resolve({ ...prepared, typedDependencyPaths: new Map() })).toThrow(
      'prepared typed dependency path disappeared: internal-second',
    );
  });

  it('throws when a trusted row or step allocation disappears', () => {
    const prepared = preparedFixture();
    expect(() =>
      resolveImportDependencies(prepared, 'allocated-project', new Map(), steps, () => 'id'),
    ).toThrow('prepared typed dependency work item mapping disappeared');
    expect(() =>
      resolveImportDependencies(prepared, 'allocated-project', rows, new Map(), () => 'id'),
    ).toThrow('prepared typed dependency step mapping disappeared');
  });
});
