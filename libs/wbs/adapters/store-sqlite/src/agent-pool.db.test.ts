import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type AgentPoolDraft, type AuditedAct, digestMachineSecret } from '@wbs/core';
import type { OrganizationLimitValues } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import fc from 'fast-check';

import { AgentPoolRepository } from './agent-pool';
import { openConnection, openDatabase, openDrizzle } from './db';
import { OPEN, WriteCoordinator } from './gate';
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

/** Explicit minimal directory permission for each intended positive pool fixture. */
function grantDirectory(): void {
  const sqlite = openDatabase(path);
  try {
    sqlite.run(
      "INSERT INTO access_role(id,name,object_kind,level,reaches_restricted,organization_id,created_at) VALUES ('pool-fixture-directory','Pool fixture directory','organization',NULL,0,'org-a',1)",
    );
    sqlite.run(
      "INSERT INTO access_role_permission(role_id,permission) VALUES ('pool-fixture-directory','organization.manage_directory')",
    );
    sqlite.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES ('pool-fixture-directory-grant','org-a','organization','org-a','user','dany','pool-fixture-directory','route',1)",
    );
  } finally {
    sqlite.close();
  }
}

/** Explicit direct holder only for successful authority-removal fixtures. */
function seedDirectHolder(): void {
  const connection = openConnection(path);
  try {
    connection.db.run(
      sql`INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('cp14-fixture-holder','org-a','organization','org-a','user','dany','org-super-admin','backfill',0)`,
    );
  } finally {
    connection.close();
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
    const answer = await real.create('org-a', { id: 'dany' }, await draftOf(this.size), act());
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
      real.create('org-a', { id: 'dany' }, a, act()),
      real.create('org-a', { id: 'dany' }, b, act()),
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
        grantDirectory();
        const model: CapModel = { agents: 0 };
        await fc.asyncModelRun(() => ({ model, real: openPools() }), history);
      }),
      { numRuns: 25, seed: 20261028 },
    );
  }, 180_000);

  it('answers the cap, the count and the size when a pool crosses it, writing nothing', async () => {
    freshStore();
    grantDirectory();
    const real = openPools();
    expect((await real.create('org-a', { id: 'dany' }, await draftOf(5), act())).kind).toBe(
      'created',
    );
    expect(await real.create('org-a', { id: 'dany' }, await draftOf(4), act())).toEqual({
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
    grantDirectory();
    seedDirectHolder();
    const real = openPools();
    const draft = await draftOf(2);
    expect((await real.create('org-a', { id: 'dany' }, draft, act())).kind).toBe('created');
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
      expect(await real.rekey('org-a', { id: 'dany' }, draft.id, { keys }, act())).toEqual({
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
          { id: 'dany' },
          draft.id,
          { keys: [fresh(second.personId), fresh(first.personId)] },
          act(),
        )
      ).kind,
    ).toBe('rekeyed');
    expect(agentPersons()).toBe(2);
  });
});

