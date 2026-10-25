import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PlanCommand, Scope } from '@wbs/core';
import { clockOf, CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { sql } from 'drizzle-orm';

import { runMigrations } from '../migrate';
import { openSqliteSource } from '../source';

/**
 * `wbs-shared-occupancy` task 3.5: a claim batch's p99 latency with a
 * directory capacity stated against the same batch without one, on a fixture
 * of 50 projects of one organization holding 20 standing claims each of the
 * resource, 200 runs each, alternated so drift lands on both sides. Prints one
 * JSON line; the bounds (at most 5 ms and 25 % added at p99) are judged in
 * verify.md, not here: a measurement on a shared laptop is not a gate.
 *
 * Run: `bun libs/wbs/adapters/store-sqlite/src/testing/measure-shared-occupancy.ts`.
 */
const MIGRATIONS = new URL('../../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const F = 'account-f';
const ORG = 'org-measure';
const RAM = 'resource-host-ram';
const PROJECTS = 50;
const STANDING = 20;
const RUNS = 200;

async function measure(): Promise<void> {
  const folder = mkdtempSync(join(tmpdir(), 'measure-shared-occupancy-'));
  const dbPath = join(folder, 'plan.db');
  runMigrations(dbPath, MIGRATIONS);
  const source = openSqliteSource({ dbPath });
  try {
    let minted = 0;
    const clock = clockOf({
      now: () => 1_000,
      newId: () => {
        minted += 1;
        return `id-${String(minted).padStart(8, '0')}`;
      },
    });
    const options = {
      admission: CREATOR_ADMISSION,
      clock,
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
    };
    const graph = servicesOver(source.stores, options);
    const runner = createPlanCommandRunner({
      uow: source.uow,
      announcements: options.broadcast,
      publicServices: graph,
      batchServices: (scope: Scope, announcements) =>
        servicesOver(scope.stores, { ...options, broadcast: announcements }),
    });
    await source.stores.users.create(
      { id: F, username: F, passwordHash: 'x', createdAt: 1 },
      { at: 1, by: F },
    );
    await source.stores.directory.addPerson({ id: 'agent', name: 'agent', kind: 'agent' }, [], {
      at: 1,
      by: F,
    });
    const bound = await source.stores.directory.patchPerson(
      'agent',
      { accountId: F },
      { at: 1, by: F },
    );
    if (!bound.ok) throw new Error('the agent was refused');
    const added = await source.stores.directory.addResource(
      { id: RAM, name: 'host ram', kind: 'divisible', unitLabel: 'GB' },
      { at: 1, by: F },
    );
    if (!added.ok) throw new Error('the resource was refused');
    source.db.run(sql`INSERT INTO organization (id, name, created_at) VALUES (${ORG}, ${ORG}, 1)`);
    source.db.run(
      sql`INSERT INTO resource_organization (resource_id, organization_id, name) VALUES (${RAM}, ${ORG}, 'host ram')`,
    );
    const leavesOf = async (projectId: string, count: number): Promise<string[]> => {
      const created = await runner.run(
        projectId,
        F,
        Array.from({ length: count }, (_, index): PlanCommand => ({
          kind: 'createWorkItem',
          ref: `L${String(index)}`,
          name: `Leaf ${String(index)}`,
          parentId: null,
          afterId: null,
        })).flatMap((create, index): PlanCommand[] => [
          create,
          { kind: 'setDemand', workItemRef: `L${String(index)}`, resourceId: RAM, units: 1 },
        ]),
      );
      if (!created.ok) throw new Error(`the leaves were refused: ${JSON.stringify(created)}`);
      // A create mints an id (`MintedBase`); a demand mints none.
      return created.results.flatMap((applied) =>
        applied.kind === 'createWorkItem' ? [applied.id] : [],
      );
    };
    const projects: string[] = [];
    for (let index = 0; index < PROJECTS; index += 1) {
      const { project } = await graph.projects.create(`P${String(index)}`, F);
      projects.push(project.id);
      source.db.run(
        sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${project.id}, ${ORG})`,
      );
      for (const workItemId of await leavesOf(project.id, STANDING)) {
        const claimed = await runner.run(project.id, F, [
          { kind: 'claimWorkItem', workItemId, personId: 'agent' },
        ]);
        if (!claimed.ok)
          throw new Error(`a standing claim was refused: ${JSON.stringify(claimed)}`);
      }
    }
    const target = projects.at(0);
    if (target === undefined) throw new Error('no project to measure in');
    // A batch takes at most 200 commands: two per leaf, so 50 leaves a batch.
    const fresh: string[] = [];
    while (fresh.length < RUNS * 2) fresh.push(...(await leavesOf(target, 50)));
    const state = async (units: number | null) => {
      const written = await source.stores.directory.setDirectoryCapacity(RAM, units, {
        stamp: { at: 1, by: F },
        actor: F,
        auditId: clock.newId(),
      });
      if (!written.ok) throw new Error(`the directory capacity was refused: ${written.reason}`);
    };
    const timings: { stated: number[]; unstated: number[] } = { stated: [], unstated: [] };
    for (const [index, workItemId] of fresh.entries()) {
      const stated = index % 2 === 0;
      await state(stated ? 1_000_000 : null);
      const started = performance.now();
      const claimed = await runner.run(target, F, [
        { kind: 'claimWorkItem', workItemId, personId: 'agent' },
      ]);
      const elapsed = performance.now() - started;
      if (!claimed.ok) throw new Error(`a measured claim was refused: ${JSON.stringify(claimed)}`);
      (stated ? timings.stated : timings.unstated).push(elapsed);
    }
    const p = (values: number[], quantile: number) => {
      const sorted = [...values].sort((left, right) => left - right);
      const value = sorted.at(Math.min(sorted.length - 1, Math.ceil(quantile * sorted.length) - 1));
      if (value === undefined) throw new Error('no timings to summarise');
      return Math.round(value * 1000) / 1000;
    };
    const stated99 = p(timings.stated, 0.99);
    const unstated99 = p(timings.unstated, 0.99);
    console.log(
      JSON.stringify({
        projects: PROJECTS,
        standingClaimsPerProject: STANDING,
        runsEach: RUNS,
        statedMs: { p50: p(timings.stated, 0.5), p99: stated99 },
        unstatedMs: { p50: p(timings.unstated, 0.5), p99: unstated99 },
        addedP99Ms: Math.round((stated99 - unstated99) * 1000) / 1000,
        addedP99Percent: Math.round(((stated99 - unstated99) / unstated99) * 10_000) / 100,
      }),
    );
  } finally {
    await source.close();
    rmSync(folder, { recursive: true, force: true });
  }
}

await measure();
