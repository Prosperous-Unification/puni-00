import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The cost of a plan read under shared people (tasks.md 8.0, the design
 * memo's budget): 30 projects of one organization, all ten of its people
 * working one day in each. Ranked by creation, project k books everyone on
 * day k - 1, so the lowest project's read schedules 29 influencers in turn
 * before its own plan.
 *
 * The assertions are the work, not the clock: every one of the lowest
 * project's ten slices starts on day 29 and names 290 holders, which only a
 * chain that scheduled all 29 influencers around each other can answer. The
 * wall clock is printed for the record (`verify.md`), never asserted: a speed
 * assertion fails healthy runs on a loaded host (`docs/test-budgets.md`).
 */
const PROJECTS = 30;
const PEOPLE = 10;
const START = '2026-10-05';

let h: OrganizationHarness;
const projects: string[] = [];

async function planEveryone(projectId: string): Promise<void> {
  await h.call('ada', 'PATCH', `/api/projects/${projectId}`, { startDate: START });
  const read = await h.call('ada', 'GET', `/api/projects/${projectId}`);
  const stepId = (read.body as { steps: { id: string }[] }).steps.at(0)?.id;
  if (stepId === undefined) throw new Error('the project started with no step');
  const commands = Array.from({ length: PEOPLE }, (_, person) => [
    { kind: 'createWorkItem', ref: `w${String(person)}`, parentId: null, afterId: null, name: 'W' },
    {
      kind: 'setEstimate',
      workItemRef: `w${String(person)}`,
      stepId,
      days: { optimistic: 1, realistic: 1, pessimistic: 1 },
    },
    {
      kind: 'setAssignee',
      workItemRef: `w${String(person)}`,
      stepId,
      personId: `pe-${String(person)}`,
    },
  ]).flat();
  const applied = await h.call('ada', 'POST', `/api/projects/${projectId}/commands`, { commands });
  if (applied.status !== 200) throw new Error(`plan refused: ${JSON.stringify(applied)}`);
}

// 20 s: the smallest step at least 3 times the setup's 1.8 s idle run
// (`docs/test-budgets.md`); no loaded run was made.
beforeAll(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'admin');
  h.bind('ada', 'org-a');
  h.activate();
  for (let person = 0; person < PEOPLE; person++) {
    const id = `pe-${String(person)}`;
    h.sqlite.run(`INSERT INTO person (id, name) VALUES ('${id}', 'root-${id}')`);
    h.sqlite.run(
      `INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('${id}', 'org-a', '${id}')`,
    );
  }
  // Planned while isolated, so the setup schedules no chain.
  for (let index = 0; index < PROJECTS; index++) {
    const answer = await h.call('ada', 'POST', '/api/projects', { name: `P${String(index)}` });
    const id = (answer.body as { project: { id: string } }).project.id;
    projects.push(id);
    await planEveryone(id);
  }
  h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
}, 20_000);

afterAll(() => {
  h.close();
});

describe('the cost of a shared read', () => {
  it('schedules the lowest of 30 projects around the 29 above it', async () => {
    const lowest = projects.at(-1);
    if (lowest === undefined) throw new Error('no project was created');
    const timed = async () => {
      const began = performance.now();
      const answer = await h.call('ada', 'GET', `/api/projects/${lowest}/work-items`);
      return { answer, ms: performance.now() - began };
    };

    const cold = await timed();
    const again = await timed();
    console.log(
      `shared read, ${String(PROJECTS)} projects x ${String(PEOPLE)} people: cold ${cold.ms.toFixed(0)} ms, again ${again.ms.toFixed(0)} ms`,
    );

    for (const { answer } of [cold, again]) {
      expect(answer.status).toBe(200);
      const body = answer.body as {
        slices: { personId: string | null; earliestStart: number; earliestFinish: number }[];
        waitingElsewhere: number;
        elsewhereHolders: unknown[];
      };
      const held = body.slices.filter(
        (slice) => slice.personId !== null && slice.earliestFinish > slice.earliestStart,
      );
      expect(held.map((slice) => slice.earliestStart)).toEqual(
        Array.from({ length: PEOPLE }, () => PROJECTS - 1),
      );
      expect(body.waitingElsewhere).toBe(PEOPLE);
      expect(body.elsewhereHolders).toHaveLength((PROJECTS - 1) * PEOPLE);
    }
  });
});