for (const operation of ['rekey', 'revoke'] as const) {
  it('retains the actual queued pool cascade owner at ' + operation, async () => {
    freshStore();
    grantDirectory();
    seedDirectHolder();
    const connection = openConnection(path);
    connection.db.run(sql`INSERT INTO users(id,username,created_at) VALUES ('other','other',1)`);
    try {
      const original = await draftOf(1);
      const setup = new AgentPoolRepository(connection.db, OPEN, DEFAULTS);
      expect((await setup.create('org-a', { id: 'dany' }, original, act())).kind).toBe('created');
      const person = original.agents.at(0);
      if (person === undefined) throw new Error('pool fixture has no person');
      connection.db.run(
        sql`INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at,created_by) VALUES ('old-pool-grant','org-a','organization','org-a','machine_credential',${person.credentialId},'project-contributor','route',1,'dany')`,
      );
      const keys = [
        {
          ...person,
          credentialId: crypto.randomUUID(),
          secretId: crypto.randomUUID(),
          digest: await digestMachineSecret('renewal-' + crypto.randomUUID()),
        },
      ];
      const gate = new WriteCoordinator();
      const repository = new AgentPoolRepository(connection.db, gate, DEFAULTS);
      const held = Promise.withResolvers<undefined>();
      const entered = Promise.withResolvers<undefined>();
      const blocker = gate.enter(async () => {
        entered.resolve(undefined);
        await held.promise;
      });
      await entered.promise;
      const performed = {
        ...act(),
        stamp: { at: 1_900_000_000_100, by: 'dany' },
        auditId: 'queued-pool',
      };
      const pending =
        operation === 'rekey'
          ? repository.rekey('org-a', { id: 'dany' }, original.id, { keys }, performed)
          : repository.revoke('org-a', { id: 'dany' }, original.id, performed);
      Object.assign(performed, { actor: 'other', auditId: 'replacement' });
      Object.assign(performed.stamp, { at: 999, by: 'other' });
      held.resolve(undefined);
      await blocker;
      expect((await pending).kind).toBe(operation === 'rekey' ? 'rekeyed' : 'revoked');
      expect(
        connection.db.get<{ actor_id: string; created_at: number }>(
          sql`SELECT actor_id,created_at FROM organization_audit WHERE id='queued-pool'`,
        ),
      ).toEqual({ actor_id: 'dany', created_at: 1_900_000_000_100 });
      const rows = connection.db.all<{ actor_id: string; created_at: number }>(
        sql`SELECT actor_id,created_at FROM organization_audit WHERE action IN ('access_granted','access_revoked')`,
      );
      expect(rows.length).toBe(operation === 'rekey' ? 2 : 1);
      expect(
        rows.every(
          ({ actor_id, created_at }) => actor_id === 'dany' && created_at === 1_900_000_000_100,
        ),
      ).toBe(true);
    } finally {
      connection.close();
    }
  });
}

it('retains the deep renewal keys before the queued pool re-key owner', async () => {
  freshStore();
  grantDirectory();
  seedDirectHolder();
  const connection = openConnection(path);
  try {
    const original = await draftOf(1);
    const setup = new AgentPoolRepository(connection.db, OPEN, DEFAULTS);
    expect((await setup.create('org-a', { id: 'dany' }, original, act())).kind).toBe('created');
    const person = original.agents.at(0);
    if (person === undefined) throw new Error('pool fixture has no person');
    const key = {
      ...person,
      credentialId: crypto.randomUUID(),
      secretId: crypto.randomUUID(),
      digest: await digestMachineSecret('renewal-' + crypto.randomUUID()),
    };
    const credentialId = key.credentialId;
    const renewal = { keys: [key] };
    const gate = new WriteCoordinator();
    const repository = new AgentPoolRepository(connection.db, gate, DEFAULTS);
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const pending = repository.rekey('org-a', { id: 'dany' }, original.id, renewal, act());
    Object.assign(key, { credentialId: crypto.randomUUID(), secretId: crypto.randomUUID() });
    held.resolve(undefined);
    await blocker;
    const outcome = await pending;
    if (outcome.kind !== 'rekeyed') throw new Error('re-key fixture refused: ' + outcome.kind);
    expect(outcome.issued.agents.map((agent) => agent.credentialId)).toEqual([credentialId]);
  } finally {
    connection.close();
  }
});

for (const operation of ['rekey', 'revoke'] as const) {
  for (const mismatch of ['actor', 'stamp']) {
    it(
      'rejects a pool audit ' + mismatch + ' mismatch before owner entry at ' + operation,
      async () => {
        freshStore();
        const connection = openConnection(path);
        try {
          const original = await draftOf(1);
          const key = original.agents.at(0);
          if (key === undefined) throw new Error('pool fixture has no key');
          const repository = new AgentPoolRepository(
            connection.db,
            {
              enter: () => {
                throw new Error('unexpected pool owner entry');
              },
            },
            DEFAULTS,
          );
          const performed = {
            actor: mismatch === 'actor' ? 'other' : 'dany',
            stamp: { at: 30, by: mismatch === 'stamp' ? 'other' : 'dany' },
            auditId: 'mismatched',
          };
          expect(() =>
            operation === 'rekey'
              ? repository.rekey('org-a', { id: 'dany' }, original.id, { keys: [key] }, performed)
              : repository.revoke('org-a', { id: 'dany' }, original.id, performed),
          ).toThrow('pool audit identity differs from its actor');
          expect(connection.db.all(sql`SELECT * FROM organization_audit`)).toEqual([]);
        } finally {
          connection.close();
        }
      },
    );
  }
}

