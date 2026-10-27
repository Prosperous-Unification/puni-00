import { CLAIM_LEASE_MS } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { type Answer, OrganizationHarness } from '../testing/organization-harness';

const T = 1_900_000_000_000;
let h: OrganizationHarness;
let projectId: string;
let stepId: string;
let leaf: string;
let codexKey: string;

/**
 * A `claimWorkItem` or `releaseWorkItem` naming no person (`wbs-claim-own-person`)
 * over be-01's production composition and real SQLite: an API key acts as its
 * own agent person, exactly as if it named it, and a session, which acts as its
 * account, is refused `person_required`.
 */
beforeEach(async () => {
  h = OrganizationHarness.openComposedWith({ now: () => T });
  await h.register('dany');
  h.organization('org-a');
  h.member('org-a', 'dany', 'super_admin');
  h.bind('dany', 'org-a');
  h.activate();
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Plan of A' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  const plan = created.body as { project: { id: string }; steps: { id: string }[] };
  projectId = plan.project.id;
  const firstStep = plan.steps.at(0);
  if (firstStep === undefined) throw new Error('project omitted its first workflow step');
  stepId = firstStep.id;
  const rows = await h.call('dany', 'POST', `/api/projects/${projectId}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Leaf' }],
  });
  if (rows.status !== 200) throw new Error(`leaf refused: ${JSON.stringify(rows)}`);
  leaf = (rows.body as { results: { id: string }[] }).results[0]?.id ?? '';
  for (const person of ['codex', 'claude'])
    addAgentPerson(h.sqlite, person, 'org-a', h.userId('dany'));
  codexKey = (
    await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'codex',
      issuedBy: h.userId('dany'),
    })
  ).key;
});

afterEach(async () => {
  await h.closeComposed();
});

function asCodex(commands: unknown[]): Promise<Answer> {
  return h.callWith(codexKey, 'POST', `/api/projects/${projectId}/commands`, { commands });
}

function asDany(commands: unknown[]): Promise<Answer> {
  return h.call('dany', 'POST', `/api/projects/${projectId}/commands`, { commands });
}

const claim = (): Record<string, unknown> => ({
  kind: 'claimWorkItem',
  workItemId: leaf,
  runId: 'run-1',
  steps: [stepId],
});

/** Every claim row as (person, run, lease expiry), in id order. */
function claimRows(): { person: string; run: string | null; lease: number | null }[] {
  return h.sqlite
    .query<{ person: string; run: string | null; lease: number | null }, []>(
      'SELECT person_id AS person, run_id AS run, lease_expires_at AS lease FROM claim ORDER BY id',
    )
    .all();
}

/** The journal's (kind, acting person) entries for the project, oldest first. */
function journal(): { kind: string; person: string | null }[] {
  return h.sqlite
    .query<{ kind: string; person: string | null }, [string]>(
      'SELECT kind, person_id AS person FROM command_journal WHERE project_id = ? ORDER BY seq',
    )
    .all(projectId)
    .filter(({ kind }) => kind !== 'create');
}

describe('a claim or release naming no person', () => {
  // Proof: with `CommandContext.claimant`'s acting-person default removed, or
  // `applyAll` handed null for the acting person, this case and the next answered
  // 400 person_required instead of 200 (2 pass, 2 fail); watched 2026-10-26.
  it("claims and releases as an API key's own agent person, lease and journal included", async () => {
    const claimed = await asCodex([claim()]);
    expect(claimed).toMatchObject({ status: 200 });
    const rows = claimRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toEqual(
      rows.map(() => ({ person: 'codex', run: 'run-1', lease: T + CLAIM_LEASE_MS })),
    );
    expect(journal()).toEqual([{ kind: 'claim', person: 'codex' }]);

    const released = await asCodex([{ kind: 'releaseWorkItem', workItemId: leaf }]);
    expect(released).toMatchObject({ status: 200 });
    expect(claimRows()).toEqual([]);
    expect(journal()).toEqual([
      { kind: 'claim', person: 'codex' },
      { kind: 'release', person: 'codex' },
    ]);

    expect(await h.callWith(codexKey, 'POST', `/api/projects/${projectId}/undo`)).toMatchObject({
      status: 200,
    });
    expect(claimRows().map(({ person }) => person)).toEqual(rows.map(() => 'codex'));
  });

  it('answers exactly as naming the agent person explicitly', async () => {
    const implicit = await asCodex([claim()]);
    const implicitRows = claimRows();
    expect((await asCodex([{ kind: 'releaseWorkItem', workItemId: leaf }])).status).toBe(200);
    const explicit = await asCodex([{ ...claim(), personId: 'codex' }]);
    // Claim ids are minted afresh; everything else in the answer is compared whole:
    // alreadyHeld, assignedStepIds, acquired, undoable and redoable.
    const comparable = ({ status, body }: Answer) => {
      const { results, ...rest } = body as { results: { claimIds: string[] }[] };
      return {
        status,
        ...rest,
        results: results.map(({ claimIds, ...each }) => ({ ...each, claims: claimIds.length })),
      };
    };
    expect(comparable(explicit)).toEqual(comparable(implicit));
    expect(claimRows()).toEqual(implicitRows.map((row) => ({ ...row })));
  });

  // Proof: with `CommandContext.claimant` falling back to the account id for a
  // session too, this case answered 404 unknown_person instead of 400
  // person_required; with `person_required` dropped from the batch 400 arm of
  // work-item-shapes.ts it answered 500 (3 pass, 1 fail each); watched 2026-10-26.
  it('refuses a session person_required for a claim and for a release', async () => {
    expect(await asDany([claim()])).toEqual({
      status: 400,
      body: { error: 'person_required', at: 0, kind: 'claimWorkItem' },
    });
    expect(await asDany([{ kind: 'releaseWorkItem', workItemId: leaf }])).toEqual({
      status: 400,
      body: { error: 'person_required', at: 0, kind: 'releaseWorkItem' },
    });
    expect(claimRows()).toEqual([]);
    expect(journal()).toEqual([]);
  });

  it('still refuses an API key naming another agent person credential_not_for_person', async () => {
    expect(await asCodex([{ ...claim(), personId: 'claude' }])).toEqual({
      status: 403,
      body: { error: 'credential_not_for_person', at: 0, kind: 'claimWorkItem' },
    });
    expect(claimRows()).toEqual([]);
  });
});
