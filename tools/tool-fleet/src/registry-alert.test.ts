import type { FileHandle } from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import type { RegistryAlertSnapshot } from './registry-alert-store';
import { executeRegistryCommand } from './registry-managed-journal';
import { initializeRegistryPressureFixture } from './registry-pressure-report.fixture';
import { requireRejection } from './registry-rejection.fixture';
import { readRegistryBytes } from './registry-stream';

test('actual source process persists a warning incident before volatile publication', async () => {
  const root = await scratchAsync('registry-alert-integration-');
  await writeFile(
    join(root, 'sample.json'),
    JSON.stringify({ usedBytes: 35 * 1024 ** 3, at: '2026-11-01T00:00:00.000Z' }),
  );
  await initializeRegistryPressureFixture(root);
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, 'registry-pressure-report.fixture.ts'),
      root,
      'alerts',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, diagnostic] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stderr, 65536, 'alert source diagnostic'),
  ]);
  expect({ code, diagnostic: new TextDecoder().decode(diagnostic) }).toEqual({
    code: 0,
    diagnostic: '',
  });
  const snapshot = JSON.parse(
    await readFile(join(root, 'alerts', 'current.json'), 'utf8'),
  ) as RegistryAlertSnapshot;
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.events[0].kind).toBe('warning');
});

test('actual sender process posts the durable source incident to an owned HTTP receiver', async () => {
  const root = await scratchAsync('registry-alert-http-process-');
  await writeFile(
    join(root, 'sample.json'),
    JSON.stringify({ usedBytes: 45 * 1024 ** 3, at: '2026-11-01T00:00:00.000Z' }),
  );
  await initializeRegistryPressureFixture(root);
  const producer = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, 'registry-pressure-report.fixture.ts'),
      root,
      'alerts',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(await producer.exited).toBe(0);
  const received: string[] = [];
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      received.push(await request.text());
      return new Response('ok');
    },
  });
  try {
    await writeFile(
      join(root, 'receiver.json'),
      JSON.stringify({ url: `http://127.0.0.1:${String(receiver.port)}/receipt` }),
    );
    const sender = Bun.spawn(
      [process.execPath, join(import.meta.dir, 'registry-alert.fixture.ts'), root, 'send'],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [code, diagnostic] = await Promise.all([
      sender.exited,
      readRegistryBytes(sender.stderr, 65536, 'sender diagnostic'),
    ]);
    expect({ code, diagnostic: new TextDecoder().decode(diagnostic) }).toEqual({
      code: 0,
      diagnostic: '',
    });
    expect(received).toHaveLength(1);
    const payload = JSON.parse(received[0]) as { text: string };
    expect(payload.text).toContain('cutoff');
    expect(payload.text).toContain('Capacity bytes=');
    expect(payload.text).toContain('Remedy');
  } finally {
    await receiver.stop(true);
  }
});

import { chmod, lstat, readdir, unlink } from 'node:fs/promises';

import { initializeRegistryAlertFixture } from './registry-alert.fixture';
import { sendRegistryAlert } from './registry-alert-send-cli';
import {
  captureRegistryMaintenanceAlert,
  captureRegistryPressureAlert,
  changeRegistryAlerts,
  readRegistryAlertSnapshot,
} from './registry-alert-store';
import {
  createRegistryPressureReporter,
  type RegistryPressureReport,
} from './registry-pressure-report';
import {
  createRegistryPressureFixture,
  registryPressureFixtureIdentity,
} from './registry-pressure-report.fixture';

async function preparedAlert() {
  const root = await scratchAsync('registry-alert-state-');
  await writeFile(
    join(root, 'sample.json'),
    JSON.stringify({ usedBytes: 35 * 1024 ** 3, at: '2026-11-01T00:00:00.000Z' }),
  );
  const source = await initializeRegistryPressureFixture(root),
    context = await initializeRegistryAlertFixture(root);
  const reporter = createRegistryPressureReporter(registryPressureFixtureIdentity, {
    state: 'required',
    capture: (report) => captureRegistryPressureAlert(context, report),
  });
  await reporter(source.directory, source.ports, source.reports);
  return { root, source, context, reporter };
}
async function updatePressure(
  prepared: Awaited<ReturnType<typeof preparedAlert>>,
  bytes: number,
  at: string,
) {
  await writeFile(join(prepared.root, 'sample.json'), JSON.stringify({ usedBytes: bytes, at }));
  const source = await createRegistryPressureFixture(prepared.root);
  await prepared.reporter(source.directory, source.ports, source.reports);
}
/** Ordinary schema3 verification-phase model followed by the actual shared reopen command; no native maintenance effects are claimed. */
async function reopenAlertSource(prepared: Awaited<ReturnType<typeof preparedAlert>>, at: string) {
  await writeFile(join(prepared.root, 'sample.json'), JSON.stringify({ usedBytes: 1024 ** 3, at }));
  const source = await createRegistryPressureFixture(prepared.root);
  const before = await executeRegistryCommand(source.directory, { command: 'read' }, source.ports);
  let response = await executeRegistryCommand(
    source.directory,
    {
      command: 'begin-maintenance',
      operationId: 'verified-recovery',
      owner: 'owner',
      kind: 'backup',
      expectedRevision: before.state.revision,
    },
    source.ports,
  );
  const token = response.token;
  if (token === undefined) throw new Error('Missing modeled maintenance token');
  for (const phase of [
    'reconciled',
    'fenced',
    'stopped',
    'backed-up',
    'verified',
    'restored',
    'completed',
  ] as const)
    response = await executeRegistryCommand(
      source.directory,
      {
        command: 'advance-maintenance',
        operationId: 'verified-recovery',
        owner: 'owner',
        token,
        phase,
        expectedRevision: response.state.revision,
      },
      source.ports,
    );
  const reopened = await executeRegistryCommand(
    source.directory,
    {
      command: 'reopen',
      operationId: 'explicit-reopen',
      owner: 'owner',
      expectedRevision: response.state.revision,
    },
    source.ports,
  );
  expect(reopened.state.fenced).toBe(false);
}

const tick = '2026-11-01T00:00:00.000Z';
for (const response of [
  { status: 200, body: 'ok', state: 'acknowledged' },
  { status: 200, body: '', state: 'uncertain' },
  { status: 200, body: 'ok\n', state: 'uncertain' },
  { status: 200, body: '{}', state: 'uncertain' },
  { status: 302, body: 'redirect', state: 'rejected' },
  { status: 400, body: 'bad', state: 'rejected' },
  { status: 403, body: 'denied', state: 'rejected' },
  { status: 404, body: 'missing', state: 'rejected' },
  { status: 410, body: 'archived', state: 'rejected' },
  { status: 500, body: 'oops', state: 'uncertain' },
  { status: 200, body: 'x'.repeat(4097), state: 'uncertain' },
] as const) {
  test(`real HTTP ${String(response.status)}/${String(response.body.length)} retains ${response.state}`, async () => {
    const prepared = await preparedAlert();
    let calls = 0;
    const receiver = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch() {
        calls++;
        return new Response(response.body, { status: response.status });
      },
    });
    try {
      const operation = sendRegistryAlert(prepared.context, {
        now: () => tick,
        transport: {
          post: (payload, signal) =>
            fetch(`http://127.0.0.1:${String(receiver.port)}`, {
              method: 'POST',
              body: payload,
              redirect: 'manual',
              signal,
            }),
        },
      });
      if (response.state === 'acknowledged')
        expect(await operation).toEqual({ state: 'acknowledged' });
      else expect((await requireRejection(operation)).throwCause).toThrow('Alert');
      const snapshot = await readRegistryAlertSnapshot(prepared.context);
      expect(snapshot.events[0].state).toBe(response.state);
      expect(snapshot.events[0].attempts).toBe(1);
      expect(calls).toBe(1);
    } finally {
      await receiver.stop(true);
    }
  });
}

test('acknowledged warning cursor survives fresh epochs and cached replays; actual recovery rearms while cutoff survives healthy updates', async () => {
  const prepared = await preparedAlert();
  await sendRegistryAlert(prepared.context, {
    now: () => tick,
    transport: { post: () => Promise.resolve(new Response('ok')) },
  });
  await updatePressure(prepared, 35 * 1024 ** 3, '2026-11-01T00:00:10.000Z');
  expect((await readRegistryAlertSnapshot(prepared.context)).events).toHaveLength(1);
  await updatePressure(prepared, 45 * 1024 ** 3, '2026-11-01T00:00:20.000Z');
  const cutoff = (await readRegistryAlertSnapshot(prepared.context)).events[0];
  expect(cutoff.kind).toBe('cutoff');
  await updatePressure(prepared, 1024 ** 3, '2026-11-01T00:00:30.000Z');
  expect((await readRegistryAlertSnapshot(prepared.context)).events[0]).toEqual(cutoff);
  await updatePressure(prepared, 35 * 1024 ** 3, '2026-11-01T00:00:40.000Z');
  expect(
    (await readRegistryAlertSnapshot(prepared.context)).events.map((event) => event.kind),
  ).toEqual(['cutoff']);
  await reopenAlertSource(prepared, '2026-11-01T00:00:45.000Z');
  await updatePressure(prepared, 1024 ** 3, '2026-11-01T00:00:46.000Z');
  await updatePressure(prepared, 35 * 1024 ** 3, '2026-11-01T00:00:50.000Z');
  expect(
    (await readRegistryAlertSnapshot(prepared.context)).events.map((event) => event.kind),
  ).toEqual(['cutoff', 'warning']);
});

test('full normal spool retains incidents and critical reserve; completely full spool writes bounded fault', async () => {
  const prepared = await preparedAlert();
  for (let revision = 1; revision <= 30; revision++)
    await captureRegistryMaintenanceAlert(prepared.context, {
      revision,
      kind: 'backup',
      operationId: `backup-${String(revision)}`,
      identity: hashRegistryAlert(`backup-${String(revision)}`),
      at: tick,
      owners: ['protected'],
    });
  await updatePressure(prepared, 1024 ** 3, '2026-11-01T00:00:01.000Z');
  await reopenAlertSource(prepared, '2026-11-01T00:00:01.100Z');
  await updatePressure(prepared, 1024 ** 3, '2026-11-01T00:00:01.200Z');
  expect(
    (await requireRejection(updatePressure(prepared, 35 * 1024 ** 3, '2026-11-01T00:00:02.000Z')))
      .throwCause,
  ).toThrow('outbox is full');
  await updatePressure(prepared, 45 * 1024 ** 3, '2026-11-01T00:00:03.000Z');
  const before = await readRegistryAlertSnapshot(prepared.context);
  expect(before.events).toHaveLength(32);
  expect(before.events[31].kind).toBe('cutoff');
  expect(
    (
      await requireRejection(
        captureRegistryMaintenanceAlert(prepared.context, {
          revision: 31,
          kind: 'backup',
          operationId: 'overflow',
          identity: hashRegistryAlert('overflow'),
          at: tick,
          owners: [],
        }),
      )
    ).throwCause,
  ).toThrow('outbox is full');
  expect(await readRegistryAlertSnapshot(prepared.context)).toEqual(before);
  expect(
    (await lstat(join(prepared.context.enrollment.directory, 'fault.json'))).size,
  ).toBeLessThanOrEqual(4096);
  expect((await readdir(prepared.context.enrollment.directory)).sort()).toEqual([
    'current.json',
    'fault.json',
    'send.lock',
    'state.lock',
  ]);
});

