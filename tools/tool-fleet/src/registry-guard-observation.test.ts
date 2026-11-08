import { createHash } from 'node:crypto';
import {
  chmod,
  link,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  observeRegistryFixturePermission,
  verifyRegistrySupervisorAcknowledgement,
} from './registry-guard-observation.fixture';

async function expectFixtureRefusal(action: Promise<unknown>, message?: string): Promise<void> {
  const failure = await action.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  if (message !== undefined) expect((failure as Error).message).toContain(message);
}

async function fixture(run: (directory: string, permit: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'task8-guard-observation-'));
  const canonical = JSON.stringify({ fenced: false, revision: 1 });
  const hash = createHash('sha256').update(canonical).digest('hex');
  const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  const issued = Math.floor(Number((await readFile('/proc/uptime', 'utf8')).split(' ')[0]));
  const permit = `1 ${boot} ${String(issued)} ${String(issued + 30)} ${hash} ${hash}\n`;
  try {
    await writeFile(join(directory, 'journal.json'), canonical, { mode: 0o600 });
    await writeFile(join(directory, 'writable.permit'), permit, { mode: 0o600 });
    await run(directory, permit);
  } finally {
    await rm(directory, { recursive: true });
  }
}
const uid = process.getuid!();
const owner = { uid, gid: process.getgid!() };
test('coherent actual files expose only current permission and fence booleans', () =>
  fixture(async (directory) => {
    expect(await observeRegistryFixturePermission(directory, owner)).toEqual({
      state: 'coherent',
      permitsWrites: true,
      fenced: false,
    });
  }));
test('atomic same-byte permit replacement is transition, not a coherent pair', () =>
  fixture(async (directory, permit) => {
    expect(
      await observeRegistryFixturePermission(directory, owner, async () => {
        await writeFile(join(directory, 'next'), permit, { mode: 0o600 });
        await rename(join(directory, 'next'), join(directory, 'writable.permit'));
      }),
    ).toEqual({ state: 'transition' });
  }));
test('canonical replacement across sampling is transition', () =>
  fixture(async (directory) => {
    expect(
      await observeRegistryFixturePermission(directory, owner, async () => {
        await writeFile(join(directory, 'next'), JSON.stringify({ fenced: true, revision: 2 }), {
          mode: 0o600,
        });
        await rename(join(directory, 'next'), join(directory, 'journal.json'));
      }),
    ).toEqual({ state: 'transition' });
  }));
test('stable mismatch is observed forbidden, and malformed or wrong-owner files refuse observation', () =>
  fixture(async (directory, permit) => {
    await writeFile(
      join(directory, 'journal.json'),
      JSON.stringify({ fenced: false, revision: 2 }),
    );
    expect(await observeRegistryFixturePermission(directory, owner)).toEqual({
      state: 'coherent',
      permitsWrites: false,
      fenced: false,
    });
    await expectFixtureRefusal(
      observeRegistryFixturePermission(directory, { uid: uid + 1, gid: owner.gid }),
      'metadata',
    );
    await expectFixtureRefusal(
      observeRegistryFixturePermission(directory, { uid, gid: owner.gid + 1 }),
      'metadata',
    );
    await chmod(join(directory, 'writable.permit'), 0o644);
    await expectFixtureRefusal(observeRegistryFixturePermission(directory, owner), 'metadata');
    await chmod(join(directory, 'writable.permit'), 0o600);
    await writeFile(join(directory, 'writable.permit'), permit + 'private');
    await expectFixtureRefusal(observeRegistryFixturePermission(directory, owner), 'Malformed');
  }));
test('permit absence is explicit, disappearance between samples is transition', () =>
  fixture(async (directory) => {
    expect(
      await observeRegistryFixturePermission(directory, owner, () =>
        unlink(join(directory, 'writable.permit')),
      ),
    ).toEqual({ state: 'transition' });
    expect(await observeRegistryFixturePermission(directory, owner)).toEqual({ state: 'absent' });
  }));

