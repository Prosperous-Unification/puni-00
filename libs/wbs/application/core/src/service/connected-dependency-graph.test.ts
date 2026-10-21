import { findStepNodeCycle, NO_ALLOWANCE } from '@wbs/domain';
import { expect, it } from 'bun:test';

import type { StoredTypedDependency } from '../ports/typed-dependency-store';
import { workItemRow } from '../testing/work-item-fixture';
import {
  ConnectedDependencyGraphReader,
  type ConnectedDependencyGraphReads,
  type ConnectedGraphReadAuthority,
  resolveConnectedDependencyGraph,
} from './connected-dependency-graph';
import type { DependencyGraphState } from './dependency-graph';

async function expectRejection(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  const failure: unknown = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(failure instanceof Error ? failure.message : failure).toMatch(pattern);
}

function state(
  projectId: string,
  workItemIds: string[] = [projectId.toUpperCase()],
): DependencyGraphState {
  return {
    rows: workItemIds.map((id) => workItemRow({ id, projectId })),
    steps: ['first', 'last'].map((suffix) => ({
      id: `${projectId}-${suffix}`,
      estimateUnit: 'workdays' as const,
      allowancePercent: NO_ALLOWANCE,
    })),
    estimates: workItemIds.map((workItemId) => ({ workItemId, stepId: `${projectId}-first` })),
    reach: 'anchor-slice',
    legacy: [],
    typed: [],
  };
}
function link(id: string, from: string, to: string): StoredTypedDependency {
  return {
    id,
    projectId: to,
    predecessor: { projectId: from, scope: 'whole', workItemId: from.toUpperCase() },
    successor: { projectId: to, scope: 'whole', workItemId: to.toUpperCase() },
    type: 'FS',
  };
}
function observation() {
  let active = true;
  const facts = new Map(['a', 'b', 'c', 'd'].map((id) => [id, state(id)]));
  const relationships: StoredTypedDependency[] = [];
  const calls: string[] = [];
  const forbidden = new Set<string>();
  const authority: ConnectedGraphReadAuthority = {
    assertActive: () => {
      if (!active) throw new Error('expired observation');
    },
    requireProject: (id) => {
      calls.push(`admit:${id}`);
      if (forbidden.has(id)) return Promise.reject(new Error(`unreadable ${id}`));
      return Promise.resolve();
    },
  };
  const read = (kind: string, id: string): DependencyGraphState => {
    calls.push(`${kind}:${id}`);
    const found = facts.get(id);
    if (found === undefined) throw new Error(`missing fixture ${id}`);
    return found;
  };
  const reads: ConnectedDependencyGraphReads = {
    projects: {
      findById: (id) => {
        calls.push(`project:${id}`);
        const found = facts.get(id);
        return Promise.resolve(found === undefined ? null : { id, depReach: found.reach });
      },
      stepsOf: (id) => Promise.resolve(read('steps', id).steps),
    },
    workItems: { listByProject: (id) => Promise.resolve(read('rows', id).rows) },
    estimates: { listByProject: (id) => Promise.resolve(read('estimates', id).estimates) },
    dependencies: { listByProject: (id) => Promise.resolve(read('legacy', id).legacy) },
    typedDependencies: {
      listIncident: (ids) => {
        calls.push(`incident:${ids.join(',')}`);
        return Promise.resolve(
          relationships.filter(
            (relationship) =>
              ids.includes(relationship.predecessor.projectId) ||
              ids.includes(relationship.successor.projectId),
          ),
        );
      },
    },
  };
  return {
    facts,
    relationships,
    calls,
    forbidden,
    reads,
    authority,
    expire: () => {
      active = false;
    },
    reader: new ConnectedDependencyGraphReader(reads, authority),
  };
}