for (const fault of [
  'missing-current',
  'missing-lock',
  'missing-directory',
  'unreadable-current',
  'unreadable-directory',
  'malformed',
  'unknown',
  'pending',
  'public',
  'hardlink',
  'foreign-config',
] as const) {
  test(`runtime refuses ${fault} without state genesis`, async () => {
    const prepared = await preparedAlert(),
      directory = prepared.context.enrollment.directory,
      path = join(directory, 'current.json');
    if (fault === 'missing-current') await unlink(path);
    if (fault === 'missing-lock') await unlink(join(directory, 'state.lock'));
    if (fault === 'missing-directory') {
      const { rename } = await import('node:fs/promises');
      await rename(directory, `${directory}-lost`);
    }
    if (fault === 'unreadable-current') await chmod(path, 0);
    if (fault === 'unreadable-directory') await chmod(directory, 0);
    if (fault === 'malformed') await writeFile(path, '{}');
    if (fault === 'unknown') await writeFile(join(directory, 'surprise'), 'x');
    if (fault === 'pending') await writeFile(join(directory, 'pending.json'), 'x');
    if (fault === 'public') await chmod(path, 0o644);
    if (fault === 'hardlink') {
      const { link } = await import('node:fs/promises');
      await link(path, join(prepared.root, 'outside'));
    }
    if (fault === 'foreign-config') prepared.context.enrollment.destinationId = 'foreign';
    expect(
      (await requireRejection(readRegistryAlertSnapshot(prepared.context))).throwCause,
    ).toThrow();
    if (fault === 'unreadable-directory') await chmod(directory, 0o700);
    if (fault === 'unreadable-current') await chmod(path, 0o600);
    if (fault === 'missing-current') expect(await Bun.file(path).exists()).toBe(false);
  });
}
for (const fault of [
  'type',
  'bytes',
  'inodes',
  'unit',
  'free-bytes',
  'free-inodes',
  'alias',
  'directory-inode',
  'lock-inode',
  'lock-mode',
] as const) {
  test(`runtime validates modeled ${fault} physical boundary before real IO`, async () => {
    const prepared = await preparedAlert(),
      filesystem = { ...(await prepared.context.io!.filesystem!()) };
    if (fault === 'type') filesystem.type = 0x123n;
    if (fault === 'bytes') filesystem.blocks = 8192n;
    if (fault === 'inodes') filesystem.files = 8192n;
    if (fault === 'unit') {
      filesystem.bsize = 131072n;
      filesystem.blocks = 128n;
      filesystem.bfree = 100n;
      filesystem.bavail = 100n;
    }
    if (fault === 'free-bytes') {
      filesystem.bfree = 10n;
      filesystem.bavail = 10n;
    }
    if (fault === 'free-inodes') filesystem.ffree = 7n;
    prepared.context.io!.filesystem = () => Promise.resolve(filesystem);
    if (fault === 'alias')
      prepared.context.io!.excludedDevices = () =>
        Promise.resolve([prepared.context.enrollment.device]);
    if (fault === 'directory-inode') {
      const { rename, mkdir } = await import('node:fs/promises');
      const directory = prepared.context.enrollment.directory;
      await rename(directory, `${directory}-old`);
      await mkdir(directory, { mode: 0o700 });
      for (const name of await readdir(`${directory}-old`))
        await rename(join(`${directory}-old`, name), join(directory, name));
    }
    if (fault === 'lock-inode') {
      const { open } = await import('node:fs/promises');
      const path = join(prepared.context.enrollment.directory, 'state.lock');
      const old = await open(path, 'r');
      try {
        await unlink(path);
        await writeFile(path, '', { mode: 0o600 });
      } finally {
        await old.close();
      }
    }
    if (fault === 'lock-mode')
      await chmod(join(prepared.context.enrollment.directory, 'state.lock'), 0o644);
    expect(
      (await requireRejection(readRegistryAlertSnapshot(prepared.context))).throwCause,
    ).toThrow();
  });
}

test('uncertain attempts retain one identity and exhaust after three persisted sends across restart contexts', async () => {
  const prepared = await preparedAlert();
  const identifier = (await readRegistryAlertSnapshot(prepared.context)).events[0].id;
  let calls = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { readRegistryAlertFixture } = await import('./registry-alert.fixture');
    expect(
      (
        await requireRejection(
          sendRegistryAlert(await readRegistryAlertFixture(prepared.root), {
            now: () => new Date(Date.parse(tick) + attempt * 1000).toISOString(),
            transport: {
              post: () => {
                calls++;
                return Promise.resolve(new Response('unexpected'));
              },
            },
          }),
        )
      ).throwCause,
    ).toThrow('Alert');
  }
  const snapshot = await readRegistryAlertSnapshot(prepared.context);
  expect(snapshot.events[0]).toMatchObject({
    id: identifier,
    state: 'exhausted',
    attempts: 3,
    firstAt: tick,
  });
  expect(
    (
      await requireRejection(
        sendRegistryAlert(prepared.context, {
          now: () => new Date(Date.parse(tick) + 5000).toISOString(),
          transport: {
            post: () => {
              calls++;
              return Promise.resolve(new Response('ok'));
            },
          },
        }),
      )
    ).throwCause,
  ).toThrow('terminal failures');
  expect(calls).toBe(3);
});

test('rate limit honors persisted Retry-After without sending before it and refuses a delay beyond horizon', async () => {
  const prepared = await preparedAlert();
  let calls = 0;
  let stamp = tick;
  const options = {
    now: () => stamp,
    transport: {
      post: () => {
        calls++;
        return Promise.resolve(
          new Response('', {
            status: 429,
            headers: { 'retry-after': calls === 1 ? '2' : '9999' },
          }),
        );
      },
    },
  };
  expect((await requireRejection(sendRegistryAlert(prepared.context, options))).throwCause).toThrow(
    'uncertain',
  );
  stamp = '2026-11-01T00:00:01.000Z';
  expect(await sendRegistryAlert(prepared.context, options)).toEqual({ state: 'deferred' });
  expect(calls).toBe(1);
  stamp = '2026-11-01T00:00:02.000Z';
  expect((await requireRejection(sendRegistryAlert(prepared.context, options))).throwCause).toThrow(
    'exhausted',
  );
  expect(calls).toBe(2);
});

test('actual stalled HTTP request is cancelled by bounded deadline and saved as uncertainty', async () => {
  const prepared = await preparedAlert();
  let received = 0;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 0,
    async fetch(request) {
      received++;
      await new Promise<void>((resolve) => {
        request.signal.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      return new Response('ok');
    },
  });
  const start = Date.now();
  const external = new AbortController();
  const watchdog = setTimeout(() => {
    external.abort();
  }, 400);
  try {
    expect(
      (
        await requireRejection(
          sendRegistryAlert(prepared.context, {
            signal: external.signal,
            now: () => tick,
            requestMilliseconds: 50,
            transport: {
              post: (payload, signal) =>
                fetch(`http://127.0.0.1:${String(receiver.port)}`, {
                  method: 'POST',
                  body: payload,
                  signal,
                }),
            },
          }),
        )
      ).throwCause,
    ).toThrow('uncertain');
    expect(Date.now() - start).toBeLessThan(250);
    expect(received).toBe(1);
    expect((await readRegistryAlertSnapshot(prepared.context)).events[0].state).toBe('uncertain');
  } finally {
    clearTimeout(watchdog);
    await receiver.stop(true);
  }
});

test('directory sync failure after rename leaves a recovery marker and blocks reuse', async () => {
  const prepared = await preparedAlert();
  let injected = false;
  prepared.context.io!.sync = async (file) => {
    const current = JSON.parse(
      await readFile(join(prepared.context.enrollment.directory, 'current.json'), 'utf8'),
    ) as RegistryAlertSnapshot;
    if ((await file.stat()).isDirectory() && current.counter === 2 && !injected) {
      injected = true;
      throw new Error('directory sync fault');
    }
    await file.sync();
  };
  expect(
    (
      await requireRejection(
        changeRegistryAlerts(prepared.context, (snapshot) => {
          snapshot.counter += 1;
        }),
      )
    ).throwCause,
  ).toThrow('directory sync fault');
  delete prepared.context.io!.sync;
  expect((await requireRejection(readRegistryAlertSnapshot(prepared.context))).throwCause).toThrow(
    'Unresolved alert replacement',
  );
});

test('actual eighty-percent transition retains a distinct cleanup request and truthful fence context', async () => {
  const prepared = await preparedAlert();
  await updatePressure(prepared, 40 * 1024 ** 3, '2026-11-01T00:00:10.000Z');
  const snapshot = await readRegistryAlertSnapshot(prepared.context);
  expect(snapshot.events.map((event) => event.kind)).toEqual(['warning', 'cleanup-request']);
  expect(snapshot.events[1]).toMatchObject({ fence: { state: 'open', reason: null } });
});

for (const fault of [
  'counter',
  'attempt-horizon',
  'pending-attempt',
  'fence-reason',
  'owners-scope',
  'missing-send-lock',
] as const) {
  test(`durable integrity rejects ${fault} instead of accepting stale success`, async () => {
    const prepared = await preparedAlert(),
      path = join(prepared.context.enrollment.directory, 'current.json');
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as RegistryAlertSnapshot;
    if (fault === 'counter') {
      snapshot.counter = 0;
    }
    if (fault === 'attempt-horizon') {
      snapshot.events[0].state = 'sending';
      snapshot.events[0].attempts = 1;
      snapshot.events[0].firstAt = '2026-11-01T00:00:02.000Z';
      snapshot.events[0].nextAt = tick;
      snapshot.lastAttemptAt = tick;
    }
    if (fault === 'pending-attempt') {
      snapshot.events[0].attempts = 1;
      snapshot.events[0].firstAt = tick;
      snapshot.lastAttemptAt = tick;
    }
    if (fault === 'fence-reason') {
      snapshot.events[0].fence.reason = 'invented';
    }
    if (fault === 'owners-scope') {
      snapshot.events[0].owners.scope = 'unavailable';
      snapshot.events[0].owners.count = 1;
      snapshot.events[0].owners.names = ['invented'];
    }
    if (fault === 'missing-send-lock')
      await unlink(join(prepared.context.enrollment.directory, 'send.lock'));
    if (['fence-reason', 'owners-scope'].includes(fault)) {
      const { renderRegistryAlert, hashRegistryAlert } =
        await import('./registry-monitoring-events');
      snapshot.events[0].payloadSha256 = hashRegistryAlert(renderRegistryAlert(snapshot.events[0]));
    }
    await writeFile(path, JSON.stringify(snapshot));
    expect(
      (await requireRejection(readRegistryAlertSnapshot(prepared.context))).throwCause,
    ).toThrow();
  });
}

