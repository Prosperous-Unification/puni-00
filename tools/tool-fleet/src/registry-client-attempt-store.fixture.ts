import { constants } from 'node:fs';
import * as filesystem from 'node:fs/promises';
import { chmod, link, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { spyOn } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { createRegistryClientAttempt, RegistryClientAttempt } from './registry-client-attempt';
import { openRegistryClientAttemptStore } from './registry-client-attempt-store';
import { runRegistryClientAttempt } from './registry-client-custody';
import { createRegistryClientWorkspace } from './registry-client-workspace';
import { requireRejection } from './registry-rejection.fixture';

if (process.getuid?.() !== 0) throw new Error('Expected mapped root');
process.umask(0o077);
const parent = process.argv.at(2);
if (parent === undefined) throw new Error('Missing exact attempt fixture parent');
if (process.argv.at(3) === 'pause-before-publication') {
  const marker = process.argv.at(4),
    seed = process.argv.at(5);
  if (marker === undefined || seed === undefined)
    throw new Error('Missing exact atomic-writer fixture inputs');
  const actualOpen = filesystem.open;
  spyOn(filesystem, 'open').mockImplementation(async (path, flags, mode) => {
    const held = await actualOpen(path, flags, mode);
    if (
      typeof flags === 'number' &&
      (flags & constants.O_RDWR) !== 0 &&
      (await held.stat()).isFile()
    ) {
      spyOn(held, 'sync').mockImplementation(async () => {
        await writeFile(
          marker,
          JSON.stringify({ stage: 'before-publication', links: (await held.stat()).nlink }),
          { mode: 0o600 },
        );
        await Promise.withResolvers<never>().promise;
      });
    }
    return held;
  });
  const writer = await openRegistryClientAttemptStore(parent);
  const serialized: unknown = JSON.parse(await readFile(seed, 'utf8'));
  await writer.publish(RegistryClientAttempt.assert(serialized));
  throw new Error('Paused writer unexpectedly published');
}
const pool = join(parent, 'pool'),
  external = join(parent, 'external');
await mkdir(pool, { mode: 0o711 });
await chmod(pool, 0o711);
await mkdir(external, { mode: 0o700 });
await writeFile(join(external, 'keep'), 'preserved', { mode: 0o600 });
const store = await openRegistryClientAttemptStore(pool);
const cases: string[] = [];
const attempt = createRegistryClientAttempt({
  operationId: 'maintain',
  registryId: 'proof',
  snapshotId: 'a'.repeat(64),
  scope: 'current',
  journalRevision: 7,
  storageId: 'source',
  registryPath: '/source',
  planSha256: 'b'.repeat(64),
  profileSha256: 'c'.repeat(64),
  tokenSha256: 'd'.repeat(64),
  scratchStorageId: '11111111-1111-4111-8111-111111111111',
  pool: store.identity,
  guardian: {
    pid: 42,
    startTicks: '123',
    pidNamespace: 'pid:[1234]',
    bootId: '22222222-2222-4222-8222-222222222222',
    machineId: 'e'.repeat(32),
  },
  createdAt: new Date().toISOString(),
});
const inactive = (unit: string) =>
  invokeRegistryCallback(() => {
    if (unit !== attempt.unit) throw new Error('Foreign scope observer');
  });
try {
  if ((await store.read()) !== null) throw new Error('Nonempty fresh store');
  await chmod(pool, 0o777);
  await requireRejection(store.read());
  await chmod(pool, 0o711);
  cases.push('changed-pool-mode-refused');
  for (const fault of ['device', 'inode', 'unit'] as const) {
    const foreign = structuredClone(attempt);
    if (fault === 'device') foreign.pool.device = (BigInt(store.identity.device) + 1n).toString();
    if (fault === 'inode') foreign.pool.inode = (BigInt(store.identity.inode) + 1n).toString();
    if (fault === 'unit')
      foreign.unit = 'puni-registry-client-44444444-4444-4444-8444-444444444444.scope';
    await requireRejection(store.publish(foreign));
    if ((await readdir(pool)).length !== 0)
      throw new Error('Foreign publication allocated named state');
    cases.push('foreign-publication-' + fault + '-refused');
  }
  await store.publish(attempt);
  const published = await store.read();
  if (JSON.stringify(published) !== JSON.stringify(attempt))
    throw new Error('Unacknowledged client owner');
  const second = await openRegistryClientAttemptStore(pool);
  try {
    if (JSON.stringify(await second.read()) !== JSON.stringify(attempt))
      throw new Error('Nondurable client owner');
  } finally {
    await second.close();
  }
  cases.push('durable-single-owner');
  await requireRejection(store.publish(attempt));
  if (JSON.stringify(await store.read()) !== JSON.stringify(attempt))
    throw new Error('Owner overwritten');
  cases.push('no-overwrite');
  const workspace = await createRegistryClientWorkspace(pool);
  await writeFile(join(workspace.path, 'partial'), 'owned partial output', { mode: 0o600 });
  await requireRejection(
    store.recover(attempt, () => Promise.reject(new Error('scope still active'))),
  );
  if ((await readdir(pool)).length !== 2) throw new Error('Live scope content removed');
  cases.push('live-scope-preserved');
  await requireRejection(store.recover({ ...attempt, operationId: 'foreign' }, inactive));
  if ((await readdir(pool)).length !== 2) throw new Error('Foreign owner removed content');
  cases.push('wrong-owner-preserved');
  await requireRejection(store.finish(attempt, inactive));
  if ((await readdir(pool)).length !== 2) throw new Error('Success adopted leftover workspace');
  cases.push('unresolved-success-refused');
  // The parent owns no process here; close inherited handles to model a dead worker while leaving its actual files.
  await workspace.descriptor.close();
  await store.recover(attempt, inactive);
  if ((await readdir(pool)).length !== 0) throw new Error('Interrupted job remained');
  cases.push('interrupted-job-recovered');
  await store.publish(attempt);
  await writeFile(join(pool, 'unowned'), 'preserve', { mode: 0o600 });
  await requireRejection(store.recover(attempt, inactive));
  if ((await readFile(join(pool, 'unowned'), 'utf8')) !== 'preserve')
    throw new Error('Unknown entry removed');
  await rm(join(pool, 'unowned'));
  cases.push('unknown-entry-preserved');
  await symlink(external, join(pool, 'pull-33333333-3333-4333-8333-333333333333'));
  await requireRejection(store.recover(attempt, inactive));
  if ((await readFile(join(external, 'keep'), 'utf8')) !== 'preserved')
    throw new Error('Recovery escaped scratch');
  await rm(join(pool, 'pull-33333333-3333-4333-8333-333333333333'));
  cases.push('symlink-job-preserved');
  await store.finish(attempt, inactive);
  const record = join(pool, '.client-attempt.json');
  await writeFile(record, '{', { mode: 0o600 });
  await requireRejection(store.read());
  await rm(record);
  cases.push('malformed-record-refused');
  for (const fault of ['device', 'inode', 'unit'] as const) {
    const foreign = structuredClone(attempt);
    if (fault === 'device') foreign.pool.device = (BigInt(store.identity.device) + 1n).toString();
    if (fault === 'inode') foreign.pool.inode = (BigInt(store.identity.inode) + 1n).toString();
    if (fault === 'unit')
      foreign.unit = 'puni-registry-client-44444444-4444-4444-8444-444444444444.scope';
    await writeFile(record, JSON.stringify(foreign), { mode: 0o600 });
    await requireRejection(store.read());
    await rm(record);
    cases.push('foreign-record-' + fault + '-refused');
  }
  await writeFile(record, JSON.stringify(attempt).padEnd(8193, ' '), { mode: 0o600 });
  await requireRejection(store.read());
  await rm(record);
  cases.push('oversized-record-refused');
  await symlink(join(external, 'keep'), record);
  await requireRejection(store.read());
  await rm(record);
  cases.push('symlink-record-refused');
  await store.publish(attempt);
  await chmod(record, 0o640);
  await requireRejection(store.read());
  await chmod(record, 0o600);
  cases.push('public-readable-record-refused');
  await chmod(record, 0o000);
  await requireRejection(store.read());
  await chmod(record, 0o600);
  cases.push('unreadable-record-refused');
  await link(record, join(external, 'record-link'));
  await requireRejection(store.read());
  await rm(join(external, 'record-link'));
  cases.push('hardlinked-record-refused');
  await store.finish(attempt, inactive);
  await mkdir(join(pool, 'pull-33333333-3333-4333-8333-333333333333'), { mode: 0o700 });
  await requireRejection(store.read());
  await rm(join(pool, 'pull-33333333-3333-4333-8333-333333333333'), { recursive: true });
  cases.push('orphan-without-record-refused');
  const marker = join(parent, 'writer-paused'),
    seed = join(parent, 'writer-seed.json');
  await writeFile(seed, JSON.stringify(attempt), { mode: 0o600 });
  const writer = Bun.spawn(
    [process.execPath, import.meta.path, pool, 'pause-before-publication', marker, seed],
    { stdout: 'ignore', stderr: 'pipe' },
  );
  try {
    for (let tick = 0; tick < 500; tick++) {
      if (await Bun.file(marker).exists()) break;
      if (writer.exitCode !== null)
        throw new Error(
          'Atomic writer exited before its checkpoint: ' +
            (await new Response(writer.stderr).text()),
        );
      await Bun.sleep(10);
    }
    const serialized: unknown = JSON.parse(await readFile(marker, 'utf8'));
    const checkpoint = type({ stage: 'string', links: 'number.safe >= 0', '+': 'reject' }).assert(
      serialized,
    );
    if (
      checkpoint.stage !== 'before-publication' ||
      checkpoint.links !== 0 ||
      (await readdir(pool)).length !== 0
    )
      throw new Error('Incomplete client preparation became named state');
    writer.kill('SIGKILL');
    if (
      (await writer.exited) !== 137 ||
      writer.signalCode !== 'SIGKILL' ||
      (await new Response(writer.stderr).text()) !== ''
    )
      throw new Error('Atomic writer kill unconfirmed');
    if ((await store.read()) !== null || (await readdir(pool)).length !== 0)
      throw new Error('Killed prepublication writer left named state');
  } finally {
    if (writer.exitCode === null) {
      writer.kill('SIGKILL');
      await writer.exited;
    }
  }
  cases.push('anonymous-prepublication-reclaimed');
  const { id: previousId, unit: previousUnit, pool: previousPool, ...owner } = attempt;
  if (
    previousUnit !== 'puni-registry-client-' + previousId + '.scope' ||
    previousPool.inode !== store.identity.inode
  )
    throw new Error('Invalid prior fixture owner');
  const confirmed: string[] = [];
  const confirm = (unit: string) =>
    invokeRegistryCallback(() => {
      confirmed.push(unit);
    });
  let admitted = false;
  const accepted = await runRegistryClientAttempt({
    store,
    owner,
    admit: () =>
      invokeRegistryCallback(() => {
        admitted = true;
      }),
    assertInactive: confirm,
    execute: async (current) => {
      if (!admitted) throw new Error('Execution preceded metadata admission');
      const persisted = await store.read();
      if (persisted?.id !== current.id || !confirmed.includes(current.unit))
        throw new Error('Execution preceded durable inactive scope admission');
      return 'owned terminal receipt';
    },
  });
  if (accepted !== 'owned terminal receipt' || (await readdir(pool)).length !== 0)
    throw new Error('Successful owner not finalized');
  cases.push('publish-before-launch-and-terminal-cleanup');
  const admission = new Error('metadata reserve unavailable');
  const admissionEffects = { reached: 0 };
  const refusedAdmission = await requireRejection(
    runRegistryClientAttempt({
      store,
      owner,
      assertInactive: confirm,
      admit: () =>
        invokeRegistryCallback(() => {
          throw admission;
        }),
      execute: () =>
        invokeRegistryCallback(() => {
          admissionEffects.reached++;
        }),
    }),
  );
  if (
    refusedAdmission.cause !== admission ||
    admissionEffects.reached !== 0 ||
    (await readdir(pool)).length !== 0
  )
    throw new Error('Unadmitted record or worker reached allocation');
  cases.push('metadata-refusal-precedes-record-and-worker');

  const primary = new Error('owned client failure');
  const failed = await requireRejection(
    runRegistryClientAttempt({
      store,
      owner,
      admit: () => invokeRegistryCallback(() => undefined),
      assertInactive: confirm,
      execute: async () => {
        await mkdir(join(pool, 'pull-44444444-4444-4444-8444-444444444444'), { mode: 0o700 });
        await writeFile(
          join(pool, 'pull-44444444-4444-4444-8444-444444444444', 'partial'),
          'partial',
          { mode: 0o600 },
        );
        throw primary;
      },
    }),
  );
  if (failed.cause !== primary || (await readdir(pool)).length !== 0)
    throw new Error('Failure ownership or cleanup lost');
  cases.push('failed-client-reaps-recorded-workspaces');
  let active = false;
  const cleanup = new Error('owned scope active');
  const retained = await requireRejection(
    runRegistryClientAttempt({
      store,
      owner,
      admit: () => invokeRegistryCallback(() => undefined),
      assertInactive: () =>
        invokeRegistryCallback(() => {
          if (active) throw cleanup;
        }),
      execute: () =>
        invokeRegistryCallback(() => {
          active = true;
          throw primary;
        }),
    }),
  );
  if (
    !(retained.cause instanceof AggregateError) ||
    retained.cause.errors[0] !== primary ||
    retained.cause.errors[1] !== cleanup
  )
    throw new Error('Lost operation and active scope causes');
  const pending = await store.read();
  if (pending === null) throw new Error('Uncertain scope owner erased');
  cases.push('uncertain-scope-retains-owner-and-both-causes');
  const foreignEffects = { reached: 0 };
  await requireRejection(
    runRegistryClientAttempt({
      store,
      owner: { ...owner, operationId: 'foreign' },
      admit: () => invokeRegistryCallback(() => undefined),
      assertInactive: confirm,
      execute: () =>
        invokeRegistryCallback(() => {
          foreignEffects.reached++;
        }),
    }),
  );
  if (foreignEffects.reached !== 0 || (await store.read())?.id !== pending.id)
    throw new Error('Foreign operation adopted pending attempt');
  cases.push('foreign-operation-cannot-adopt-pending-scope');
  active = false;
  await runRegistryClientAttempt({
    store,
    owner,
    admit: () => invokeRegistryCallback(() => undefined),
    assertInactive: confirm,
    execute: (current) =>
      invokeRegistryCallback(() => {
        if (current.id === pending.id || !confirmed.includes(pending.unit))
          throw new Error('Interrupted attempt reused or not independently dead');
      }),
  });
  if ((await readdir(pool)).length !== 0) throw new Error('Fresh retry left ownership');
  cases.push('retry-reconciles-old-owner-before-fresh-nonce');
} finally {
  await store.close();
}
console.log(JSON.stringify({ cases, closed: true }));
