import { expect, test } from 'bun:test';

import type { Step } from '../ports/step-store';
import type { WorkPackage } from '../ports/work-package-store';
import { workItemRow } from '../testing/work-item-fixture';
import { createEndpointEvidence, type EndpointEvidenceReads } from './dependency-endpoint-evidence';

function observation() {
  let active = true;
  const calls: string[] = [];
  const rows = [
    workItemRow({ id: 'a', workPackageId: 'owner', name: 'Owner' }),
    workItemRow({ id: 'b', workPackageId: 'remote', name: 'Restricted predecessor', revision: 4 }),
  ];
  const step: Step = {
    id: 'design',
    workPackageId: 'remote',
    name: 'Design',
    code: 'design',
    position: 100,
    allowancePercent: 0,
    estimateUnit: 'workdays',
  };
  const reads: EndpointEvidenceReads = {
    workPackages: {
      findInOrganization: (id, organizationId) => {
        calls.push(`admit:${id}:${organizationId}`);
        return Promise.resolve(
          ['owner', 'remote'].includes(id)
            ? ({ id, abbreviation: id.toUpperCase() } as WorkPackage)
            : null,
        );
      },
      findById: () => {
        return Promise.reject(new Error('scoped evidence used unscoped lookup'));
      },
      stepsOf: (id) => {
        calls.push(`steps:${id}`);
        return Promise.resolve(id === 'remote' ? [step] : []);
      },
    },
    workItems: {
      findById: (id) => {
        calls.push(`row:${id}`);
        return Promise.resolve(rows.find((row) => row.id === id) ?? null);
      },
      listByWorkPackage: (id) => {
        calls.push(`tree:${id}`);
        return Promise.resolve(rows.filter((row) => row.workPackageId === id));
      },
    },
  };
  const authority = {
    kind: 'scoped' as const,
    workPackageId: 'owner',
    actorId: 'actor',
    access: {
      principal: { id: 'actor' },
      kind: 'scoped' as const,
      scope: { cap: null, organizationId: 'org', userId: 'actor', role: 'member' as const },
    },
    assertActive: () => {
      if (!active) throw new Error('closed evidence');
    },
  };
  return {
    calls,
    rows,
    reads,
    authority,
    close: () => {
      active = false;
    },
    evidence: createEndpointEvidence(reads, authority),
  };
}

test('reads detached scoped endpoint labels and revisions after organization ownership', async () => {
  const scope = observation();
  const endpoint = {
    workPackageId: 'remote',
    scope: 'node' as const,
    workItemId: 'b',
    stepId: 'design',
  };
  expect(await scope.evidence.readEndpoint(endpoint)).toEqual({
    ok: true,
    evidence: {
      endpoint,
      isLeaf: true,
      revision: 4,
      name: 'Restricted predecessor',
      workPackageAbbreviation: 'REMOTE',
      workItemNumber: '010',
      step: { id: 'design', name: 'Design', code: 'design', position: 100 },
    },
  });
  expect(scope.calls[0]).toBe('admit:remote:org');
  expect(
    await scope.evidence.readRevisions([
      { workPackageId: 'remote', workItemId: 'b' },
      { workPackageId: 'remote', workItemId: 'b' },
    ]),
  ).toEqual({ ok: true, revisions: [{ workPackageId: 'remote', workItemId: 'b', revision: 4 }] });
});

test('conceals absent work packages and rows belonging to another work package', async () => {
  const scope = observation();
  expect(
    await scope.evidence.readEndpoint({
      workPackageId: 'foreign',
      scope: 'whole',
      workItemId: 'b',
    }),
  ).toEqual({ ok: false, reason: 'not_found' });
  expect(scope.calls).toEqual(['admit:foreign:org']);
  expect(
    await scope.evidence.readEndpoint({ workPackageId: 'owner', scope: 'whole', workItemId: 'b' }),
  ).toEqual({ ok: false, reason: 'not_found' });
  expect(
    await scope.evidence.readRevisions([{ workPackageId: 'remote', workItemId: 'missing' }]),
  ).toEqual({ ok: false, reason: 'not_found' });
});

test('conceals missing external steps while preserving local unknown_step', async () => {
  const scope = observation();
  expect(
    await scope.evidence.readEndpoint({
      workPackageId: 'remote',
      scope: 'node',
      workItemId: 'b',
      stepId: 'missing',
    }),
  ).toEqual({ ok: false, reason: 'not_found' });
  expect(
    await scope.evidence.readEndpoint({
      workPackageId: 'owner',
      scope: 'node',
      workItemId: 'a',
      stepId: 'missing',
    }),
  ).toEqual({ ok: false, reason: 'unknown_step' });
});

test('refuses evidence after closure and across an awaited read', async () => {
  const scope = observation();
  const original = scope.reads.workItems.findById;
  scope.reads.workItems.findById = async (id) => {
    const row = await original(id);
    scope.close();
    return row;
  };
  const endpoint = await scope.evidence
    .readEndpoint({ workPackageId: 'remote', scope: 'whole', workItemId: 'b' })
    .then(
      () => null,
      (cause: unknown) => cause,
    );
  expect(endpoint).toBeInstanceOf(Error);
  expect(endpoint instanceof Error ? endpoint.message : endpoint).toContain('closed evidence');
  const revisions = await scope.evidence.readRevisions([]).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(revisions).toBeInstanceOf(Error);
  expect(revisions instanceof Error ? revisions.message : revisions).toContain('closed evidence');
});

for (const fault of ['step-identity', 'step-work-package'] as const)
  test(`refuses remote ${fault} misdelivery after genuine scoped row and tree reads`, async () => {
    const scope = observation();
    const readSteps = scope.reads.workPackages.stepsOf;
    scope.reads.workPackages.stepsOf = async (workPackageId) =>
      (await readSteps(workPackageId)).map((step) =>
        fault === 'step-identity'
          ? { ...step, id: 'other-design' }
          : { ...step, workPackageId: 'owner' },
      );
    expect(
      await scope.evidence.readEndpoint({
        workPackageId: 'remote',
        scope: 'node',
        workItemId: 'b',
        stepId: 'design',
      }),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(scope.calls).toEqual(['admit:remote:org', 'row:b', 'tree:remote', 'steps:remote']);
  });