test('legitimate replacement under the state lock is waited for instead of mistaken for abandoned state', async () => {
  const prepared = await preparedAlert();
  let release: () => void = () => {
    throw new Error('missing release');
  };
  let entered: () => void = () => {
    throw new Error('missing entry');
  };
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  let blocked = false;
  prepared.context.io!.sync = async (file) => {
    if (!blocked) {
      blocked = true;
      entered();
      await gate;
    }
    await file.sync();
  };
  const writer = changeRegistryAlerts(prepared.context, (snapshot) => {
    snapshot.counter += 1;
  });
  await started;
  const { readRegistryAlertFixture } = await import('./registry-alert.fixture');
  const reader = readRegistryAlertSnapshot(await readRegistryAlertFixture(prepared.root));
  const state = await Promise.race([
    reader.then(
      () => 'completed',
      () => 'rejected',
    ),
    Bun.sleep(30).then(() => 'waiting'),
  ]);
  release();
  await writer;
  await Promise.allSettled([reader]);
  expect(state).toBe('waiting');
});

test('separate send lock prevents duplicate concurrent requests while capture proceeds during HTTP', async () => {
  const prepared = await preparedAlert();
  let arrived: () => void = () => {
      throw new Error('not ready');
    },
    release: () => void = () => {
      throw new Error('not ready');
    };
  const entered = new Promise<void>((resolve) => {
      arrived = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  let requests = 0;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch() {
      requests++;
      arrived();
      await gate;
      return new Response('ok');
    },
  });
  const transport = {
    post: (payload: string, signal: AbortSignal) =>
      fetch(`http://127.0.0.1:${String(receiver.port)}`, { method: 'POST', body: payload, signal }),
  };
  const first = sendRegistryAlert(prepared.context, { now: () => tick, transport });
  await entered;
  let second: Promise<unknown> | undefined;
  try {
    await updatePressure(prepared, 45 * 1024 ** 3, '2026-11-01T00:00:01.000Z');
    second = sendRegistryAlert(prepared.context, {
      now: () => '2026-11-01T00:00:02.000Z',
      transport,
    });
    const outcome = await Promise.race([
      second.then(
        () => 'success',
        () => 'busy',
      ),
      Bun.sleep(100).then(() => 'waiting'),
    ]);
    expect(outcome).toBe('busy');
    expect(requests).toBe(1);
  } finally {
    release();
    await Promise.allSettled([first, ...(second === undefined ? [] : [second])]);
    await receiver.stop(true);
  }
  expect(
    (await readRegistryAlertSnapshot(prepared.context)).events.map((event) => event.kind),
  ).toEqual(['warning', 'cutoff']);
});

test('killed actual sender after receiver acceptance retains sending identity and consumes the attempt on restart', async () => {
  const prepared = await preparedAlert();
  let arrived: () => void = () => {
      throw new Error('not ready');
    },
    release: () => void = () => {
      throw new Error('not ready');
    };
  const entered = new Promise<void>((resolve) => {
      arrived = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  const received: string[] = [];
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      received.push(await request.text());
      arrived();
      await gate;
      return new Response('ok');
    },
  });
  await writeFile(
    join(prepared.root, 'receiver.json'),
    JSON.stringify({ url: `http://127.0.0.1:${String(receiver.port)}`, now: tick }),
  );
  const sender = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'registry-alert.fixture.ts'), prepared.root, 'send'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  try {
    await entered;
    const before = await readRegistryAlertSnapshot(prepared.context);
    expect(before.events[0]).toMatchObject({ state: 'sending', attempts: 1, firstAt: tick });
    sender.kill('SIGKILL');
    expect(await sender.exited).not.toBe(0);
    release();
    const { readRegistryAlertFixture } = await import('./registry-alert.fixture');
    await sendRegistryAlert(await readRegistryAlertFixture(prepared.root), {
      now: () => '2026-11-01T00:00:02.000Z',
      transport: {
        post: (payload, signal) =>
          fetch(`http://127.0.0.1:${String(receiver.port)}`, {
            method: 'POST',
            body: payload,
            signal,
          }),
      },
    });
    expect(received).toHaveLength(2);
    expect(received[0]).toBe(received[1]);
    expect((await readRegistryAlertSnapshot(prepared.context)).events[0]).toMatchObject({
      id: before.events[0].id,
      state: 'acknowledged',
      attempts: 2,
      firstAt: tick,
    });
  } finally {
    release();
    if (sender.exitCode === null) sender.kill('SIGKILL');
    await sender.exited;
    await receiver.stop(true);
  }
});

test('cancel before send creates no attempt; cancellation after request retains uncertainty', async () => {
  const prepared = await preparedAlert();
  const cancelled = new AbortController();
  cancelled.abort(new Error('operator cancelled'));
  expect(
    (await requireRejection(sendRegistryAlert(prepared.context, { signal: cancelled.signal })))
      .throwCause,
  ).toThrow('operator cancelled');
  expect((await readRegistryAlertSnapshot(prepared.context)).events[0].attempts).toBe(0);
  const controller = new AbortController();
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      controller.abort(new Error('operator cancelled'));
      return new Response('ok');
    },
  });
  try {
    expect(
      (
        await requireRejection(
          sendRegistryAlert(prepared.context, {
            now: () => tick,
            signal: controller.signal,
            transport: {
              post: (payload, signal) =>
                fetch(`http://127.0.0.1:${String(receiver.port)}`, {
                  method: 'POST',
                  body: payload,
                  signal,
                }),
            },
          }),
        )
      ).throwCause,
    ).toThrow('uncertain');
    expect((await readRegistryAlertSnapshot(prepared.context)).events[0]).toMatchObject({
      state: 'uncertain',
      attempts: 1,
    });
  } finally {
    await receiver.stop(true);
  }
});

test('acknowledgement persistence failure leaves sending uncertainty and preserves original retry budget', async () => {
  const prepared = await preparedAlert();
  let snapshots = 0;
  prepared.context.io!.sync = async (file) => {
    if ((await file.stat()).isFile() && (await file.stat()).size > 1000 && ++snapshots === 2)
      throw new Error('ack sync fault');
    await file.sync();
  };
  expect(
    (
      await requireRejection(
        sendRegistryAlert(prepared.context, {
          now: () => tick,
          transport: { post: () => Promise.resolve(new Response('ok')) },
        }),
      )
    ).throwCause,
  ).toThrow('ack sync fault');
  delete prepared.context.io!.sync;
  expect((await readRegistryAlertSnapshot(prepared.context)).events[0]).toMatchObject({
    state: 'sending',
    attempts: 1,
  });
});

test('remaining durable horizon bounds the final actual request deadline', async () => {
  const prepared = await preparedAlert();
  await requireRejection(
    sendRegistryAlert(prepared.context, {
      now: () => tick,
      transport: { post: () => Promise.resolve(new Response('', { status: 500 })) },
    }),
  );
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 0,
    async fetch(request) {
      await new Promise<void>((resolve) => {
        request.signal.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      return new Response('ok');
    },
  });
  const start = Date.now();
  try {
    await requireRejection(
      sendRegistryAlert(prepared.context, {
        now: () => '2026-11-01T00:09:59.980Z',
        requestMilliseconds: 1000,
        transport: {
          post: (payload, signal) =>
            fetch(`http://127.0.0.1:${String(receiver.port)}`, {
              method: 'POST',
              body: payload,
              signal,
            }),
        },
      }),
    );
    expect(Date.now() - start).toBeLessThan(250);
  } finally {
    await receiver.stop(true);
  }
});

test('replayed warning bytes after real recovery cannot rearm an acknowledged incident', async () => {
  const prepared = await preparedAlert();
  const original = JSON.parse(
    await readFile(join(prepared.source.reports, 'report.json'), 'utf8'),
  ) as RegistryPressureReport;
  await sendRegistryAlert(prepared.context, {
    now: () => tick,
    transport: { post: () => Promise.resolve(new Response('ok')) },
  });
  await updatePressure(prepared, 1024 ** 3, '2026-11-01T00:00:10.000Z');
  await reopenAlertSource(prepared, '2026-11-01T00:00:11.000Z');
  await updatePressure(prepared, 1024 ** 3, '2026-11-01T00:00:12.000Z');
  await captureRegistryPressureAlert(prepared.context, original);
  const snapshot = await readRegistryAlertSnapshot(prepared.context);
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.events[0]).toMatchObject({
    state: 'acknowledged',
    id: `${prepared.context.enrollment.enrollmentId}:1`,
  });
  expect(snapshot.counter).toBe(1);
});

import { createRegistrySlackTransport } from './registry-alert-slack';
import { hashRegistryAlert, renderRegistryAlert } from './registry-monitoring-events';
const fakeWebhook = 'https://hooks.slack.com/services/owned/local/test-only';
async function ownCredential() {
  const prepared = await preparedAlert();
  const path = join(prepared.root, 'owned-fake-credential');
  await writeFile(path, fakeWebhook, { mode: 0o600 });
  prepared.context.enrollment.credentialSha256 = hashRegistryAlert(fakeWebhook);
  return { ...prepared, path };
}