test('child mode requires exact argv, owner and one recognized readonly setting', async () => {
  const { classifyRegistryFixtureChild } = await import('./registry-guard-observation.fixture');
  const argv = '/registry\0serve\0/config\0';
  const status = 'Uid:\t59001\t59001\t59001\t59001\n';
  const env = 'REGISTRY_STORAGE_MAINTENANCE_READONLY={"enabled":false}\0';
  expect(
    classifyRegistryFixtureChild(argv, status, env, ['/registry', 'serve', '/config', '']),
  ).toBe('writable');
  expect(
    classifyRegistryFixtureChild(argv, status, env.replace('false', 'true'), [
      '/registry',
      'serve',
      '/config',
      '',
    ]),
  ).toBe('readonly');
  expect(
    classifyRegistryFixtureChild(['/bin/sleep', '1', ''].join('\0'), status, '', [
      '/registry',
      'serve',
      '/config',
      '',
    ]),
  ).toBe('other');
  expect(() =>
    classifyRegistryFixtureChild(argv, status.replaceAll('59001', '0'), env, [
      '/registry',
      'serve',
      '/config',
      '',
    ]),
  ).toThrow();
  expect(() =>
    classifyRegistryFixtureChild(argv, status, env + env, ['/registry', 'serve', '/config', '']),
  ).toThrow();
});

test('missing canonical, unreadable permit, symlink and hardlink refuse observation', () =>
  fixture(async (directory, permit) => {
    const path = join(directory, 'writable.permit');
    await chmod(path, 0);
    await expectFixtureRefusal(observeRegistryFixturePermission(directory, owner));
    await chmod(path, 0o600);
    await link(path, join(directory, 'alias'));
    await expectFixtureRefusal(observeRegistryFixturePermission(directory, owner), 'metadata');
    await unlink(join(directory, 'alias'));
    await unlink(path);
    await writeFile(join(directory, 'target'), permit, { mode: 0o600 });
    await symlink(join(directory, 'target'), path);
    await expectFixtureRefusal(observeRegistryFixturePermission(directory, owner));
    await unlink(path);
    await writeFile(path, permit, { mode: 0o600 });
    await unlink(join(directory, 'journal.json'));
    await expectFixtureRefusal(observeRegistryFixturePermission(directory, owner));
  }));
test('stable expired and wrong-boot permits never report writable', () =>
  fixture(async (directory, permit) => {
    const fields = permit.trim().split(' ');
    fields[2] = '0';
    fields[3] = '30';
    await writeFile(join(directory, 'writable.permit'), fields.join(' ') + '\n');
    expect(await observeRegistryFixturePermission(directory, owner)).toEqual({
      state: 'coherent',
      permitsWrites: false,
      fenced: false,
    });
    fields.splice(0, fields.length, ...permit.trim().split(' '));
    fields[1] = '00000000-0000-0000-0000-000000000000';
    await writeFile(join(directory, 'writable.permit'), fields.join(' ') + '\n');
    expect(await observeRegistryFixturePermission(directory, owner)).toEqual({
      state: 'coherent',
      permitsWrites: false,
      fenced: false,
    });
  }));

test('process start identity accepts exact PID and rejects mismatched or malformed stat', async () => {
  const { readRegistryFixtureStart } = await import('./registry-guard-observation.fixture');
  const fields = ['S', ...Array<string>(18).fill('0'), '12345', ...Array<string>(30).fill('0')];
  expect(readRegistryFixtureStart('42 (name with ) parenthesis) ' + fields.join(' '), '42')).toBe(
    '12345',
  );
  expect(() => readRegistryFixtureStart('43 (name) ' + fields.join(' '), '42')).toThrow();
  expect(() => readRegistryFixtureStart('42 (name) S 0', '42')).toThrow();
});

test('replacement after open but before first fstat is an explicitly observed transition', () =>
  fixture(async (directory, permit) => {
    let replaced = false;
    const observed = await observeRegistryFixturePermission(
      directory,
      owner,
      undefined,
      async () => {
        await writeFile(join(directory, 'replacement'), permit, { mode: 0o600 });
        await rename(join(directory, 'replacement'), join(directory, 'writable.permit'));
        replaced = true;
      },
    );
    expect(replaced).toBe(true);
    expect(observed).toEqual({ state: 'transition' });
  }));

