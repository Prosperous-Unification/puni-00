import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';

import type { OrganizationHarness } from './organization-harness';

interface TransferWorkPackage {
  workPackageId: string;
  parentId: string;
  leafId: string;
  tailId: string;
  stepIds: string[];
}

/** Mounted authored work packages and synthetic persistence only; never activates runtime authoring. */
export async function connectedTransferFixture(harness: OrganizationHarness) {
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member', ['project-contributor']);
  harness.grantPermissions('org-a', 'ada', [
    'organization.create_project',
    'organization.manage_directory',
  ]);
  harness.bind('ada', 'org-a');
  harness.activate();
  seedDependencyAuthority(harness.databasePath());
  const parent = await harness.call('ada', 'POST', '/api/projects', { name: 'Transfer parent' });
  if (parent.status !== 201) throw new Error('transfer parent creation refused');
  const projectId = (parent.body as { project: { id: string } }).project.id;
  if (typeof projectId !== 'string' || projectId === '')
    throw new Error('transfer parent identity absent');
  const create = async (name: string): Promise<TransferWorkPackage> => {
    const created = await harness.call('ada', 'POST', '/api/work-packages', { name, projectId });
    if (created.status !== 200)
      throw new Error(`fixture work package refused: ${String(created.status)}`);
    const workPackage = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_package WHERE name=?')
      .get(name);
    if (workPackage === null) throw new Error('fixture work package missing');
    const add = async (rowName: string, parentId: string | null) => {
      const added = await harness.call(
        'ada',
        'POST',
        `/api/work-packages/${workPackage.id}/commands`,
        {
          commands: [{ kind: 'createWorkItem', name: rowName, parentId }],
        },
      );
      if (added.status !== 200)
        throw new Error(`fixture row refused: ${JSON.stringify(added.body)}`);
      const row = harness.sqlite
        .query<{ id: string }, [string, string]>(
          'SELECT id FROM work_item WHERE work_package_id=? AND name=?',
        )
        .get(workPackage.id, rowName);
      if (row === null) throw new Error('fixture row missing');
      return row.id;
    };
    const parentId = await add(`${name} parent`, null);
    const leafId = await add(`${name} leaf`, parentId);
    const tailId = await add(`${name} tail`, null);
    const steps = harness.sqlite
      .query<{ id: string }, [string]>(
        'SELECT id FROM step WHERE work_package_id=? ORDER BY position',
      )
      .all(workPackage.id);
    if (steps.length < 2) throw new Error('fixture needs distinct steps');
    harness.sqlite
      .query(
        "UPDATE work_package SET start_date='2026-10-19',estimate_method='realistic',estimate_rounding='exact' WHERE id=?",
      )
      .run(workPackage.id);
    harness.sqlite
      .query(
        "UPDATE work_item SET readiness='ready' WHERE work_package_id=? AND id NOT IN (SELECT parent_id FROM work_item WHERE parent_id IS NOT NULL)",
      )
      .run(workPackage.id);
    for (const rowId of [leafId, tailId])
      for (const step of steps)
        harness.sqlite
          .query(
            'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,1,1,1)',
          )
          .run(rowId, step.id);
    return {
      workPackageId: workPackage.id,
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
    from: TransferWorkPackage,
    to: TransferWorkPackage,
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
        "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,successor_step_id,type) VALUES (?,'org-a',?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        from.workPackageId,
        to.workPackageId,
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
      "INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,type) VALUES ('internal-node',?,?,?,'node','whole',?,'SS')",
    )
    .run(source.workPackageId, source.leafId, source.tailId, stepId);
  harness.sqlite
    .query('INSERT INTO dependency(work_package_id,predecessor_id,successor_id) VALUES (?,?,?)')
    .run(source.workPackageId, source.leafId, source.tailId);
  const remoteStep = remote.stepIds.at(0);
  if (remoteStep === undefined) throw new Error('fixture remote step missing');
  harness.sqlite
    .query(
      "INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,type) VALUES ('remote-internal',?,?,?,'node','whole',?,'SS')",
    )
    .run(remote.workPackageId, remote.leafId, remote.tailId, remoteStep);
  harness.sqlite
    .query('INSERT INTO dependency(work_package_id,predecessor_id,successor_id) VALUES (?,?,?)')
    .run(remote.workPackageId, remote.leafId, remote.tailId);
  await harness.register('bea');
  harness.sqlite
    .query('UPDATE work_package SET restricted=1,created_by=? WHERE id=?')
    .run(harness.userId('bea'), remote.workPackageId);
  harness.grant('org-a', 'ada', 'package-contributor', 'work_package', remote.workPackageId);
  return { projectId, remote, source, downstream, unrelated };
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