it('walks incoming and outgoing incidents once, without an owned-empty shortcut', async () => {
  const scope = observation();
  scope.relationships.push(link('ba', 'b', 'a'), link('bc', 'b', 'c'), link('cd', 'c', 'd'));
  const captured = await scope.reader.read(['a']);
  expect(captured.projects.map((project) => project.projectId)).toEqual(['a', 'b', 'c', 'd']);
  expect(captured.external.map((relationship) => relationship.id)).toEqual(['ba', 'bc', 'cd']);
  for (const id of ['a', 'b', 'c', 'd']) {
    expect(scope.calls.filter((call) => call === `rows:${id}`)).toHaveLength(1);
    expect(scope.calls.filter((call) => call === `incident:${id}`)).toHaveLength(1);
    expect(scope.calls.indexOf(`admit:${id}`)).toBeLessThan(scope.calls.indexOf(`rows:${id}`));
  }
});

it('reads each project with its own reach, steps, estimate presence and unreduced holds', async () => {
  const scope = observation();
  const a = state('a', ['A', 'A2']);
  const b = state('b', ['B', 'B2']);
  scope.facts.set('a', {
    ...a,
    rows: a.rows.map((row) => ({ ...row, hold: 'on_hold' as const })),
    legacy: [{ predecessorId: 'A', successorId: 'A2' }],
  });
  scope.facts.set('b', {
    ...b,
    reach: 'whole-item',
    legacy: [{ predecessorId: 'B', successorId: 'B2' }],
  });
  scope.relationships.push(link('ab', 'a', 'b'));
  const graph = resolveConnectedDependencyGraph(await scope.reader.read(['a']));
  expect(
    graph.graph.edges
      .filter((edge) => edge.provenance === 'legacy')
      .map((edge) => edge.predecessor),
  ).toEqual([
    { leafId: 'A', at: 0 },
    { leafId: 'B', at: 1 },
  ]);
  expect(graph.graph.nodes).toHaveLength(8);
  expect(
    graph.graph.nodes.filter((node) => node.kind === 'step').map((node) => node.ref.stepId),
  ).toEqual(['a-first', 'a-last', 'a-first', 'a-last', 'b-first', 'b-last', 'b-first', 'b-last']);
});

it('replaces complete successor-owned sets and seeds both old and new components', async () => {
  const scope = observation();
  scope.relationships.push(link('old', 'b', 'a'), link('dc', 'd', 'c'));
  const captured = await scope.reader.read(
    ['a'],
    [{ projectId: 'a', typed: [link('new', 'c', 'a')] }],
  );
  expect(captured.projects.map((project) => project.projectId)).toEqual(['a', 'b', 'c', 'd']);
  expect(captured.external.map((relationship) => relationship.id)).toEqual(['dc', 'new']);
  expect((await scope.reader.read(['a'], [{ projectId: 'a', typed: [] }])).external).toEqual([]);
});

it('observes staged changes freshly on every evaluation and applies precise local overrides', async () => {
  const scope = observation();
  scope.relationships.push(link('ab', 'a', 'b'));
  expect(await scope.reader.findCycle(['a'])).toBeNull();
  scope.relationships.push(link('ba', 'b', 'a'));
  expect((await scope.reader.findCycle(['a']))?.kind).toBe('cycle');
  const changed = state('a', ['A', 'A2']);
  const captured = await scope.reader.read(
    ['a'],
    [
      {
        projectId: 'a',
        rows: changed.rows,
        steps: [],
        estimates: [],
        reach: 'whole-item',
        legacy: [{ predecessorId: 'A', successorId: 'A2' }],
        typed: [],
      },
    ],
  );
  expect(captured.projects.find((project) => project.projectId === 'a')?.state).toMatchObject({
    rows: changed.rows,
    steps: [],
    estimates: [],
    reach: 'whole-item',
    legacy: [{ predecessorId: 'A', successorId: 'A2' }],
    typed: [],
  });
});