test('ordinary owned fake credential validates selected endpoint without making a provider request', async () => {
  const prepared = await ownCredential();
  const transport = await createRegistrySlackTransport(prepared.context, {
    credentialPath: prepared.path,
  });
  expect(typeof transport.post).toBe('function');
});
for (const fault of [
  'http',
  'host',
  'port',
  'user',
  'query',
  'fragment',
  'path',
  'mode',
  'hardlink',
  'symlink',
  'unreadable',
  'pin',
  'oversize',
] as const) {
  test(`owned fake credential refuses ${fault} without exposing its URL`, async () => {
    const prepared = await ownCredential();
    let credential = fakeWebhook;
    if (fault === 'http') credential = fakeWebhook.replace('https:', 'http:');
    if (fault === 'host') credential = fakeWebhook.replace('hooks.slack.com', 'example.com');
    if (fault === 'port')
      credential = fakeWebhook.replace('hooks.slack.com', 'hooks.slack.com:444');
    if (fault === 'user')
      credential = fakeWebhook.replace('hooks.slack.com', 'user@hooks.slack.com');
    if (fault === 'query') credential += '?copy=forbidden';
    if (fault === 'fragment') credential += '#forbidden';
    if (fault === 'path') credential = fakeWebhook.replace('/services/', '/unknown/');
    if (fault === 'oversize') credential += ' '.repeat(2049 - Buffer.byteLength(credential));
    await writeFile(prepared.path, credential);
    prepared.context.enrollment.credentialSha256 = hashRegistryAlert(credential);
    if (fault === 'mode') await chmod(prepared.path, 0o644);
    if (fault === 'unreadable') await chmod(prepared.path, 0);
    if (fault === 'pin') prepared.context.enrollment.credentialSha256 = '0'.repeat(64);
    if (fault === 'hardlink') {
      const { link } = await import('node:fs/promises');
      await link(prepared.path, `${prepared.path}-link`);
    }
    if (fault === 'symlink') {
      const { symlink, rename } = await import('node:fs/promises');
      await rename(prepared.path, `${prepared.path}-target`);
      await symlink(`${prepared.path}-target`, prepared.path);
    }
    const refusal = await requireRejection(
      createRegistrySlackTransport(prepared.context, { credentialPath: prepared.path }),
    );
    expect(refusal.throwCause).toThrow('alert');
    expect(String(refusal.cause)).not.toContain(credential);
    if (fault === 'unreadable') await chmod(prepared.path, 0o600);
  });
}

for (const fault of [
  'symlink-current',
  'oversize-current',
  'schema-version',
  'payload-hash',
] as const) {
  test(`bounded installed state rejects ${fault} using real files`, async () => {
    const prepared = await preparedAlert(),
      path = join(prepared.context.enrollment.directory, 'current.json');
    const text = await readFile(path, 'utf8');
    const snapshot = JSON.parse(text) as RegistryAlertSnapshot;
    if (fault === 'symlink-current') {
      const { rename, symlink } = await import('node:fs/promises');
      await rename(path, join(prepared.root, 'outside-snapshot'));
      await symlink(join(prepared.root, 'outside-snapshot'), path);
    }
    if (fault === 'oversize-current')
      await writeFile(path, text + ' '.repeat(256 * 1024 + 1 - Buffer.byteLength(text)));
    if (fault === 'schema-version')
      await writeFile(path, JSON.stringify({ ...snapshot, schemaVersion: 2 }));
    if (fault === 'payload-hash') {
      snapshot.events[0].payloadSha256 = '0'.repeat(64);
      await writeFile(path, JSON.stringify(snapshot));
    }
    expect(
      (await requireRejection(readRegistryAlertSnapshot(prepared.context))).throwCause,
    ).toThrow();
  });
}

import { postRegistrySlackRequest } from './registry-alert-slack';
test('actual Slack request helper refuses redirects to a second local receiver', async () => {
  const prepared = await preparedAlert();
  let redirected = 0;
  const second = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      redirected++;
      return new Response('ok');
    },
  });
  const first = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      return new Response('', {
        status: 302,
        headers: { location: `http://127.0.0.1:${String(second.port)}` },
      });
    },
  });
  try {
    const operation = sendRegistryAlert(prepared.context, {
      now: () => tick,
      transport: {
        post: (payload, signal) =>
          postRegistrySlackRequest(
            new URL(`http://127.0.0.1:${String(first.port)}`),
            payload,
            signal,
          ),
      },
    });
    await Promise.allSettled([operation]);
    expect(redirected).toBe(0);
    expect((await readRegistryAlertSnapshot(prepared.context)).events[0].state).toBe('rejected');
  } finally {
    await first.stop(true);
    await second.stop(true);
  }
});

test('durable sending identity and attempt exist before actual receiver acceptance', async () => {
  const prepared = await preparedAlert();
  let persisted: RegistryAlertSnapshot | undefined;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch() {
      persisted = JSON.parse(
        await readFile(join(prepared.context.enrollment.directory, 'current.json'), 'utf8'),
      ) as RegistryAlertSnapshot;
      return new Response('ok');
    },
  });
  try {
    await Promise.allSettled([
      sendRegistryAlert(prepared.context, {
        now: () => tick,
        transport: {
          post: (payload, signal) =>
            postRegistrySlackRequest(
              new URL(`http://127.0.0.1:${String(receiver.port)}`),
              payload,
              signal,
            ),
        },
      }),
    ]);
    expect(persisted?.events[0]).toMatchObject({ state: 'sending', attempts: 1, firstAt: tick });
  } finally {
    await receiver.stop(true);
  }
});

test('acknowledged warning cannot rearm on lower pressure within the same unrecovered incident', async () => {
  const prepared = await preparedAlert();
  await sendRegistryAlert(prepared.context, {
    now: () => tick,
    transport: { post: () => Promise.resolve(new Response('ok')) },
  });
  await updatePressure(prepared, 40 * 1024 ** 3, '2026-11-01T00:00:10.000Z');
  await updatePressure(prepared, 35 * 1024 ** 3, '2026-11-01T00:00:20.000Z');
  expect(
    (await readRegistryAlertSnapshot(prepared.context)).events.map((event) => event.kind),
  ).toEqual(['cleanup-request']);
});

import { readRegistryAlertContext } from './registry-alert-store';
test('fixed root enrollment boundary refuses missing protocol and a marker inside service-writable state', async () => {
  const prepared = await preparedAlert();
  const { protocol, ...unselected } = prepared.context.enrollment;
  expect(protocol).toBe('slack-incoming-webhook');
  expect(
    (await requireRejection(readRegistryAlertContext(() => Promise.resolve(unselected))))
      .throwCause,
  ).toThrow();
  expect(
    (
      await requireRejection(
        readRegistryAlertContext(() =>
          Promise.resolve({ ...prepared.context.enrollment, directory: '/etc/puni' }),
        ),
      )
    ).throwCause,
  ).toThrow('aliases writable state');
});

test('installed sender rejects CLI endpoint overrides before opening enrollment or credentials', async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, 'registry-alert-send-cli.ts'),
      '--endpoint=http://127.0.0.1/forbidden',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, diagnostic] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stderr, 4096, 'fixed sender diagnostic'),
  ]);
  expect(code).toBe(1);
  expect(new TextDecoder().decode(diagnostic)).not.toContain('127.0.0.1');
});

test('state-lock close failure preserves the malformed-state error and modeled cleanup error', async () => {
  const prepared = await preparedAlert(),
    secondary = new Error('modeled lock-close failure');
  await writeFile(join(prepared.context.enrollment.directory, 'current.json'), '{');
  prepared.context.io!.close = async (file) => {
    const inode = (await file.stat()).ino;
    await file.close();
    if (inode === prepared.context.enrollment.stateLockInode) throw secondary;
  };
  const refusal = await requireRejection(readRegistryAlertSnapshot(prepared.context));
  expect(refusal.cause).toBeInstanceOf(AggregateError);
  const causes = (refusal.cause as AggregateError).errors as unknown[];
  expect(causes[0]).toBeInstanceOf(SyntaxError);
  expect(causes[1]).toBe(secondary);
});

test('first-attempt clock rollback refuses before publishing an invalid attempt or posting', async () => {
  const prepared = await preparedAlert();
  let posts = 0;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      posts++;
      return new Response('ok');
    },
  });
  try {
    await requireRejection(
      sendRegistryAlert(prepared.context, {
        now: () => '2026-10-31T23:59:59.000Z',
        transport: {
          post: (payload, signal) =>
            postRegistrySlackRequest(
              new URL(`http://127.0.0.1:${String(receiver.port)}`),
              payload,
              signal,
            ),
        },
      }),
    );
    expect(posts).toBe(0);
    expect((await readRegistryAlertSnapshot(prepared.context)).events[0]).toMatchObject({
      state: 'pending',
      attempts: 0,
      firstAt: null,
    });
  } finally {
    await receiver.stop(true);
  }
});

test('normal capacity while canonically fenced does not rearm a warning', async () => {
  const prepared = await preparedAlert();
  await sendRegistryAlert(prepared.context, {
    now: () => tick,
    transport: { post: () => Promise.resolve(new Response('ok')) },
  });
  await updatePressure(prepared, 45 * 1024 ** 3, '2026-11-01T00:00:10.000Z');
  await updatePressure(prepared, 1024 ** 3, '2026-11-01T00:00:20.000Z');
  const low = JSON.parse(
    await readFile(join(prepared.source.reports, 'report.json'), 'utf8'),
  ) as RegistryPressureReport;
  expect(low.pressure).toBe('normal');
  expect(low.fenced).toBe(true);
  await updatePressure(prepared, 35 * 1024 ** 3, '2026-11-01T00:00:30.000Z');
  expect(
    (await readRegistryAlertSnapshot(prepared.context)).events.map((event) => event.kind),
  ).toEqual(['cutoff']);
});

test('destination Retry-After survives exhausted event and sender restart before another event', async () => {
  const prepared = await preparedAlert();
  await captureRegistryMaintenanceAlert(prepared.context, {
    revision: 1,
    kind: 'backup',
    operationId: 'queued-second',
    identity: hashRegistryAlert('queued-second'),
    at: tick,
    owners: [],
  });
  let posts = 0;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      posts++;
      return posts === 3
        ? new Response('', { status: 429, headers: { 'retry-after': '120' } })
        : new Response(posts <= 2 ? 'retry' : 'ok', { status: posts <= 2 ? 500 : 200 });
    },
  });
  const transport = {
    post: (payload: string, signal: AbortSignal) =>
      postRegistrySlackRequest(
        new URL(`http://127.0.0.1:${String(receiver.port)}`),
        payload,
        signal,
      ),
  };
  try {
    for (let second = 0; second < 3; second++)
      await requireRejection(
        sendRegistryAlert(prepared.context, {
          now: () => new Date(Date.parse(tick) + second * 1000).toISOString(),
          transport,
        }),
      );
    const { readRegistryAlertFixture } = await import('./registry-alert.fixture');
    expect(
      await sendRegistryAlert(await readRegistryAlertFixture(prepared.root), {
        now: () => '2026-11-01T00:00:03.000Z',
        transport,
      }),
    ).toEqual({ state: 'deferred' });
    expect(posts).toBe(3);
  } finally {
    await receiver.stop(true);
  }
});