it('audits only actually inserted pool grant copies when old keys overlap', async () => {
  freshStore();
  grantDirectory();
  seedDirectHolder();
  const connection = openConnection(path);
  try {
    const original = await draftOf(1);
    const repository = new AgentPoolRepository(connection.db, OPEN, DEFAULTS);
    expect((await repository.create('org-a', { id: 'dany' }, original, act())).kind).toBe(
      'created',
    );
    const person = original.agents.at(0);
    if (person === undefined) throw new Error('pool person absent');
    const second = crypto.randomUUID();
    connection.db.run(
      sql`INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,agent_pool_id,created_at) VALUES (${second},'org-a',${person.personId},'dany','api_key','overlapping-old',${original.id},1)`,
    );
    for (const id of [person.credentialId, second])
      connection.db.run(
        sql`INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES (${crypto.randomUUID()},'org-a','organization','org-a','machine_credential',${id},'project-contributor','backfill',1)`,
      );
    const credentialId = crypto.randomUUID();
    const outcome = await repository.rekey(
      'org-a',
      { id: 'dany' },
      original.id,
      {
        keys: [
          {
            ...person,
            credentialId,
            secretId: crypto.randomUUID(),
            digest: await digestMachineSecret('overlap-renewal'),
          },
        ],
      },
      act(),
    );
    expect(outcome.kind).toBe('rekeyed');
    expect(
      connection.db.all(
        sql`SELECT subject_id,origin,created_by FROM access_grant WHERE subject_kind='machine_credential'`,
      ),
    ).toEqual([{ subject_id: credentialId, origin: 'backfill', created_by: null }]);
    const rows = connection.db.all<{ action: string; detail: string }>(
      sql`SELECT action,detail FROM organization_audit WHERE action IN ('access_granted','access_revoked')`,
    );
    expect(rows.map((row) => row.action).sort()).toEqual([
      'access_granted',
      'access_revoked',
      'access_revoked',
    ]);
    expect(
      rows.every(
        (row) => (JSON.parse(row.detail) as Record<string, unknown>)['origin'] === 'cascade',
      ),
    ).toBe(true);
  } finally {
    connection.close();
  }
});

for (const operation of ['rekey', 'revoke'] as const) {
  it(
    'rolls a zero-grant pool authority change back without a direct holder at ' + operation,
    async () => {
      freshStore();
      grantDirectory();
      const connection = openConnection(path);
      const repository = new AgentPoolRepository(connection.db, OPEN, DEFAULTS);
      try {
        const draft = await draftOf(1);
        expect((await repository.create('org-a', { id: 'dany' }, draft, act())).kind).toBe(
          'created',
        );
        const snapshot = () =>
          [
            'agent_pool',
            'machine_credential',
            'machine_credential_secret',
            'access_grant',
            'organization_audit',
          ].map((table) =>
            connection.db.all(sql.raw('SELECT * FROM ' + table + ' ORDER BY rowid')),
          );
        const before = snapshot();
        const answer =
          operation === 'revoke'
            ? await repository.revoke('org-a', { id: 'dany' }, draft.id, act())
            : await repository.rekey(
                'org-a',
                { id: 'dany' },
                draft.id,
                {
                  keys: draft.agents.map((agent) => ({
                    personId: agent.personId,
                    credentialId: crypto.randomUUID(),
                    secretId: crypto.randomUUID(),
                    digest: agent.digest,
                  })),
                },
                act(),
              );
        expect(answer).toEqual({ kind: 'last_super_admin' });
        expect(snapshot()).toEqual(before);
      } finally {
        connection.close();
      }
    },
  );
}