it('finds incoming step references with project identity and preserves local links', async () => {
  const scope = observation();
  const dependency: StoredTypedDependency = {
    ...link('ab', 'a', 'b'),
    predecessor: { projectId: 'a', workItemId: 'A', scope: 'node', stepId: 'a-first' },
  };
  const local: StoredTypedDependency = {
    ...link('local', 'a', 'a'),
    predecessor: { projectId: 'a', workItemId: 'A', scope: 'node', stepId: 'a-first' },
    successor: { projectId: 'a', workItemId: 'A', scope: 'node', stepId: 'a-last' },
  };
  scope.relationships.push(dependency, local);
  expect(await scope.reader.findStepReferences('a', 'a-first')).toEqual(['ab', 'local']);
  expect(await scope.reader.findStepReferences('b', 'a-first')).toEqual([]);
  expect(
    findStepNodeCycle(resolveConnectedDependencyGraph(await scope.reader.read(['a'])).graph),
  ).toBeNull();
});

it('refuses expired borrowed capabilities before reads and if expiry happens during a read', async () => {
  const scope = observation();
  scope.expire();
  await expectRejection(scope.reader.read(['a']), /expired/);
  expect(scope.calls).toEqual([]);
  const during = observation();
  during.reads.typedDependencies.listIncident = () => {
    during.expire();
    return Promise.resolve([]);
  };
  await expectRejection(during.reader.read(['a']), /expired/);
});

it('requires reached-project authority before any project or tree read', async () => {
  const scope = observation();
  scope.relationships.push(link('ba', 'b', 'a'));
  scope.forbidden.add('b');
  await expectRejection(scope.reader.read(['a']), /unreadable b/);
  expect(scope.calls).not.toContain('rows:b');
  expect(scope.calls).not.toContain('project:b');
});

it('throws for missing required projects, unreadable facts and foreign work-item rows', async () => {
  const scope = observation();
  scope.relationships.push(link('ba', 'b', 'a'));
  scope.facts.delete('b');
  await expectRejection(scope.reader.read(['a']), /project b/);
  const broken = observation();
  broken.reads.estimates.listByProject = () => Promise.reject(new Error('unreadable estimates'));
  await expectRejection(broken.reader.read(['a']), /unreadable estimates/);
  const foreign = observation();
  foreign.facts.set('a', { ...state('a'), rows: [workItemRow({ id: 'A', projectId: 'foreign' })] });
  await expectRejection(foreign.reader.read(['a']), /work item A.*project a/);
});

it('rejects malformed owner, unrelated incident rows and conflicting stored identities', async () => {
  const owner = observation();
  owner.relationships.push({ ...link('bad', 'b', 'a'), projectId: 'b' });
  await expectRejection(owner.reader.read(['a']), /owner.*bad/);
  const unrelated = observation();
  unrelated.reads.typedDependencies.listIncident = () => Promise.resolve([link('wrong', 'b', 'c')]);
  await expectRejection(unrelated.reader.read(['a']), /incident.*wrong/);
  const conflicting = observation();
  conflicting.relationships.push(link('same', 'a', 'b'), link('same', 'a', 'c'));
  await expectRejection(conflicting.reader.read(['a']), /conflicting relationship same/);
});

it('rejects duplicate overrides and a proposed set owned by another project', async () => {
  const scope = observation();
  await expectRejection(
    scope.reader.read(['a'], [{ projectId: 'a' }, { projectId: 'a' }]),
    /duplicate.*a/,
  );
  await expectRejection(
    scope.reader.read(['a'], [{ projectId: 'a', typed: [link('wrong', 'a', 'b')] }]),
    /proposed.*owner.*wrong/,
  );
});

it('keeps held work in the authored cycle decision', async () => {
  const scope = observation();
  const held = state('a');
  scope.facts.set('a', { ...held, rows: held.rows.map((row) => ({ ...row, hold: 'on_hold' })) });
  scope.relationships.push(link('ab', 'a', 'b'), link('ba', 'b', 'a'));
  expect((await scope.reader.findCycle(['a']))?.kind).toBe('cycle');
});