test('final directory sync after marker removal refuses every fresh read', async () => {
  const prepared = await preparedAlert();
  let injected = false;
  prepared.context.io!.sync = async (file) => {
    const current = JSON.parse(
      await readFile(join(prepared.context.enrollment.directory, 'current.json'), 'utf8'),
    ) as RegistryAlertSnapshot;
    if (
      (await file.stat()).isDirectory() &&
      current.counter === 2 &&
      !(await Bun.file(join(prepared.context.enrollment.directory, 'fault.pending')).exists()) &&
      !injected
    ) {
      injected = true;
      throw new Error('final sync fault');
    }
    await file.sync();
  };
  expect(
    (
      await requireRejection(
        changeRegistryAlerts(prepared.context, (snapshot) => {
          snapshot.counter += 1;
        }),
      )
    ).throwCause,
  ).toThrow('final sync fault');
  const { readRegistryAlertFixture } = await import('./registry-alert.fixture');
  expect(
    (
      await requireRejection(
        readRegistryAlertSnapshot(await readRegistryAlertFixture(prepared.root)),
      )
    ).throwCause,
  ).toThrow('Unresolved alert replacement');
});

import { prepareRegistryAlertAttempt } from './registry-alert-send-cli';
import { enqueueRegistryAlert, reconcileRegistryMaintenanceAlert } from './registry-alert-store';

for (const boundary of ['attempt', 'horizon'] as const) {
  test(`locked ${boundary} admission records exhaustion before persistence validation`, async () => {
    const prepared = await preparedAlert();
    await changeRegistryAlerts(prepared.context, (snapshot) => {
      const event = snapshot.events[0];
      event.state = 'sending';
      event.attempts = boundary === 'attempt' ? 3 : 1;
      event.firstAt = tick;
      event.nextAt = '2026-11-01T00:00:01.000Z';
      snapshot.lastAttemptAt = tick;
      const transition = prepareRegistryAlertAttempt(
        snapshot,
        boundary === 'attempt' ? '2026-11-01T00:00:02.000Z' : '2026-11-01T00:10:00.000Z',
      );
      expect(transition.state).toBe('exhausted');
      expect(event).toMatchObject({ state: 'exhausted', attempts: boundary === 'attempt' ? 3 : 1 });
    });
    expect((await readRegistryAlertSnapshot(prepared.context)).events[0].state).toBe('exhausted');
  });
}

test('destination one-second spacing blocks a fresh second event before HTTP admission', async () => {
  const prepared = await preparedAlert();
  await captureRegistryMaintenanceAlert(prepared.context, {
    revision: 1,
    identity: hashRegistryAlert('spacing-second'),
    kind: 'backup',
    operationId: 'spacing-second',
    at: tick,
    owners: [],
  });
  let posts = 0;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      posts++;
      return new Response('ok');
    },
  });
  const transport = {
    post: (payload: string, signal: AbortSignal) =>
      postRegistrySlackRequest(
        new URL(`http://127.0.0.1:${String(receiver.port)}`),
        payload,
        signal,
      ),
  };
  try {
    await sendRegistryAlert(prepared.context, { now: () => tick, transport });
    expect(
      await sendRegistryAlert(prepared.context, {
        now: () => '2026-11-01T00:00:00.500Z',
        transport,
      }),
    ).toEqual({ state: 'deferred' });
    expect(posts).toBe(1);
    await sendRegistryAlert(prepared.context, { now: () => '2026-11-01T00:00:01.000Z', transport });
    expect(posts).toBe(2);
  } finally {
    await receiver.stop(true);
  }
});

test('event next-at admission remains independent of destination spacing', async () => {
  const prepared = await preparedAlert();
  await requireRejection(
    sendRegistryAlert(prepared.context, {
      now: () => tick,
      transport: { post: () => Promise.resolve(new Response('', { status: 500 })) },
    }),
  );
  await changeRegistryAlerts(prepared.context, (snapshot) => {
    snapshot.events[0].nextAt = '2026-11-01T00:00:10.000Z';
  });
  let posts = 0;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      posts++;
      return new Response('ok');
    },
  });
  try {
    expect(
      await sendRegistryAlert(prepared.context, {
        now: () => '2026-11-01T00:00:02.000Z',
        transport: {
          post: (payload, signal) =>
            postRegistrySlackRequest(
              new URL(`http://127.0.0.1:${String(receiver.port)}`),
              payload,
              signal,
            ),
        },
      }),
    ).toEqual({ state: 'deferred' });
    expect(posts).toBe(0);
  } finally {
    await receiver.stop(true);
  }
});

for (const changed of ['phase', 'attempt', 'payload', 'horizon'] as const) {
  test(`stale acknowledgement cannot confirm changed ${changed} identity`, async () => {
    const prepared = await preparedAlert();
    let posts = 0;
    const receiver = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch() {
        posts++;
        await changeRegistryAlerts(prepared.context, (snapshot) => {
          const event = snapshot.events[0];
          if (changed === 'phase') event.state = 'uncertain';
          if (changed === 'attempt') event.attempts = 2;
          if (changed === 'horizon') event.firstAt = '2026-11-01T00:00:01.000Z';
          if (changed === 'payload') {
            event.remedy = 'changed after submission';
            event.payloadSha256 = hashRegistryAlert(renderRegistryAlert(event));
          }
        });
        return new Response('ok');
      },
    });
    try {
      await Promise.allSettled([
        sendRegistryAlert(prepared.context, {
          now: () => '2026-11-01T00:00:02.000Z',
          transport: {
            post: (payload, signal) =>
              postRegistrySlackRequest(
                new URL(`http://127.0.0.1:${String(receiver.port)}`),
                payload,
                signal,
              ),
          },
        }),
      ]);
      expect(posts).toBe(1);
      const event = (await readRegistryAlertSnapshot(prepared.context)).events[0];
      expect(event.state).toBe(changed === 'phase' ? 'uncertain' : 'sending');
      expect(event.attempts).toBe(changed === 'attempt' ? 2 : 1);
    } finally {
      await receiver.stop(true);
    }
  });
}

for (const boundary of ['counter', 'schema', 'slot'] as const) {
  test(`locked event ${boundary} admission refuses before later snapshot validation`, async () => {
    const prepared = await preparedAlert();
    await changeRegistryAlerts(prepared.context, async (snapshot) => {
      const { id, attempts, firstAt, nextAt, state, payloadSha256, ...draft } = snapshot.events[0];
      expect(id).toContain(':');
      expect(attempts).toBe(0);
      expect(firstAt).toBeNull();
      expect(nextAt).toBeNull();
      expect(state).toBe('pending');
      expect(payloadSha256).toHaveLength(64);
      if (boundary === 'counter') snapshot.counter = Number.MAX_SAFE_INTEGER;
      if (boundary === 'schema') Object.assign(draft, { kind: 'unsupported' });
      if (boundary === 'slot') {
        draft.origin = '\0'.repeat(256);
        draft.remedy = '\0'.repeat(256);
        draft.fence = { state: 'fenced', reason: '\0'.repeat(256) };
        draft.owners = {
          scope: 'explicit-canonical-obligations',
          count: 8,
          omitted: 0,
          names: Array.from({ length: 8 }, (_, index) => '\0'.repeat(127) + String(index)),
        };
      }
      const refused = await requireRejection(
        enqueueRegistryAlert(prepared.context, snapshot, draft),
      );
      expect(refused.throwCause).toThrow();
      expect(snapshot.events).toHaveLength(1);
      if (boundary === 'schema' || boundary === 'slot') snapshot.counter = 1;
    });
  });
}

for (const phase of [
  'final-marker-sync',
  'final-marker-directory-sync',
  'final-marker-close',
  'publication-close',
] as const) {
  test(`modeled ${phase} failure retains pre-existing finalization evidence`, async () => {
    const prepared = await preparedAlert(),
      directory = prepared.context.enrollment.directory,
      fault = new Error(`${phase} fault`);
    let injected = false;
    const matches = async (file: FileHandle) => {
      const status = await file.stat(),
        pending = join(directory, 'pending.json');
      if (!(await Bun.file(pending).exists())) return false;
      const current = JSON.parse(
        await readFile(join(directory, 'current.json'), 'utf8'),
      ) as RegistryAlertSnapshot;
      if (current.counter !== 2) return false;
      if (phase === 'final-marker-directory-sync')
        return status.isDirectory() && (await Bun.file(join(directory, 'fault.pending')).exists());
      if (phase === 'publication-close')
        return (
          status.isFile() &&
          status.ino === (await lstat(join(directory, 'current.json'))).ino &&
          !(await Bun.file(join(directory, 'fault.pending')).exists())
        );
      return status.isFile() && status.ino === (await lstat(pending)).ino;
    };
    prepared.context.io!.sync = async (file) => {
      if (
        !injected &&
        (phase === 'final-marker-sync' || phase === 'final-marker-directory-sync') &&
        (await matches(file))
      ) {
        injected = true;
        throw fault;
      }
      await file.sync();
    };
    prepared.context.io!.close = async (file) => {
      // The modeled failed acknowledgement follows a real close; retrying it must expose the already closed descriptor.
      await file.stat();
      const fails =
        !injected &&
        (phase === 'final-marker-close' || phase === 'publication-close') &&
        (await matches(file));
      await file.close();
      if (fails) {
        injected = true;
        throw fault;
      }
    };
    const refusal = await requireRejection(
      changeRegistryAlerts(prepared.context, (snapshot) => {
        snapshot.counter += 1;
      }),
    );
    expect(injected).toBe(true);
    expect(refusal.cause).toBe(fault);
    const { readRegistryAlertFixture } = await import('./registry-alert.fixture');
    expect(
      (
        await requireRejection(
          readRegistryAlertSnapshot(await readRegistryAlertFixture(prepared.root)),
        )
      ).throwCause,
    ).toThrow('Unresolved alert replacement');
  });
}

test('final directory sync and publication close failures preserve both causes and evidence', async () => {
  const prepared = await preparedAlert(),
    directory = prepared.context.enrollment.directory,
    primary = new Error('final directory sync primary'),
    cleanup = new Error('publication close secondary');
  let injected = false;
  prepared.context.io!.sync = async (file) => {
    if (
      !injected &&
      (await file.stat()).isDirectory() &&
      (await Bun.file(join(directory, 'pending.json')).exists()) &&
      !(await Bun.file(join(directory, 'fault.pending')).exists())
    ) {
      injected = true;
      throw primary;
    }
    await file.sync();
  };
  prepared.context.io!.close = async (file) => {
    const isPublication =
      injected && (await file.stat()).ino === (await lstat(join(directory, 'current.json'))).ino;
    await file.close();
    if (isPublication) throw cleanup;
  };
  const refusal = await requireRejection(
    changeRegistryAlerts(prepared.context, (snapshot) => {
      snapshot.counter += 1;
    }),
  );
  expect((refusal.cause as AggregateError).errors).toEqual([primary, cleanup]);
  const { readRegistryAlertFixture } = await import('./registry-alert.fixture');
  expect(
    (
      await requireRejection(
        readRegistryAlertSnapshot(await readRegistryAlertFixture(prepared.root)),
      )
    ).throwCause,
  ).toThrow('Unresolved alert replacement');
});

