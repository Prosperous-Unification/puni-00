import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { organizationId, ownerId } from '../record-codecs';
import { FixtureClock, unwrapReply } from '../testing/fixtures';
import {
  authorityRequest,
  runtimeEvidence,
  runtimePin,
  runtimeScope,
} from '../testing/runtime-history-contract';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

const childSource = `
import { existsSync, writeSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { Database } from 'bun:sqlite';
import { openSqliteStores } from ${JSON.stringify(new URL('./open-stores.ts', import.meta.url).pathname)};
const packet=JSON.parse(process.env.RUNTIME_STORE_CHILD);
const stores=await openSqliteStores({...packet.options,clock:{read:()=>1000}});
writeSync(1,JSON.stringify({phase:'ready'})+'\\n');
const deadline=Date.now()+10000;
while(!existsSync(packet.go)) {if(Date.now()>deadline)throw new Error('go barrier timeout');await Bun.sleep(1);}
if(packet.mode==='before') {
 const original=Database.prototype.run;
 Database.prototype.run=function(sql,...parameters) {
  if(sql==='COMMIT') {
   assert.equal(this.inTransaction,true,'runtime COMMIT must have a transaction');
   const marker=this.query('SELECT scope_count,intent_count,acceptance_count FROM run_format').get();
   const scope=this.query('SELECT revision FROM run_runtime_scope').get();
   assert.equal(scope.revision,packet.operation==='stage'?1:2,'complete revision before COMMIT');
   assert.deepEqual(marker,{scope_count:1,intent_count:1,acceptance_count:packet.operation==='stage'?0:1},'complete retained marker before COMMIT');
   assert.equal(this.query('SELECT count(*) AS count FROM run_runtime_intent').get().count,1);
   assert.equal(this.query('SELECT count(*) AS count FROM run_runtime_acceptance').get().count,packet.operation==='stage'?0:1);
   writeSync(1,JSON.stringify({phase:'before-commit'})+'\\n');
   const stop=Date.now()+10000;while(Date.now()<stop)Bun.sleepSync(5);throw new Error('kill barrier timeout');
  }
  return original.call(this,sql,...parameters);
 };
}
const reply=packet.operation==='stage'?await stores.runs.stageRuntimeRequest(packet.guard,packet.request):await stores.runs.recordRuntimeAcceptance(packet.guard,packet.acceptance);
writeSync(1,JSON.stringify({phase:'committed',reply})+'\\n');
if(packet.mode==='after'){const stop=Date.now()+10000;while(Date.now()<stop)await Bun.sleep(5);throw new Error('kill barrier timeout');}
await stores.close();
`;

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'runtime-process-'));
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 100,
    busyDelayMilliseconds: 2,
  };
  const stores = await bootstrapSqliteStores(options);
  const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
  unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
  const guard = { ownership, scope: runtimeScope, expectedRevision: 0 };
  let closing: Promise<void> | undefined;
  return {
    stores,
    options,
    directory,
    guard,
    close(): Promise<void> {
      if (closing !== undefined) return closing;
      closing = (async () => {
        await stores.close();
        rmSync(directory, { recursive: true, force: true });
      })();
      return closing;
    },
  };
}
function spawnRuntimeChild(packet: unknown) {
  const child = Bun.spawn([process.execPath, '-e', childSource], {
    env: { ...process.env, RUNTIME_STORE_CHILD: JSON.stringify(packet) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stderr = new Response(child.stderr).text();
  const reader = child.stdout.getReader();
  let pending = '';
  async function phase() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          for (;;) {
            const newline = pending.indexOf('\n');
            if (newline >= 0) {
              const line = pending.slice(0, newline);
              pending = pending.slice(newline + 1);
              return JSON.parse(line) as {
                phase: string;
                reply?: { kind: string; reason?: string };
              };
            }
            const chunk = await reader.read();
            if (chunk.done)
              throw new Error(
                `runtime child exited ${String(await child.exited)}: ${await stderr}`,
              );
            pending += new TextDecoder().decode(chunk.value);
          }
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('runtime child phase timeout'));
          }, 15000);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  return {
    child,
    phase,
    stderr,
    async close() {
      if (child.exitCode === null) child.kill('SIGKILL');
      await child.exited;
      reader.releaseLock();
    },
  };
}