const supervisorBoot = '11111111-1111-4111-8111-111111111111\n';
const supervisorInstance = '22222222-2222-4222-8222-222222222222 ' + supervisorBoot;
const supervisorRequest = '44444444-4444-4444-8444-444444444444 ' + supervisorInstance;
const supervisorObservation = {
  instance: supervisorInstance,
  afterInstance: supervisorInstance,
  previousRequest: '33333333-3333-4333-8333-333333333333 ' + supervisorInstance,
  request: supervisorRequest,
  acknowledgement: supervisorRequest,
  boot: supervisorBoot,
};
for (const previousInstance of [
  supervisorInstance,
  '55555555-5555-4555-8555-555555555555 ' + supervisorBoot,
])
  test(
    'supervisor acknowledgement binds actual bytes after prior instance ' +
      previousInstance.slice(0, 8),
    () => {
      expect(
        verifyRegistrySupervisorAcknowledgement({
          ...supervisorObservation,
          previousRequest: '33333333-3333-4333-8333-333333333333 ' + previousInstance,
        }),
      ).toEqual({
        instanceSha256: 'bf545884b26bdff961b57a6103edc69e43b5043db74c5217e0bfd04f4d2d11d1',
        requestSha256: 'b92d9819fb3045249e59d8d48f410bce39188b3a5ec7bf6a0b42d5469ae84b79',
      });
    },
  );
for (const [fault, changed] of [
  [
    'foreign-captured-instance',
    { instance: '55555555-5555-4555-8555-555555555555 ' + supervisorBoot },
  ],
  [
    'replaced-instance',
    { afterInstance: '55555555-5555-4555-8555-555555555555 ' + supervisorBoot },
  ],
  ['foreign-boot', { boot: '66666666-6666-4666-8666-666666666666\n' }],
  [
    'foreign-request-instance',
    {
      request:
        '44444444-4444-4444-8444-444444444444 55555555-5555-4555-8555-555555555555 ' +
        supervisorBoot,
      acknowledgement:
        '44444444-4444-4444-8444-444444444444 55555555-5555-4555-8555-555555555555 ' +
        supervisorBoot,
    },
  ],
  ['reused-request-nonce', { previousRequest: supervisorRequest }],
  [
    'reused-nonce-after-instance-change',
    {
      previousRequest:
        '44444444-4444-4444-8444-444444444444 55555555-5555-4555-8555-555555555555 ' +
        supervisorBoot,
    },
  ],
  ['stale-acknowledgement', { acknowledgement: supervisorObservation.previousRequest }],
] as const)
  test('supervisor acknowledgement refuses ' + fault, () => {
    expect(() =>
      verifyRegistrySupervisorAcknowledgement({ ...supervisorObservation, ...changed }),
    ).toThrow();
  });
for (const field of [
  'instance',
  'afterInstance',
  'previousRequest',
  'request',
  'acknowledgement',
  'boot',
] as const)
  for (const fault of ['absent', 'type', 'blank-line', 'missing-newline'] as const)
    test('supervisor acknowledgement refuses ' + field + ' ' + fault, () => {
      const changed: Record<string, unknown> = { ...supervisorObservation };
      if (fault === 'absent') Reflect.deleteProperty(changed, field);
      else if (fault === 'type') changed[field] = 123;
      else if (fault === 'blank-line') changed[field] = supervisorObservation[field] + '\n';
      else changed[field] = supervisorObservation[field].slice(0, -1);
      expect(() => verifyRegistrySupervisorAcknowledgement(changed)).toThrow();
    });
for (const fault of [null, false, [], { ...supervisorObservation, untrusted: true }])
  test('supervisor acknowledgement refuses malformed envelope ' + JSON.stringify(fault), () => {
    expect(() => verifyRegistrySupervisorAcknowledgement(fault)).toThrow();
  });

