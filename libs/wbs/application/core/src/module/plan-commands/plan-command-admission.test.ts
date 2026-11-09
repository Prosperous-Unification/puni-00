import { inMemoryTypedDependencies } from '@wbs/store-memory/typed-dependency-fixture';
import { describe, expect, it } from 'bun:test';

import type { AccessDecisions } from '../../ports/access-decisions';
import { CREATOR_ADMISSION, type EditAdmission, NO_ADMISSION } from '../../ports/edit-admission';
import { LEGACY_ACCESS, type ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Project } from '../../ports/project-store';
import type { PlanTransactionalStores } from '../../ports/stores';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { createPlanCommandRunner } from './composition';
import { type PlanCommandServices } from './plan-commands.feature';

const PROJECT = 'project-1';
const ACTOR = 'super-admin';
const PRINCIPAL = { id: ACTOR, username: ACTOR, scopes: ['read', 'write'] as const };
const SCOPED: ResourceAccess = {
  principal: { id: ACTOR },
  kind: 'scoped',
  scope: { cap: null, organizationId: 'org-a', userId: ACTOR, role: 'super_admin' },
};

/** Another creator's restricted project; the fixture grants this actor package.write explicitly. */
const restricted = (id = PROJECT) => ({ id, ownerId: 'creator', restricted: true }) as Project;

const silent: Broadcaster = recordingBroadcaster();

/**
 * A runner over named package/directory grants, recording the admission each
 * graph retains only for its owning unit of work.
 */
function runnerOver(entryToDiscard?: string) {
  const admissions: EditAdmission[] = [];
  // A stand-in for the stores the runner reads itself; the graph is stubbed.
  const accessDecisions: AccessDecisions = {
    effectiveRoleAt: (principal, target) => {
      if (principal.id !== ACTOR) throw new Error('unexpected admission fixture subject');
      if (target.kind === 'organization' && target.organizationId === 'org-a')
        return Promise.resolve({
          permissions: new Set(['organization.manage_directory']),
          via: [],
        });
      if (
        target.kind === 'work_package' &&
        target.chain.organizationId === 'org-a' &&
        target.chain.workPackageId === PROJECT
      )
        return Promise.resolve({
          permissions: new Set(['package.read', 'package.write']),
          via: [],
        });
      throw new Error('unexpected admission fixture scope');
    },
    readablePackageIds: () => Promise.reject(new Error('unexpected fixture grant listing')),
  };
  const stores = {
    accessDecisions,
    typedDependencies: inMemoryTypedDependencies(),
    journal: { discard: () => Promise.resolve() },
    projects: {
      findInOrganization: (id: string, organizationId: string) =>
        Promise.resolve(id === PROJECT && organizationId === 'org-a' ? restricted() : null),
      findCrossReferences: () => Promise.resolve([]),
    },
  } as unknown as PlanTransactionalStores;
  const scope: Scope = { stores };
  const uow: UnitOfWork = {
    async run(act) {
      const decision = await act(scope);
      if (!decision.commit && decision.afterRollback !== undefined) {
        await decision.afterRollback(scope);
      }
      return decision.value;
    },
  };
  const whileBuilt: { granted: boolean; otherActor: boolean; otherProject: boolean }[] = [];
  const graph = (admission: EditAdmission) => {
    admissions.push(admission);
    whileBuilt.push({
      granted: admission.admits(restricted(), ACTOR),
      otherActor: admission.admits(restricted(), 'someone-else'),
      otherProject: admission.admits(restricted('project-2'), ACTOR),
    });
    return {
      workItems: {
        collect: async (fn: () => Promise<unknown>) => ({
          result: await fn(),
          recordings: [],
          dirty: false,
        }),
        recordCollected: () => Promise.resolve(),
        undoState: () => Promise.resolve({ undoable: false, redoable: false }),
        undoWithin: () =>
          Promise.resolve(
            entryToDiscard === undefined
              ? { ok: true, value: { done: 'undo', detail: null } }
              : { ok: false, reason: 'stale', detail: null, entryId: entryToDiscard },
          ),
        discardEntry: () => Promise.resolve(),
      },
    } as unknown as PlanCommandServices;
  };
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    batchServices: (_scope, _broadcast, admission) => graph(admission),
    publicServices: graph(CREATOR_ADMISSION),
    uow,
    announcements: silent,
  });
  admissions.length = 0;
  whileBuilt.length = 0;
  return { runner, admissions, whileBuilt };
}

describe('the admission a batch graph is built with', () => {
  it('admits the granted actor on the granted project only while its unit of work runs', async () => {
    const { runner, admissions, whileBuilt } = runnerOver();

    expect(await runner.runWithin(PROJECT, PRINCIPAL, [], SCOPED)).toMatchObject({ ok: true });

    expect(whileBuilt).toEqual([{ granted: true, otherActor: false, otherProject: false }]);
    // Proof: skipping `expire` in `execute` made this receive true (0 pass,
    // 1 fail, run alone with `-t`); watched 2026-09-28.
    expect(admissions[0]?.admits(restricted(), ACTOR)).toBe(false);
  });

  it('never falls back to the creator rule under scoped access', async () => {
    const { runner, admissions } = runnerOver();

    await runner.runDirectoryWithin(PRINCIPAL, [], SCOPED);
    await runner.run(PROJECT, ACTOR, []);

    expect(admissions).toEqual([NO_ADMISSION, CREATOR_ADMISSION]);
  });

  it('grants a journal walk until it settles, and its repair nothing', async () => {
    const { runner, admissions, whileBuilt } = runnerOver('entry-1');

    await runner.undoWithin(PROJECT, PRINCIPAL, SCOPED);

    expect(admissions).toHaveLength(1);
    expect(whileBuilt[0]?.granted).toBe(true);
    // Proof: skipping `expire` in `walk` made this receive true; watched 2026-09-28.
    expect(admissions[0]?.admits(restricted(), ACTOR)).toBe(false);
  });

  it('builds a legacy journal walk with the creator rule', async () => {
    const { runner, admissions } = runnerOver();

    await runner.undoWithin(PROJECT, PRINCIPAL, LEGACY_ACCESS);

    expect(admissions).toEqual([CREATOR_ADMISSION]);
  });
});

it('refuses a direct runner principal without write scope before opening a graph', async () => {
  const { runner, admissions } = runnerOver();
  const principal = { id: ACTOR, username: ACTOR, scopes: ['read'] as const };
  expect(await runner.runWithin(PROJECT, principal, [], SCOPED)).toEqual({
    ok: false,
    error: 'insufficient_scope',
  });
  expect(admissions).toEqual([]);
});