test('marker removal error preserves existing evidence and primary permission error', async () => {
  const prepared = await preparedAlert(),
    directory = prepared.context.enrollment.directory;
  let injected = false;
  prepared.context.io!.sync = async (file) => {
    await file.sync();
    if (
      !injected &&
      (await file.stat()).isDirectory() &&
      (await Bun.file(join(directory, 'pending.json')).exists()) &&
      (await Bun.file(join(directory, 'fault.pending')).exists()) &&
      (JSON.parse(await readFile(join(directory, 'current.json'), 'utf8')) as RegistryAlertSnapshot)
        .counter === 2
    ) {
      injected = true;
      await writeFile(join(directory, 'fault.pending'), 'preserve-existing-evidence');
      await chmod(directory, 0o500);
    }
  };
  let refusal: Awaited<ReturnType<typeof requireRejection>>;
  try {
    refusal = await requireRejection(
      changeRegistryAlerts(prepared.context, (snapshot) => {
        snapshot.counter += 1;
      }),
    );
  } finally {
    await chmod(directory, 0o700);
  }
  expect(refusal.cause).toMatchObject({ code: 'EACCES', syscall: 'unlink' });
  expect(await readFile(join(directory, 'fault.pending'), 'utf8')).toBe(
    'preserve-existing-evidence',
  );
  const { readRegistryAlertFixture } = await import('./registry-alert.fixture');
  expect(
    (
      await requireRejection(
        readRegistryAlertSnapshot(await readRegistryAlertFixture(prepared.root)),
      )
    ).throwCause,
  ).toThrow('Unresolved alert replacement');
});

test('successful finalization removes only its bounded transaction files', async () => {
  const prepared = await preparedAlert();
  prepared.context.io!.sync = async (file) => {
    if (
      (await file.stat()).isDirectory() &&
      (
        JSON.parse(
          await readFile(join(prepared.context.enrollment.directory, 'current.json'), 'utf8'),
        ) as RegistryAlertSnapshot
      ).counter === 2 &&
      !(await Bun.file(join(prepared.context.enrollment.directory, 'pending.json')).exists()) &&
      !(await Bun.file(join(prepared.context.enrollment.directory, 'fault.pending')).exists())
    )
      throw new Error('Commit-critical sync has no pre-existing recovery evidence');
    await file.sync();
  };
  const completion = await changeRegistryAlerts(prepared.context, (snapshot) => {
    snapshot.counter += 1;
  }).then(
    () => ({ state: 'completed' as const }),
    (cause: unknown) => ({ state: 'failed' as const, cause }),
  );
  expect(completion).toEqual({ state: 'completed' });
  expect((await readdir(prepared.context.enrollment.directory)).sort()).toEqual([
    'current.json',
    'send.lock',
    'state.lock',
  ]);
  expect((await readRegistryAlertSnapshot(prepared.context)).counter).toBe(2);
});

for (const phase of ['marker', 'before-publish', 'contents'] as const) {
  test(`modeled ${phase} sync failure preserves the prior durable snapshot`, async () => {
    const prepared = await preparedAlert(),
      directory = prepared.context.enrollment.directory,
      before = await readFile(join(directory, 'current.json'), 'utf8'),
      fault = new Error(`${phase} sync fault`);
    let injected = false;
    prepared.context.io!.sync = async (file) => {
      const stat = await file.stat(),
        current = JSON.parse(
          await readFile(join(directory, 'current.json'), 'utf8'),
        ) as RegistryAlertSnapshot;
      const contents =
        !injected &&
        phase === 'contents' &&
        stat.isFile() &&
        stat.ino === (await lstat(join(directory, 'pending.json'))).ino;
      const matches =
        phase === 'marker'
          ? stat.isFile() && stat.size === Buffer.byteLength('snapshot-replacement\n')
          : phase === 'contents'
            ? contents
            : stat.isDirectory() && current.counter === 1;
      if (matches && !injected) {
        injected = true;
        throw fault;
      }
      await file.sync();
    };
    const refusal = await requireRejection(
      changeRegistryAlerts(prepared.context, (snapshot) => {
        snapshot.counter += 1;
      }),
    );
    expect(refusal.cause).toBe(fault);
    expect(await readFile(join(directory, 'current.json'), 'utf8')).toBe(before);
    expect((await readdir(directory)).sort()).toEqual(['current.json', 'send.lock', 'state.lock']);
  });
}

for (const fault of ['fault-schema', 'fault-binding', 'failure-cursor-pair'] as const) {
  test(`stored ${fault} contradiction refuses fresh use`, async () => {
    const prepared = await preparedAlert(),
      directory = prepared.context.enrollment.directory;
    if (fault === 'failure-cursor-pair') {
      await captureRegistryMaintenanceAlert(prepared.context, {
        revision: 1,
        identity: hashRegistryAlert('cursor'),
        kind: 'backup',
        operationId: 'cursor',
        at: tick,
        owners: [],
      });
      const current = JSON.parse(
        await readFile(join(directory, 'current.json'), 'utf8'),
      ) as RegistryAlertSnapshot;
      current.failureIdentity = null;
      await writeFile(join(directory, 'current.json'), JSON.stringify(current));
    } else
      await writeFile(
        join(directory, 'fault.json'),
        JSON.stringify({
          schemaVersion: fault === 'fault-schema' ? 2 : 1,
          enrollmentId:
            fault === 'fault-binding'
              ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
              : prepared.context.enrollment.enrollmentId,
          state: 'full',
          at: tick,
        }),
        { mode: 0o600 },
      );
    expect(
      (await requireRejection(readRegistryAlertSnapshot(prepared.context))).throwCause,
    ).toThrow();
  });
}

test('output schema rejects a broken internal projection before publication', async () => {
  const prepared = await preparedAlert(),
    path = join(prepared.context.enrollment.directory, 'current.json'),
    before = await readFile(path, 'utf8');
  await Promise.allSettled([
    changeRegistryAlerts(prepared.context, (snapshot) => {
      snapshot.counter = -1;
    }),
  ]);
  expect(await readFile(path, 'utf8')).toBe(before);
});

test('snapshot replacement byte cap rejects a large typed internal projection before IO', async () => {
  const prepared = await preparedAlert(),
    path = join(prepared.context.enrollment.directory, 'current.json'),
    before = await readFile(path, 'utf8');
  await Promise.allSettled([
    changeRegistryAlerts(prepared.context, (snapshot) => {
      const base = snapshot.events[0];
      snapshot.counter = 32;
      snapshot.events = Array.from({ length: 32 }, (_, index) => ({
        ...base,
        id: `${snapshot.enrollmentId}:${String(index + 1)}`,
        origin: '\0'.repeat(256),
        registryId: '\0'.repeat(256),
        remedy: '\0'.repeat(256),
        fence: { state: 'fenced' as const, reason: '\0'.repeat(256) },
        owners: {
          scope: 'explicit-canonical-obligations' as const,
          count: 8,
          omitted: 0,
          names: Array.from({ length: 8 }, (_, owner) => '\0'.repeat(127) + String(owner)),
        },
      }));
    }),
  ]);
  expect((await lstat(path)).size).toBeLessThanOrEqual(256 * 1024);
  expect(await readFile(path, 'utf8')).toBe(before);
});

test('exclusive replacement cannot overwrite a colliding pending file', async () => {
  const prepared = await preparedAlert(),
    directory = prepared.context.enrollment.directory,
    before = await readFile(join(directory, 'current.json'), 'utf8');
  await Promise.allSettled([
    changeRegistryAlerts(prepared.context, async (snapshot) => {
      await writeFile(join(directory, 'pending.json'), 'unresolved-foreign-evidence', {
        mode: 0o600,
      });
      snapshot.counter += 1;
    }),
  ]);
  expect(await readFile(join(directory, 'current.json'), 'utf8')).toBe(before);
  expect(await readFile(join(directory, 'pending.json'), 'utf8')).toBe(
    'unresolved-foreign-evidence',
  );
});

test('sender restart exhausts a killed third attempt without a fourth HTTP request', async () => {
  const prepared = await preparedAlert();
  let posts = 0,
    arrived: () => void = () => {
      throw new Error('missing third request');
    },
    release: () => void = () => {
      throw new Error('missing release');
    };
  const third = new Promise<void>((resolve) => {
      arrived = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch() {
      posts++;
      if (posts === 3) {
        arrived();
        await gate;
      }
      return new Response('', { status: 500 });
    },
  });
  const transport = {
    post: (payload: string, signal: AbortSignal) =>
      postRegistrySlackRequest(
        new URL(`http://127.0.0.1:${String(receiver.port)}`),
        payload,
        signal,
      ),
  };
  let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
  try {
    for (let second = 0; second < 2; second++)
      await requireRejection(
        sendRegistryAlert(prepared.context, {
          now: () => new Date(Date.parse(tick) + second * 1000).toISOString(),
          transport,
        }),
      );
    await writeFile(
      join(prepared.root, 'receiver.json'),
      JSON.stringify({
        url: `http://127.0.0.1:${String(receiver.port)}`,
        now: '2026-11-01T00:00:02.000Z',
      }),
    );
    child = Bun.spawn(
      [process.execPath, join(import.meta.dir, 'registry-alert.fixture.ts'), prepared.root, 'send'],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    );
    await Promise.race([
      third,
      Bun.sleep(3000).then(() => {
        throw new Error('Third attempt did not reach receiver');
      }),
    ]);
    child.kill('SIGKILL');
    await child.exited;
    release();
    expect((await readRegistryAlertSnapshot(prepared.context)).events[0]).toMatchObject({
      state: 'sending',
      attempts: 3,
    });
    await requireRejection(
      sendRegistryAlert(prepared.context, { now: () => '2026-11-01T00:00:03.000Z', transport }),
    );
    expect(posts).toBe(3);
    expect((await readRegistryAlertSnapshot(prepared.context)).events[0]).toMatchObject({
      state: 'exhausted',
      attempts: 3,
    });
  } finally {
    release();
    if (child !== undefined) {
      if (child.exitCode === null) child.kill('SIGKILL');
      await child.exited;
    }
    await receiver.stop(true);
  }
});