for (const fault of [
  'none',
  'replaced-instance',
  'stale-request',
  'stale-ack',
  'foreign-boot',
  'missing-record',
  'unreadable-record',
] as const)
  test('populated controller binds its actual supervisor records: ' + fault, async () => {
    const source = await readFile(
      new URL('./registry-maintenance-populated.native.ts', import.meta.url),
      'utf8',
    );
    const capture = source.indexOf("    await guard.waitMode('writable');");
    const publish = source.indexOf(
      '    const publication = await observeRegistryPopulationRun(',
      capture,
    );
    const readonly = source.indexOf("    await guard.waitMode('readonly');", publish);
    const retained = source.indexOf('    const url = ', readonly);
    if (capture < 0 || publish < capture || readonly < publish || retained < readonly)
      throw new Error('Missing actual populated-controller observation boundaries');
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      'async function observe(){' +
        source.slice(capture + "    await guard.waitMode('writable');".length, publish) +
        '\nawait publication();\n' +
        source.slice(readonly, retained) +
        '}\nreturn observe();',
    );
    const calls: string[] = [],
      output: string[] = [];
    const failure = Object.assign(new Error('private supervisor record failure'), {
      code: fault === 'missing-record' ? 'ENOENT' : 'EACCES',
    });
    let published = false;
    // Boundary: actual before/after publication source slices; files, metadata, guard and publication are modeled. The verifier is real.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function(
      'installed',
      'guard',
      'readRegistryPressureRecord',
      'lstat',
      'readFile',
      'startRegistryGuardTimeline',
      'publication',
      'verifyRegistrySupervisorAcknowledgement',
      'console',
      body,
    ) as (...ports: unknown[]) => Promise<void>;
    const refused = await invoke(
      { journalPath: '/var/lib/puni-registry/journal/contents' },
      {
        observeMode: 'owned-mode-reader',
        waitMode: (mode: string) => {
          expect(mode).toBe('readonly');
          return Promise.resolve();
        },
      },
      (path: string, identity?: unknown) => {
        calls.push((published ? 'after:' : 'before:') + path);
        if (published && (fault === 'missing-record' || fault === 'unreadable-record'))
          return Promise.reject(failure);
        if (path.endsWith('/.authority-instance'))
          return Promise.resolve(
            published && fault === 'replaced-instance'
              ? '55555555-5555-4555-8555-555555555555 ' + supervisorBoot
              : supervisorInstance,
          );
        if (path.endsWith('/readonly.request'))
          return Promise.resolve(
            !published || fault === 'stale-request'
              ? supervisorObservation.previousRequest
              : supervisorRequest,
          );
        if (path.endsWith('/.authority-readonly')) {
          expect(identity).toEqual({ dev: 17, ino: 23 });
          return Promise.resolve(
            fault === 'stale-ack' ? supervisorObservation.previousRequest : supervisorRequest,
          );
        }
        return Promise.reject(new Error('Unexpected modeled record path'));
      },
      (path: string) => {
        expect(path).toBe('/var/lib/puni-registry/registry/contents/.authority-readonly');
        return Promise.resolve({ dev: 17, ino: 23 });
      },
      (path: string, encoding: string) => {
        expect(path).toBe('/proc/sys/kernel/random/boot_id');
        expect(encoding).toBe('utf8');
        return Promise.resolve(
          fault === 'foreign-boot' ? '66666666-6666-4666-8666-666666666666\n' : supervisorBoot,
        );
      },
      (directory: string, observe: unknown) => {
        expect(directory).toBe('/var/lib/puni-registry/journal/contents');
        expect(observe).toBe('owned-mode-reader');
        return {};
      },
      () => {
        published = true;
        calls.push('publication');
        return Promise.resolve();
      },
      verifyRegistrySupervisorAcknowledgement,
      { log: (line: string) => output.push(line) },
    ).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    if (fault === 'none') {
      expect(refused).toBeUndefined();
      expect(output).toEqual([
        JSON.stringify({
          supervisorAcknowledgement: {
            instanceSha256: 'bf545884b26bdff961b57a6103edc69e43b5043db74c5217e0bfd04f4d2d11d1',
            requestSha256: 'b92d9819fb3045249e59d8d48f410bce39188b3a5ec7bf6a0b42d5469ae84b79',
          },
        }),
      ]);
      expect(calls.slice(0, 3)).toEqual([
        'before:/var/lib/puni-registry/registry/contents/.authority-instance',
        'before:/var/lib/puni-registry/journal/contents/readonly.request',
        'publication',
      ]);
    } else {
      if (fault === 'missing-record' || fault === 'unreadable-record')
        expect(refused).toBe(failure);
      else expect(refused).toBeInstanceOf(Error);
      expect(output).toEqual([]);
    }
  });
