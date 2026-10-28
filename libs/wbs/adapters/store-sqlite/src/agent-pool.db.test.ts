import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type AgentPoolDraft, type AuditedAct, digestMachineSecret } from '@wbs/core';
import type { OrganizationLimitValues } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { AgentPoolRepository } from './agent-pool';
import { openDatabase, openDrizzle } from './db';
import { WriteCoordinator } from './gate';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const CAP = 8;
const DEFAULTS: OrganizationLimitValues = {
  maxAgentPersons: CAP,
  maxConcurrentClaims: 200,
  maxCapacityUnitsPerResource: 10_000,
};

let dir: string;
let path: string;

/** A migrated, activated store with one organization whose admin is `dany`. */
function freshStore(): void {
  rmSync(path, { force: true });
  runMigrations(path, FOLDER);
  const sqlite = openDatabase(path);
  try {
    sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
    sqlite.run("INSERT INTO users (id, username, created_at) VALUES ('dany', 'dany', 1)");
    sqlite.run(
      "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'dany', 'admin', 1)",
    );
    sqlite.run(
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    );
  } finally {
    sqlite.close();
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-agent-pool-'));
  path = join(dir, 'test.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** The pools over a fresh connection and one process-wide write turn, as be-01 composes them. */
function openPools(): AgentPoolRepository {
  return new AgentPoolRepository(openDrizzle(path), new WriteCoordinator(), DEFAULTS);
}

let pools = 0;

/** A pool of `size` agents, every id fresh, every digest a real one. */
async function draftOf(size: number): Promise<AgentPoolDraft> {
  pools += 1;
  const name = `pool-${String(pools)}`;
  const digest = await digestMachineSecret(`secret-${name}`);
  return {
    id: crypto.randomUUID(),
    name,
    expiresAt: null,
    agents: Array.from({ length: size }, () => ({
      personId: crypto.randomUUID(),
      credentialId: crypto.randomUUID(),
      secretId: crypto.randomUUID(),
      digest,
    })),
  };
}

const act = (): AuditedAct => ({
  stamp: { at: 1_900_000_000_000, by: 'dany' },
  actor: 'dany',
  auditId: crypto.randomUUID(),
});

function agentPersons(): number {
  const sqlite = openDatabase(path);
  try {
    return (
      sqlite
        .query<{ n: number }, []>(
          "SELECT COUNT(*) AS n FROM person p JOIN person_organization o ON o.resource_id = p.id WHERE o.organization_id = 'org-a' AND p.kind = 'agent'",
        )
        .get()?.n ?? -1
    );
  } finally {
    sqlite.close();
  }
}

/** The organization's agent persons, as the model counts them. */
interface CapModel {
  agents: number;
}

/** What the model expects a pool of `size` to answer, applying it. */
function expectCreation(model: CapModel, size: number): 'created' | 'agent_person_limit' {
  if (model.agents + size > CAP) return 'agent_person_limit';
  model.agents += size;
  return 'created';
}

class CreateOne implements fc.AsyncCommand<CapModel, AgentPoolRepository> {
  constructor(readonly size: number) {}
  check = () => true;
  async run(model: CapModel, real: AgentPoolRepository): Promise<void> {
    const answer = await real.create('org-a', 'dany', await draftOf(this.size), act());
    expect(answer.kind).toBe(expectCreation(model, this.size));
    expect(agentPersons()).toBe(model.agents);
  }
  toString = () => `CreateOne(${String(this.size)})`;
}

/**
 * Two creations started together: the turn serves them in arrival order, so
 * the second must see the first's persons when it judges the cap.
 */
class CreateRacing implements fc.AsyncCommand<CapModel, AgentPoolRepository> {
  constructor(
    readonly first: number,
    readonly second: number,
  ) {}
  check = () => true;
  async run(model: CapModel, real: AgentPoolRepository): Promise<void> {
    const [a, b] = await Promise.all([draftOf(this.first), draftOf(this.second)]);
    const answers = await Promise.all([
      real.create('org-a', 'dany', a, act()),
      real.create('org-a', 'dany', b, act()),
    ]);
    expect(answers.map((each) => each.kind)).toEqual([
      expectCreation(model, this.first),
      expectCreation(model, this.second),
    ]);
    expect(agentPersons()).toBe(model.agents);
    expect(model.agents).toBeLessThanOrEqual(CAP);
  }
  toString = () => `CreateRacing(${String(this.first)}, ${String(this.second)})`;
}

describe('agent pool creation against the agent-person cap', () => {
  // Proof: with the cap read before the write turn (outside the creation's
  // transaction), seed 20261028 failed on `[CreateRacing(3, 6)]`: both racers
  // read 0 of 8 and both landed, 9 agents of 8; watched 2026-10-28.
  it('never holds more agent persons than the cap, however pool creations race', async () => {
    const size = fc.integer({ min: 1, max: 6 });
    const commands = fc.commands(
      [
        size.map((each) => new CreateOne(each)),
        fc.tuple(size, size).map(([first, second]) => new CreateRacing(first, second)),
      ],
      { maxCommands: 6 },
    );
    await fc.assert(
      fc.asyncProperty(commands, async (history) => {
        freshStore();
        const model: CapModel = { agents: 0 };
        await fc.asyncModelRun(() => ({ model, real: openPools() }), history);
      }),
      { numRuns: 25, seed: 20261028 },
    );
  }, 180_000);

  it('answers the cap, the count and the size when a pool crosses it, writing nothing', async () => {
    freshStore();
    const real = openPools();
    expect((await real.create('org-a', 'dany', await draftOf(5), act())).kind).toBe('created');
    expect(await real.create('org-a', 'dany', await draftOf(4), act())).toEqual({
      kind: 'agent_person_limit',
      cap: CAP,
      current: 5,
      added: 4,
    });
    expect(agentPersons()).toBe(5);
  });
});

describe('re-keying a pool', () => {
  // Proof: with the exact-persons refusal in `rekey` disabled, the
  // one-person key set answered 'rekeyed'; watched 2026-10-28.
  it('refuses keys that do not name exactly the pool’s persons, writing nothing', async () => {
    freshStore();
    const real = openPools();
    const draft = await draftOf(2);
    expect((await real.create('org-a', 'dany', draft, act())).kind).toBe('created');
    const first = draft.agents.at(0);
    const second = draft.agents.at(1);
    if (first === undefined || second === undefined) throw new Error('the pool has no agents');
    const fresh = (personId: string) => ({
      personId,
      credentialId: crypto.randomUUID(),
      secretId: crypto.randomUUID(),
      digest: first.digest,
    });
    for (const keys of [
      [fresh(first.personId)],
      [fresh(first.personId), fresh(first.personId)],
      [fresh(first.personId), fresh(crypto.randomUUID())],
      [fresh(first.personId), fresh(second.personId), fresh(crypto.randomUUID())],
    ])
      expect(await real.rekey('org-a', 'dany', draft.id, { keys }, act())).toEqual({
        kind: 'pool_changed',
      });
    const sqlite = openDatabase(path);
    try {
      expect(
        sqlite
          .query<{ n: number }, []>(
            'SELECT COUNT(*) AS n FROM machine_credential WHERE revoked_at IS NULL',
          )
          .get()?.n,
      ).toBe(2);
    } finally {
      sqlite.close();
    }
    expect(
      (
        await real.rekey(
          'org-a',
          'dany',
          draft.id,
          { keys: [fresh(second.personId), fresh(first.personId)] },
          act(),
        )
      ).kind,
    ).toBe('rekeyed');
    expect(agentPersons()).toBe(2);
  });
});