it('rejects each proposed ownership mismatch independently', async () => {
  const scope = observation();
  const wrongOwner = { ...link('wrong-owner', 'b', 'a'), projectId: 'b' };
  const wrongSuccessor = { ...link('wrong-successor', 'b', 'b'), projectId: 'a' };
  await expectRejection(
    scope.reader.read(['a'], [{ projectId: 'a', typed: [wrongOwner] }]),
    /proposed owner.*wrong-owner/,
  );
  await expectRejection(
    scope.reader.read(['a'], [{ projectId: 'a', typed: [wrongSuccessor] }]),
    /proposed owner.*wrong-successor/,
  );
});

it('rejects conflicting stored identities even if an override removes their owner', async () => {
  const scope = observation();
  scope.relationships.push(link('same', 'b', 'a'), link('same', 'c', 'a'));
  await expectRejection(
    scope.reader.read(['a'], [{ projectId: 'a', typed: [] }]),
    /conflicting relationship same/,
  );
});

it('rejects conflicts between effective proposed sets and retained owners', async () => {
  const scope = observation();
  scope.relationships.push(link('same', 'a', 'b'));
  await expectRejection(
    scope.reader.read(['a'], [{ projectId: 'a', typed: [link('same', 'c', 'a')] }]),
    /conflicting relationship same/,
  );
});

it('rejects a required project read returning another project identity', async () => {
  const scope = observation();
  scope.reads.projects.findById = () =>
    Promise.resolve({ id: 'foreign', depReach: 'anchor-slice' });
  await expectRejection(scope.reader.read(['a']), /project a.*mismatched/);
});

it('checks lifetime for an empty observation and immediately after every awaited boundary', async () => {
  const empty = observation();
  empty.expire();
  await expectRejection(empty.reader.read([]), /expired/);

  const admitted = observation();
  admitted.authority.requireProject = () => {
    admitted.expire();
    return Promise.resolve();
  };
  await expectRejection(admitted.reader.read(['a']), /expired/);
  expect(admitted.calls).not.toContain('incident:a');

  const incident = observation();
  incident.reads.typedDependencies.listIncident = () => {
    incident.expire();
    return Promise.resolve([]);
  };
  await expectRejection(incident.reader.read(['a']), /expired/);
  expect(incident.calls).not.toContain('project:a');

  const project = observation();
  project.reads.projects.findById = () => {
    project.expire();
    return Promise.resolve({ id: 'a', depReach: 'anchor-slice' });
  };
  await expectRejection(project.reader.read(['a']), /expired/);
  expect(project.calls).not.toContain('rows:a');

  const facts = observation();
  facts.reads.estimates.listByProject = () => {
    facts.expire();
    return Promise.resolve([]);
  };
  await expectRejection(facts.reader.read(['a']), /expired/);
});

it('reobserves staged estimate anchors and project reach between cycle evaluations', async () => {
  const scope = observation();
  const a = { ...state('a', ['A', 'A2']), legacy: [{ predecessorId: 'A', successorId: 'A2' }] };
  scope.facts.set('a', a);
  scope.relationships.push(
    {
      ...link('ab', 'a', 'b'),
      predecessor: { projectId: 'a', scope: 'node', workItemId: 'A2', stepId: 'a-last' },
      successor: { projectId: 'b', scope: 'node', workItemId: 'B', stepId: 'b-first' },
    },
    {
      ...link('ba', 'b', 'a'),
      predecessor: { projectId: 'b', scope: 'node', workItemId: 'B', stepId: 'b-last' },
      successor: { projectId: 'a', scope: 'node', workItemId: 'A', stepId: 'a-last' },
    },
  );
  expect(await scope.reader.findCycle(['a'])).toBeNull();
  scope.facts.set('a', {
    ...a,
    estimates: a.estimates.filter((estimate) => estimate.workItemId !== 'A'),
  });
  expect((await scope.reader.findCycle(['a']))?.kind).toBe('cycle');
  scope.facts.set('a', a);
  expect(await scope.reader.findCycle(['a'])).toBeNull();
  scope.facts.set('a', { ...a, reach: 'whole-item' });
  expect((await scope.reader.findCycle(['a']))?.kind).toBe('cycle');
});