for (const operation of ['stage', 'accept'] as const)
  test(`separate processes serialize runtime ${operation} under the same local owner`, async () => {
    const setup = await fixture();
    const go = join(setup.directory, 'go');
    const intent =
      operation === 'accept'
        ? unwrapReply(await setup.stores.runs.stageRuntimeRequest(setup.guard, authorityRequest()))
        : undefined;
    const children = [0, 1].map((index) =>
      spawnRuntimeChild({
        options: setup.options,
        go,
        mode: 'race',
        operation,
        guard: { ...setup.guard, expectedRevision: operation === 'stage' ? 0 : 1 },
        request: authorityRequest(`race-${String(index)}`),
        acceptance: { intent, evidence: runtimeEvidence },
      }),
    );
    try {
      expect(await Promise.all(children.map((child) => child.phase()))).toEqual([
        { phase: 'ready' },
        { phase: 'ready' },
      ]);
      writeFileSync(go, 'go');
      const phases = await Promise.all(children.map((child) => child.phase()));
      expect(phases.map((phase) => phase.phase)).toEqual(['committed', 'committed']);
      expect(phases.map((phase) => phase.reply?.kind).sort()).toEqual(
        operation === 'stage' ? ['applied', 'refused'] : ['applied', 'duplicate'],
      );
      for (const child of children) {
        expect(await child.child.exited).toBe(0);
        expect(await child.stderr).toBe('');
      }
      expect(await setup.stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        revision: operation === 'stage' ? 1 : 2,
        intents: [expect.anything()],
        acceptances: operation === 'stage' ? [] : [expect.anything()],
      });
    } finally {
      for (const child of children) await child.close();
      await setup.close();
    }
  }, 20000);

for (const operation of ['stage', 'accept'] as const)
  for (const mode of ['before', 'after'] as const)
    test(`SIGKILL ${mode} COMMIT preserves complete runtime ${operation} across reopen`, async () => {
      const setup = await fixture();
      const go = join(setup.directory, 'go');
      const intent =
        operation === 'accept'
          ? unwrapReply(
              await setup.stores.runs.stageRuntimeRequest(setup.guard, authorityRequest()),
            )
          : undefined;
      const before = await setup.stores.runs.readRuntimeScope(runtimeScope);
      const child = spawnRuntimeChild({
        options: setup.options,
        go,
        mode,
        operation,
        guard: { ...setup.guard, expectedRevision: operation === 'stage' ? 0 : 1 },
        request: authorityRequest(),
        acceptance: { intent, evidence: runtimeEvidence },
      });
      try {
        expect(await child.phase()).toEqual({ phase: 'ready' });
        writeFileSync(go, 'go');
        const phase = await child.phase();
        expect(phase.phase).toBe(mode === 'before' ? 'before-commit' : 'committed');
        if (mode === 'before')
          expect(await setup.stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
        else expect(phase.reply?.kind).toBe('applied');
        child.child.kill('SIGKILL');
        await child.child.exited;
        expect(child.child.signalCode).toBe('SIGKILL');
        expect(await child.stderr).toBe('');
        await setup.stores.close();
        const reopened = await openSqliteStores(setup.options);
        const database = new Database(setup.options.path, { readonly: true, create: false });
        try {
          if (mode === 'before')
            expect(await reopened.runs.readRuntimeScope(runtimeScope)).toEqual(before);
          else
            expect(await reopened.runs.readRuntimeScope(runtimeScope)).toMatchObject({
              revision: operation === 'stage' ? 1 : 2,
            });
          expect(
            database
              .query('SELECT scope_count,intent_count,acceptance_count FROM run_format')
              .get(),
          ).toEqual({
            scope_count: 1,
            intent_count: operation === 'accept' || mode === 'after' ? 1 : 0,
            acceptance_count: operation === 'accept' && mode === 'after' ? 1 : 0,
          });
        } finally {
          database.close();
          await reopened.close();
        }
      } finally {
        await child.close();
        await setup.close();
      }
    }, 20000);
