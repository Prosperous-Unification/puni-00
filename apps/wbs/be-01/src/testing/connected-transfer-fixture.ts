import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';

import type { OrganizationHarness } from './organization-harness';

interface TransferProject {
  projectId: string;
  parentId: string;
  leafId: string;
  tailId: string;
  stepIds: string[];
}

/** Mounted authored projects and synthetic persistence only; never activates runtime authoring. */
export async function connectedTransferFixture(harness: OrganizationHarness) {
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  harness.bind('ada', 'org-a');
  harness.activate();
  seedDependencyAuthority(harness.databasePath());
  const create = async (name: string): Promise<TransferProject> => {
    const created = await harness.call('ada', 'POST', '/api/projects', { name });
    if (created.status !== 200)
      throw new Error(`fixture project refused: ${String(created.status)}`);
    const project = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM project WHERE name=?')
      .get(name);
    if (project === null) throw new Error('fixture project missing');
    const add = async (rowName: string, parentId: string | null) => {
      const added = await harness.call('ada', 'POST', `/api/projects/${project.id}/commands`, {
        commands: [{ kind: 'createWorkItem', name: rowName, parentId }],
      });
      if (added.status !== 200)
        throw new Error(`fixture row refused: ${JSON.stringify(added.body)}`);
      const row = harness.sqlite
        .query<{ id: string }, [string, string]>(
          'SELECT id FROM work_item WHERE project_id=? AND name=?',
        )
        .get(project.id, rowName);
      if (row === null) throw new Error('fixture row missing');
      return row.id;
    };
    const parentId = await add(`${name} parent`, null);
    const leafId = await add(`${name} leaf`, parentId);
    const tailId = await add(`${name} tail`, null);
    const steps = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id=? ORDER BY position')
      .all(project.id);
    if (steps.length < 2) throw new Error('fixture needs distinct steps');
    harness.sqlite
      .query(
        "UPDATE project SET start_date='2026-10-19',estimate_method='realistic',estimate_rounding='exact' WHERE id=?",
      )
      .run(project.id);
    harness.sqlite
      .query(
        "UPDATE work_item SET readiness='ready' WHERE project_id=? AND id NOT IN (SELECT parent_id FROM work_item WHERE parent_id IS NOT NULL)",
      )
      .run(project.id);
    for (const rowId of [leafId, tailId])
      for (const step of steps)
        harness.sqlite
          .query(
            'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,1,1,1)',
          )
          .run(rowId, step.id);
    return {
      projectId: project.id,
      parentId,
      leafId,
      tailId,
      stepIds: steps.map((step) => step.id),
    };
  };
  const remote = await create('Remote');
  const source = await create('Source');
  const downstream = await create('Downstream');
  const unrelated = await create('Unrelated');
  const external = (
    id: string,
    from: TransferProject,
    to: TransferProject,
    scope: 'whole' | 'node' | 'descendant-step',
    type: 'FS' | 'SS' | 'FF',
    stepIndex = 0,
  ) => {
    const stepId = from.stepIds.at(stepIndex);
    if (stepId === undefined) throw new Error('fixture step missing');
    const successorScope =
      id === 'incoming-descendant'
        ? 'descendant-step'
        : id === 'incoming-finish'
          ? 'node'
          : 'whole';
    const successorId =
      id === 'incoming-descendant' || id === 'incoming-whole' ? to.parentId : to.leafId;
    harness.sqlite
      .query(
        "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,successor_step_id,type) VALUES (?,'org-a',?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        from.projectId,
        to.projectId,
        scope === 'descendant-step' ? from.parentId : from.leafId,
        successorId,
        scope,
        successorScope,
        scope === 'whole' ? null : stepId,
        successorScope === 'whole' ? null : (to.stepIds[0] ?? null),
        type,
      );
  };
  external('incoming-whole', remote, source, 'whole', 'FS');
  external('incoming-node-a', remote, source, 'node', 'FS');
  external('incoming-node-b', remote, source, 'node', 'FS', 1);
  external('incoming-descendant', remote, source, 'descendant-step', 'SS');
  external('incoming-finish', remote, source, 'node', 'FF');
  external('outgoing', source, downstream, 'whole', 'FS');
  external('component-other', downstream, unrelated, 'whole', 'FS');
  const stepId = source.stepIds.at(0);
  if (stepId === undefined) throw new Error('fixture local step missing');
  harness.sqlite
    .query(
      "INSERT INTO typed_dependency(id,project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,type) VALUES ('internal-node',?,?,?,'node','whole',?,'SS')",
    )
    .run(source.projectId, source.leafId, source.tailId, stepId);
  harness.sqlite
    .query('INSERT INTO dependency(project_id,predecessor_id,successor_id) VALUES (?,?,?)')
    .run(source.projectId, source.leafId, source.tailId);
  const remoteStep = remote.stepIds.at(0);
  if (remoteStep === undefined) throw new Error('fixture remote step missing');
  harness.sqlite
    .query(
      "INSERT INTO typed_dependency(id,project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,type) VALUES ('remote-internal',?,?,?,'node','whole',?,'SS')",
    )
    .run(remote.projectId, remote.leafId, remote.tailId, remoteStep);
  harness.sqlite
    .query('INSERT INTO dependency(project_id,predecessor_id,successor_id) VALUES (?,?,?)')
    .run(remote.projectId, remote.leafId, remote.tailId);
  await harness.register('bea');
  harness.sqlite
    .query('UPDATE project SET restricted=1,owner_id=? WHERE id=?')
    .run(harness.userId('bea'), remote.projectId);
  return { remote, source, downstream, unrelated };
}

/** Canonical snapshots include WITHOUT ROWID tables and ignore physical retrieval order. */
export function transferSnapshot(harness: OrganizationHarness) {
  return harness.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => ({
      name,
      rows: harness.sqlite
        .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    }));
}