test('elapsed ten-minute horizon refuses an actual new HTTP admission', async () => {
  const prepared = await preparedAlert();
  let posts = 0;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      posts++;
      return new Response('', { status: 500 });
    },
  });
  const transport = {
    post: (payload: string, signal: AbortSignal) =>
      postRegistrySlackRequest(
        new URL(`http://127.0.0.1:${String(receiver.port)}`),
        payload,
        signal,
      ),
  };
  try {
    await requireRejection(sendRegistryAlert(prepared.context, { now: () => tick, transport }));
    await requireRejection(
      sendRegistryAlert(prepared.context, { now: () => '2026-11-01T00:10:00.000Z', transport }),
    );
    expect(posts).toBe(1);
    expect((await readRegistryAlertSnapshot(prepared.context)).events[0]).toMatchObject({
      state: 'exhausted',
      attempts: 1,
    });
  } finally {
    await receiver.stop(true);
  }
});

test('canonical source identity mismatch refuses before any HTTP request', async () => {
  const prepared = await preparedAlert(),
    path = join(prepared.source.directory, 'journal.json');
  const { readRegistryJournalSnapshot } = await import('./registry-managed-journal');
  const current = await readRegistryJournalSnapshot(prepared.source.directory);
  current.enrollment.storageId = 'foreign';
  await writeFile(path, JSON.stringify(current));
  let posts = 0;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      posts++;
      return new Response('ok');
    },
  });
  try {
    await Promise.allSettled([
      sendRegistryAlert(prepared.context, {
        now: () => tick,
        transport: {
          post: (payload, signal) =>
            postRegistrySlackRequest(
              new URL(`http://127.0.0.1:${String(receiver.port)}`),
              payload,
              signal,
            ),
        },
      }),
    ]);
    expect(posts).toBe(0);
    expect((await readRegistryAlertSnapshot(prepared.context)).events[0].state).toBe('pending');
  } finally {
    await receiver.stop(true);
  }
});

test('canonical path binding refuses a same-identity failure from another directory', async () => {
  const prepared = await preparedAlert(),
    other = await scratchAsync('registry-alert-foreign-journal-');
  await writeFile(join(other, 'sample.json'), JSON.stringify({ usedBytes: 1024 ** 3, at: tick }));
  const foreign = await initializeRegistryPressureFixture(other);
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  await executeRegistryCommand(
    foreign.directory,
    { command: 'upgrade-maintenance' },
    foreign.ports,
  );
  await requireRejection(
    runRegistryMaintenance(
      foreign.directory,
      { operationId: 'foreign-path-failure', owner: 'owner', kind: 'backup', recover: false },
      foreign.ports,
      () => Promise.reject(new Error('modeled failure')),
    ),
  );
  const before = await readRegistryAlertSnapshot(prepared.context);
  await Promise.allSettled([
    reconcileRegistryMaintenanceAlert(prepared.context, foreign.directory),
  ]);
  expect(await readRegistryAlertSnapshot(prepared.context)).toEqual(before);
});

test('failed canonical observation below captured revision cannot replace the failure cursor', async () => {
  const prepared = await preparedAlert();
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  await executeRegistryCommand(
    prepared.source.directory,
    { command: 'upgrade-maintenance' },
    prepared.source.ports,
  );
  await requireRejection(
    runRegistryMaintenance(
      prepared.source.directory,
      { operationId: 'stale-canonical', owner: 'owner', kind: 'backup', recover: false },
      prepared.source.ports,
      () => Promise.reject(new Error('modeled failure')),
    ),
  );
  await captureRegistryMaintenanceAlert(prepared.context, {
    revision: 100,
    identity: hashRegistryAlert('newer-failure'),
    kind: 'backup',
    operationId: 'newer-failure',
    at: tick,
    owners: [],
  });
  const before = await readRegistryAlertSnapshot(prepared.context);
  await reconcileRegistryMaintenanceAlert(prepared.context);
  expect(await readRegistryAlertSnapshot(prepared.context)).toEqual(before);
});

test('invalid failure revision is refused rather than silently treated as an old observation', async () => {
  const prepared = await preparedAlert();
  await requireRejection(
    captureRegistryMaintenanceAlert(prepared.context, {
      revision: -1,
      identity: hashRegistryAlert('invalid-revision'),
      kind: 'backup',
      operationId: 'invalid-revision',
      at: tick,
      owners: [],
    }),
  );
  expect((await readRegistryAlertSnapshot(prepared.context)).counter).toBe(1);
});

test('regressed admission clock throws before a benign deferred transition can hide it', async () => {
  const prepared = await preparedAlert();
  await changeRegistryAlerts(prepared.context, (snapshot) => {
    snapshot.lastAttemptAt = '2026-11-01T00:00:02.000Z';
    expect(() => prepareRegistryAlertAttempt(snapshot, '2026-11-01T00:00:01.000Z')).toThrow(
      'clock regressed',
    );
    snapshot.lastAttemptAt = null;
  });
});

test('regressed acknowledgement clock cannot publish confirmation', async () => {
  const prepared = await preparedAlert();
  let observations = 0;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      return new Response('ok');
    },
  });
  try {
    await Promise.allSettled([
      sendRegistryAlert(prepared.context, {
        now: () => (++observations <= 2 ? '2026-11-01T00:00:02.000Z' : '2026-11-01T00:00:01.000Z'),
        transport: {
          post: (payload, signal) =>
            postRegistrySlackRequest(
              new URL(`http://127.0.0.1:${String(receiver.port)}`),
              payload,
              signal,
            ),
        },
      }),
    ]);
    expect((await readRegistryAlertSnapshot(prepared.context)).events[0].state).toBe('sending');
  } finally {
    await receiver.stop(true);
  }
});

import { postRegistryAlert } from './registry-alert-slack';

test('HTTP acknowledgement overflow cancels the observed upstream body even when outcome stays uncertain', async () => {
  const prepared = await preparedAlert();
  let cancelled = false;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      return new Response('x'.repeat(4097));
    },
  });
  try {
    await requireRejection(
      sendRegistryAlert(prepared.context, {
        now: () => tick,
        transport: {
          post: async (payload, signal) => {
            const response = await postRegistrySlackRequest(
              new URL(`http://127.0.0.1:${String(receiver.port)}`),
              payload,
              signal,
            );
            if (response.body === null) throw new Error('Owned receiver body missing');
            const upstream = response.body.getReader();
            return new Response(
              new ReadableStream<Uint8Array>(
                {
                  async pull(controller) {
                    const chunk = await upstream.read();
                    if (chunk.done) {
                      controller.close();
                      upstream.releaseLock();
                    } else controller.enqueue(chunk.value);
                  },
                  async cancel(reason) {
                    cancelled = true;
                    try {
                      await upstream.cancel(reason);
                    } finally {
                      upstream.releaseLock();
                    }
                  },
                },
                { highWaterMark: 0 },
              ),
              { status: response.status },
            );
          },
        },
      }),
    );
    expect(cancelled).toBe(true);
  } finally {
    await receiver.stop(true);
  }
});

test('encoded request byte bound prevents an actual HTTP submission', async () => {
  let posts = 0;
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      await request.text();
      posts++;
      return new Response('ok');
    },
  });
  try {
    await Promise.allSettled([
      postRegistryAlert(
        {
          post: (payload, signal) =>
            postRegistrySlackRequest(
              new URL(`http://127.0.0.1:${String(receiver.port)}`),
              payload,
              signal,
            ),
        },
        JSON.stringify({ text: 'a'.repeat(8192) }),
        new AbortController().signal,
      ),
    ]);
    expect(posts).toBe(0);
  } finally {
    await receiver.stop(true);
  }
});

test('bounded rendered text rejects expansion before producing a request body', async () => {
  const prepared = await preparedAlert(),
    event = (await readRegistryAlertSnapshot(prepared.context)).events[0];
  event.registryId = '&'.repeat(256);
  event.fence = { state: 'fenced', reason: '&'.repeat(256) };
  event.remedy = '&'.repeat(256);
  event.owners = {
    scope: 'explicit-canonical-obligations',
    count: 8,
    omitted: 0,
    names: Array.from({ length: 8 }, (_, index) => '&'.repeat(127) + String(index)),
  };
  expect(() => renderRegistryAlert(event)).toThrow('text exceeds');
});

for (const milliseconds of [0, 10001, 1.5]) {
  test(`invalid request deadline ${String(milliseconds)} refuses before the request port`, async () => {
    const prepared = await preparedAlert();
    let posts = 0;
    await Promise.allSettled([
      sendRegistryAlert(prepared.context, {
        now: () => tick,
        requestMilliseconds: milliseconds,
        transport: {
          post: () => {
            posts++;
            return Promise.resolve(new Response('ok'));
          },
        },
      }),
    ]);
    expect(posts).toBe(0);
  });
}

for (const header of [null, 'not-an-integer']) {
  test(`invalid Retry-After ${String(header)} records corrective rejection`, async () => {
    const prepared = await preparedAlert();
    const receiver = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch() {
        return new Response('', {
          status: 429,
          headers: header === null ? {} : { 'retry-after': header },
        });
      },
    });
    try {
      await Promise.allSettled([
        sendRegistryAlert(prepared.context, {
          now: () => tick,
          transport: {
            post: (payload, signal) =>
              postRegistrySlackRequest(
                new URL(`http://127.0.0.1:${String(receiver.port)}`),
                payload,
                signal,
              ),
          },
        }),
      ]);
      expect((await readRegistryAlertSnapshot(prepared.context)).events[0].state).toBe('rejected');
    } finally {
      await receiver.stop(true);
    }
  });
}

import { projectRegistryAlertOwners } from './registry-alert-store';
for (const boundary of ['count', 'length', 'bytes'] as const) {
  test(`owner ${boundary} projection is bounded before event-schema validation`, () => {
    const owners =
      boundary === 'count'
        ? Array.from({ length: 10 }, (_, index) => `owner-${String(index)}`)
        : boundary === 'length'
          ? ['short', 'x'.repeat(129)]
          : Array.from({ length: 8 }, (_, index) => '\\'.repeat(127) + String(index));
    const projected = projectRegistryAlertOwners(owners);
    expect(projected.count).toBe(owners.length);
    expect(projected.count).toBe(projected.names.length + projected.omitted);
    if (boundary === 'count') expect(projected.names).toHaveLength(8);
    if (boundary === 'length') expect(projected.names).toEqual(['short']);
    if (boundary === 'bytes')
      expect(Buffer.byteLength(JSON.stringify(projected.names))).toBeLessThanOrEqual(1024);
  });
}

test('state-lock contention has a bounded busy outcome under a held real lock', async () => {
  const prepared = await preparedAlert();
  let entered: () => void = () => {
      throw new Error('missing lock readiness');
    },
    release: () => void = () => {
      throw new Error('missing lock release');
    };
  const ready = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  const writer = changeRegistryAlerts(prepared.context, async (snapshot) => {
    entered();
    await gate;
    snapshot.counter += 1;
  });
  await ready;
  const reader = readRegistryAlertSnapshot(prepared.context);
  let outcome: string;
  try {
    outcome = await Promise.race([
      reader.then(
        () => 'accepted',
        (cause: unknown) => {
          if (cause instanceof Error && cause.message === 'Alert store is busy') return 'busy';
          throw cause;
        },
      ),
      Bun.sleep(1800).then(() => 'late'),
    ]);
  } finally {
    release();
    await writer;
    await Promise.allSettled([reader]);
  }
  expect(outcome).toBe('busy');
});

test('a shorter Retry-After cannot overwrite a stronger persisted destination deadline', async () => {
  const prepared = await preparedAlert();
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch() {
      await changeRegistryAlerts(prepared.context, (snapshot) => {
        snapshot.destinationNotBefore = '2026-11-01T00:02:00.000Z';
      });
      return new Response('', { status: 429, headers: { 'retry-after': '2' } });
    },
  });
  try {
    await requireRejection(
      sendRegistryAlert(prepared.context, {
        now: () => tick,
        transport: {
          post: (payload, signal) =>
            postRegistrySlackRequest(
              new URL(`http://127.0.0.1:${String(receiver.port)}`),
              payload,
              signal,
            ),
        },
      }),
    );
    expect((await readRegistryAlertSnapshot(prepared.context)).destinationNotBefore).toBe(
      '2026-11-01T00:02:00.000Z',
    );
  } finally {
    await receiver.stop(true);
  }
});

test('periodic reconciliation does not invent a failure for active ordinary maintenance', async () => {
  const prepared = await preparedAlert();
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  await executeRegistryCommand(
    prepared.source.directory,
    { command: 'upgrade-maintenance' },
    prepared.source.ports,
  );
  let entered: () => void = () => {
      throw new Error('missing active operation');
    },
    release: () => void = () => {
      throw new Error('missing release');
    };
  const ready = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  const operation = runRegistryMaintenance(
    prepared.source.directory,
    { operationId: 'active-operation', owner: 'owner', kind: 'backup', recover: false },
    prepared.source.ports,
    async () => {
      entered();
      await gate;
      throw new Error('controlled fixture completion');
    },
  );
  await ready;
  try {
    await Promise.allSettled([reconcileRegistryMaintenanceAlert(prepared.context)]);
    expect(
      (await readRegistryAlertSnapshot(prepared.context)).events.map((event) => event.kind),
    ).toEqual(['warning']);
  } finally {
    release();
    await requireRejection(operation);
  }
});

test('periodic reconciliation does not relabel a durable restore failure as backup or launcher', async () => {
  const prepared = await preparedAlert();
  const { runRegistryMaintenance, readRegistryJournalSnapshot } =
    await import('./registry-managed-journal');
  await executeRegistryCommand(
    prepared.source.directory,
    { command: 'upgrade-maintenance' },
    prepared.source.ports,
  );
  await requireRejection(
    runRegistryMaintenance(
      prepared.source.directory,
      { operationId: 'restore-selection', owner: 'owner', kind: 'backup', recover: false },
      prepared.source.ports,
      () => Promise.reject(new Error('modeled failure')),
    ),
  );
  const current = await readRegistryJournalSnapshot(prepared.source.directory);
  if (current.maintenance === null) throw new Error('Missing modeled failed operation');
  current.maintenance.kind = 'restore';
  await writeFile(join(prepared.source.directory, 'journal.json'), JSON.stringify(current));
  await Promise.allSettled([reconcileRegistryMaintenanceAlert(prepared.context)]);
  expect(
    (await readRegistryAlertSnapshot(prepared.context)).events.map((event) => event.kind),
  ).toEqual(['warning']);
});

test('launcher replay time cannot create another durable incident', async () => {
  const prepared = await preparedAlert();
  const failure = {
    revision: 0,
    kind: 'launcher' as const,
    operationId: 'same-launcher',
    at: tick,
    owners: [],
  };
  await captureRegistryMaintenanceAlert(prepared.context, failure);
  const before = await readRegistryAlertSnapshot(prepared.context);
  await captureRegistryMaintenanceAlert(prepared.context, failure);
  expect(await readRegistryAlertSnapshot(prepared.context)).toEqual(before);
});

test('foreign pressure identity cannot advance a durable observation watermark', async () => {
  const prepared = await preparedAlert(),
    report = JSON.parse(
      await readFile(join(prepared.source.reports, 'report.json'), 'utf8'),
    ) as RegistryPressureReport;
  report.storageId = 'foreign';
  report.measurement.at = '2026-11-01T00:00:10.000Z';
  const before = await readRegistryAlertSnapshot(prepared.context);
  await Promise.allSettled([captureRegistryPressureAlert(prepared.context, report)]);
  expect(await readRegistryAlertSnapshot(prepared.context)).toEqual(before);
});

test('canonical timestamp schema rejects malformed stored observation time', async () => {
  const prepared = await preparedAlert(),
    path = join(prepared.context.enrollment.directory, 'current.json');
  const current = JSON.parse(await readFile(path, 'utf8')) as RegistryAlertSnapshot;
  current.pressure.at = 'invalid-time';
  await writeFile(path, JSON.stringify(current));
  await requireRejection(readRegistryAlertSnapshot(prepared.context));
});

test('outbox context schema refuses unsupported protocol before reading bound state', async () => {
  const prepared = await preparedAlert(),
    path = join(prepared.context.enrollment.directory, 'current.json');
  Object.assign(prepared.context.enrollment, { protocol: 'unsupported' });
  const current = JSON.parse(await readFile(path, 'utf8')) as RegistryAlertSnapshot;
  current.configSha256 = hashRegistryAlert(JSON.stringify(prepared.context.enrollment));
  await writeFile(path, JSON.stringify(current));
  await requireRejection(readRegistryAlertSnapshot(prepared.context));
});

test('final sync plus marker creation refusal stays blocked after directory permissions return', async () => {
  const prepared = await preparedAlert(),
    directory = prepared.context.enrollment.directory,
    primary = new Error('modeled final directory sync failure');
  let injected = false,
    markerCreation: Awaited<ReturnType<typeof requireRejection>> | undefined;
  prepared.context.io!.sync = async (file) => {
    if (!injected && (await file.stat()).isDirectory()) {
      const current = JSON.parse(
        await readFile(join(directory, 'current.json'), 'utf8'),
      ) as RegistryAlertSnapshot;
      if (current.counter === 2 && !(await Bun.file(join(directory, 'fault.pending')).exists())) {
        injected = true;
        await chmod(directory, 0o500);
        const { open } = await import('node:fs/promises');
        markerCreation = await requireRejection(
          open(join(directory, 'fault.pending'), 'wx', 0o600),
        );
        throw primary;
      }
    }
    await file.sync();
  };
  let refusal: Awaited<ReturnType<typeof requireRejection>>;
  try {
    refusal = await requireRejection(
      changeRegistryAlerts(prepared.context, (snapshot) => {
        snapshot.counter += 1;
      }),
    );
  } finally {
    await chmod(directory, 0o700);
  }
  expect(injected).toBe(true);
  expect(markerCreation?.cause).toMatchObject({ code: 'EACCES', syscall: 'open' });
  expect(
    refusal.cause instanceof AggregateError ? refusal.cause.errors : [refusal.cause],
  ).toContain(primary);
  const { readRegistryAlertFixture } = await import('./registry-alert.fixture');
  expect(
    (
      await requireRejection(
        readRegistryAlertSnapshot(await readRegistryAlertFixture(prepared.root)),
      )
    ).throwCause,
  ).toThrow();
});

for (const fault of ['permission', 'existing-entry'] as const) {
  test(`final marker creation ${fault} retains the original recovery marker`, async () => {
    const prepared = await preparedAlert(),
      directory = prepared.context.enrollment.directory;
    let injected = false;
    prepared.context.io!.sync = async (file) => {
      await file.sync();
      if (
        !injected &&
        (await file.stat()).isDirectory() &&
        (
          JSON.parse(
            await readFile(join(directory, 'current.json'), 'utf8'),
          ) as RegistryAlertSnapshot
        ).counter === 2 &&
        !(await Bun.file(join(directory, 'pending.json')).exists())
      ) {
        injected = true;
        if (fault === 'permission') await chmod(directory, 0o500);
        else
          await writeFile(
            join(directory, 'pending.json'),
            'preserve-existing-finalization-evidence',
            { mode: 0o600 },
          );
      }
    };
    let refusal: Awaited<ReturnType<typeof requireRejection>>;
    try {
      refusal = await requireRejection(
        changeRegistryAlerts(prepared.context, (snapshot) => {
          snapshot.counter += 1;
        }),
      );
    } finally {
      await chmod(directory, 0o700);
    }
    expect(injected).toBe(true);
    expect(refusal.cause).toMatchObject({
      code: fault === 'permission' ? 'EACCES' : 'EEXIST',
      syscall: 'open',
    });
    expect(await Bun.file(join(directory, 'fault.pending')).exists()).toBe(true);
    if (fault === 'existing-entry')
      expect(await readFile(join(directory, 'pending.json'), 'utf8')).toBe(
        'preserve-existing-finalization-evidence',
      );
    const { readRegistryAlertFixture } = await import('./registry-alert.fixture');
    expect(
      (
        await requireRejection(
          readRegistryAlertSnapshot(await readRegistryAlertFixture(prepared.root)),
        )
      ).throwCause,
    ).toThrow('Unresolved alert replacement');
  });
}

test('last cleanup unlink permission refusal retains durable finalization evidence', async () => {
  const prepared = await preparedAlert(),
    directory = prepared.context.enrollment.directory;
  let injected = false;
  prepared.context.io!.close = async (file) => {
    const status = await file.stat();
    const isPublication =
      status.isFile() &&
      status.ino === (await lstat(join(directory, 'current.json'))).ino &&
      (await Bun.file(join(directory, 'pending.json')).exists()) &&
      !(await Bun.file(join(directory, 'fault.pending')).exists());
    await file.close();
    if (!injected && isPublication) {
      injected = true;
      await chmod(directory, 0o500);
    }
  };
  let refusal: Awaited<ReturnType<typeof requireRejection>>;
  try {
    refusal = await requireRejection(
      changeRegistryAlerts(prepared.context, (snapshot) => {
        snapshot.counter += 1;
      }),
    );
  } finally {
    await chmod(directory, 0o700);
  }
  expect(injected).toBe(true);
  expect(refusal.cause).toMatchObject({ code: 'EACCES', syscall: 'unlink' });
  expect(await Bun.file(join(directory, 'pending.json')).exists()).toBe(true);
  const { readRegistryAlertFixture } = await import('./registry-alert.fixture');
  expect(
    (
      await requireRejection(
        readRegistryAlertSnapshot(await readRegistryAlertFixture(prepared.root)),
      )
    ).throwCause,
  ).toThrow('Unresolved alert replacement');
});
