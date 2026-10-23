import { rejects } from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { inspect as inspectFailure } from 'node:util';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { sourceFixture } from '../fixtures/source-dev';
import type { RunDocker } from './docker-deadline';
import { assertDependencyOwner, withDependencyOwner } from './edge-ownership';
import { envLayout, sourceDevContract } from './env';
import {
  inspectExcludedSourceMember,
  inspectSourceDevExclusion,
  type SourceDevExclusion,
  withSourceDevExcluded,
} from './source-dev-exclusion';

async function fixture(reorder = false) {
  const root = scratchSync('source-dev-');
  await mkdir(`${root}/dev`);
  const layouts = {
    prod: { ...envLayout('prod'), root, stateDir: root },
    dev: { ...envLayout('dev'), root: `${root}/dev`, stateDir: `${root}/dev` },
  };
  const source = sourceFixture();
  source.Mounts = sourceDevContract(layouts.dev).mounts.map((mount) => ({
    Type: 'bind',
    Source: mount.source,
    Destination: mount.target,
    RW: mount.writable,
  }));
  const inventory = [source];
  const commands: string[][] = [];
  let fault = '';
  const docker = (args: string[]) => {
    commands.push(args);
    if (args[0] === 'ps') return Promise.resolve(inventory.map((member) => member.Id).join('\n'));
    if (args[0] === 'inspect') {
      if (reorder) source.Mounts.reverse();
      return Promise.resolve(JSON.stringify(inventory));
    }
    if (args[0] === 'image')
      return Promise.resolve(
        args.includes('--format')
          ? fault === 'image'
            ? `sha256:${'f'.repeat(64)}`
            : source.Image
          : JSON.stringify([
              {
                Id: source.Image,
                Config: {
                  Entrypoint: fault === 'entrypoint' ? ['wrong'] : source.Config.Entrypoint,
                },
              },
            ]),
      );
    if (args[0] === 'update') {
      if (fault !== 'restart') source.HostConfig.RestartPolicy.Name = 'no';
      return Promise.resolve('');
    }
    if (args[0] === 'stop') {
      if (fault !== 'stop') {
        source.State.Running = false;
        source.State.Pid = fault === 'pid' ? 100 : 0;
        source.State.Status = 'exited';
        source.State.FinishedAt = '2026-10-23T01:00:00Z';
      }
      return Promise.resolve('');
    }
    throw new Error('unexpected Docker command');
  };
  return {
    root,
    layouts,
    source,
    inventory,
    docker,
    commands,
    setFault: (value: string) => {
      fault = value;
    },
  };
}

test('exact stopped source token is live only in callback and inventory membership is mandatory', async () => {
  const f = await fixture();
  let token: SourceDevExclusion | undefined;
  await withDependencyOwner(
    { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
    async (owner) => {
      await withSourceDevExcluded(
        owner,
        f.layouts,
        'a'.repeat(40),
        f.docker,
        performance.now() + 10000,
        async (exclusion) => {
          token = exclusion;
          expect(
            await inspectExcludedSourceMember(owner, f.layouts.prod, exclusion, [f.source]),
          ).toBe(f.source);
          await rejects(inspectExcludedSourceMember(owner, f.layouts.prod, exclusion, []));
          await rejects(
            inspectExcludedSourceMember(
              owner,
              f.layouts.prod,
              JSON.parse(JSON.stringify(exclusion)) as SourceDevExclusion,
              [f.source],
            ),
            new RegExp('live'),
          );
          expect(
            await readFile(`${f.layouts.dev.stateDir}/dependency-source-dev-complete.json`, 'utf8'),
          ).toContain(f.source.Id);
        },
      );
      if (token === undefined) throw new Error('missing token');
      await rejects(
        inspectExcludedSourceMember(owner, f.layouts.prod, token, [f.source]),
        new RegExp('live'),
      );
    },
    f.root,
  );
  expect(f.commands.some((command) => command[0] === 'stop')).toBe(true);
});
for (const fault of ['restart', 'stop', 'pid', 'image', 'entrypoint'])
  test(`source refuses omitted ${fault} before callback`, async () => {
    const f = await fixture();
    f.setFault(fault);
    let entered = false;
    await rejects(
      withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
        (owner) =>
          withSourceDevExcluded(
            owner,
            f.layouts,
            'a'.repeat(40),
            f.docker,
            performance.now() + 10000,
            () => {
              entered = true;
              return Promise.resolve();
            },
          ),
        f.root,
      ),
    );
    expect(entered).toBe(false);
  });
for (const fault of ['resume', 'config', 'bytes', 'native-mount'])
  test(`source final readback refuses ${fault}`, async () => {
    const f = await fixture();
    await rejects(
      withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
        (owner) =>
          withSourceDevExcluded(
            owner,
            f.layouts,
            'a'.repeat(40),
            f.docker,
            performance.now() + 10000,
            async () => {
              if (fault === 'resume') {
                f.source.State.Running = true;
                f.source.State.Pid = 100;
                f.source.State.Status = 'running';
              }
              if (fault === 'config') f.source.Config.User = '0';
              if (fault === 'native-mount')
                Reflect.set(f.source.Mounts[0], 'Propagation', 'rshared');
              if (fault === 'bytes')
                await writeFile(
                  `${f.layouts.dev.stateDir}/dependency-source-dev-intent.json`,
                  'changed',
                );
            },
          ),
        f.root,
      ),
    );
  });

test('owner audit admits only exact live source while ordinary and unrelated stopped mounts refuse', async () => {
  const { auditUnmanagedMounts, auditUnmanagedMountsUnderOwner } = await import('./backend-cohort');
  const { lstat } = await import('node:fs/promises');
  const f = await fixture();
  await mkdir(`${f.root}/db`);
  await writeFile(`${f.root}/db/wbs.db`, 'fixture');
  const directory = await lstat(`${f.root}/db`, { bigint: true });
  const file = await lstat(`${f.root}/db/wbs.db`, { bigint: true });
  const database = {
    path: '/data/wbs.db',
    host: `${f.root}/db/wbs.db`,
    directoryIdentity: `${String(directory.dev)}:${String(directory.ino)}`,
    fileIdentity: `${String(file.dev)}:${String(file.ino)}`,
  };
  const proof = () => Promise.reject(new Error('stopped unmanaged namespace refused'));
  await withDependencyOwner(
    { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
    async (owner) => {
      await withSourceDevExcluded(
        owner,
        f.layouts,
        'a'.repeat(40),
        f.docker,
        performance.now() + 10000,
        async (source) => {
          const deadline = performance.now() + 10000;
          await auditUnmanagedMountsUnderOwner(
            owner,
            f.layouts.prod,
            source,
            [f.source],
            { blue: null, green: null },
            database,
            f.source.Image,
            f.docker,
            deadline,
            proof,
          );
          await rejects(
            auditUnmanagedMounts(
              [f.source],
              { blue: null, green: null },
              database,
              f.source.Image,
              f.docker,
              deadline,
              proof,
            ),
            new RegExp('stopped unmanaged'),
          );
          const foreign = structuredClone(f.source);
          foreign.Id = 'd'.repeat(64);
          foreign.Name = '/unrelated';
          foreign.Config.Image = 'unrelated:1';
          foreign.Config.Labels['com.docker.compose.service'] = 'unrelated';
          f.inventory.push(foreign);
          await rejects(
            auditUnmanagedMountsUnderOwner(
              owner,
              f.layouts.prod,
              source,
              [f.source, foreign],
              { blue: null, green: null },
              database,
              f.source.Image,
              f.docker,
              deadline,
              proof,
            ),
            new RegExp('stopped unmanaged'),
          );
          foreign.Mounts = [{ Type: 'tmpfs', Source: '', Destination: '/tmp', RW: true }];
          await rejects(
            auditUnmanagedMountsUnderOwner(
              owner,
              f.layouts.prod,
              source,
              [f.source, foreign],
              { blue: null, green: null },
              database,
              f.source.Image,
              f.docker,
              deadline,
              proof,
            ),
            /stopped unmanaged/,
          );
          await rejects(
            auditUnmanagedMountsUnderOwner(
              owner,
              f.layouts.prod,
              JSON.parse('{}') as SourceDevExclusion,
              [f.source],
              { blue: null, green: null },
              database,
              f.source.Image,
              f.docker,
              deadline,
              proof,
            ),
            new RegExp('live'),
          );
        },
      );
    },
    f.root,
  );
});

for (const fault of [
  'id',
  'mount',
  'network',
  'start',
  'restart-count',
  'foreign-owner',
  'layout',
  'replacement',
  'duplicate',
  'transitional',
] as const)
  test(`source live recognition refuses ${fault}`, async () => {
    const f = await fixture();
    await withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
      (owner) =>
        withSourceDevExcluded(
          owner,
          f.layouts,
          'a'.repeat(40),
          f.docker,
          performance.now() + 10000,
          async (token) => {
            const member = structuredClone(f.source);
            if (fault === 'id' || fault === 'replacement' || fault === 'transitional')
              member.Id = 'f'.repeat(64);
            if (fault === 'mount') member.Mounts[0].Source = '/changed';
            if (fault === 'network')
              member.NetworkSettings.Networks[f.layouts.dev.network].NetworkID = 'f'.repeat(64);
            if (fault === 'start') member.State.StartedAt = '2026-10-23T10:00:01Z';
            if (fault === 'restart-count') member.RestartCount++;
            if (fault === 'transitional') {
              member.Name = '/dev-be-01-blue';
              member.Config.Image = `registry/wbs-be-01@sha256:${'e'.repeat(64)}`;
              member.Config.Labels['com.docker.compose.service'] = 'dev-be-01-blue';
            }
            const inventory =
              fault === 'replacement' || fault === 'duplicate' || fault === 'transitional'
                ? [f.source, member]
                : [member];
            await rejects(
              inspectExcludedSourceMember(
                fault === 'foreign-owner' ? { ...owner } : owner,
                fault === 'layout' ? { ...f.layouts.prod, root: '/foreign' } : f.layouts.prod,
                token,
                inventory,
              ),
            );
          },
        ),
      f.root,
    );
  });

test('source private evidence retains hashes without container environment bytes', async () => {
  const { readdir } = await import('node:fs/promises');
  const f = await fixture();
  Reflect.set(f.source.Config, 'Env', ['PRIVATE_SENTINEL=secret']);
  await withDependencyOwner(
    { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
    (owner) =>
      withSourceDevExcluded(
        owner,
        f.layouts,
        'a'.repeat(40),
        f.docker,
        performance.now() + 10000,
        () => Promise.resolve(),
      ),
    f.root,
  );
  for (const directory of [f.root, f.layouts.dev.stateDir])
    for (const name of await readdir(directory))
      if (name.endsWith('.json') || name.endsWith('.pending'))
        expect(await readFile(`${directory}/${name}`, 'utf8')).not.toContain('PRIVATE_SENTINEL');
});

for (const fault of ['omitted', 'mount-erased', 'mount-reordered', 'mount-field'] as const)
  test(`source complete audit inventory refuses ${fault} unrelated mounted member`, async () => {
    const f = await fixture();
    const foreign = structuredClone(f.source);
    foreign.Id = 'f'.repeat(64);
    foreign.Name = '/unrelated';
    foreign.Config.Image = 'unrelated:1';
    foreign.Config.Labels['com.docker.compose.service'] = 'unrelated';
    f.inventory.push(foreign);
    await withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
      (owner) =>
        withSourceDevExcluded(
          owner,
          f.layouts,
          'a'.repeat(40),
          f.docker,
          performance.now() + 10000,
          async (token) => {
            const masked = structuredClone(foreign);
            if (fault === 'mount-reordered') masked.Mounts.reverse();
            else if (fault === 'mount-field')
              Reflect.set(masked.Mounts[0], 'Propagation', 'rshared');
            else masked.Mounts = [];
            await rejects(
              inspectExcludedSourceMember(
                owner,
                f.layouts.prod,
                token,
                fault === 'omitted' ? [f.source] : [f.source, masked],
              ),
              /complete audit inventory/,
            );
            expect(
              await inspectExcludedSourceMember(owner, f.layouts.prod, token, f.inventory),
            ).toBe(f.source);
          },
        ),
      f.root,
    );
  });

for (const boundary of ['container', 'image'] as const)
  test(`source malformed ${boundary} inspection diagnostics exclude credential excerpts`, async () => {
    const f = await fixture();
    let caught: unknown;
    const docker: typeof f.docker = (args) =>
      (boundary === 'container' && args[0] === 'inspect') ||
      (boundary === 'image' && args[0] === 'image' && !args.includes('--format'))
        ? Promise.resolve('[{"Config":{"Env":[PRIVATE_SOURCE_SENTINEL]}}]')
        : f.docker(args);
    try {
      await withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
        (owner) =>
          withSourceDevExcluded(
            owner,
            f.layouts,
            'a'.repeat(40),
            docker,
            performance.now() + 10000,
            () => Promise.resolve(),
          ),
        f.root,
      );
    } catch (cause) {
      caught = cause;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).not.toContain('PRIVATE_SOURCE_SENTINEL');
    if (caught instanceof Error) {
      expect(caught.stack).not.toContain('PRIVATE_SOURCE_SENTINEL');
      expect(caught.cause).toBeUndefined();
    }
    expect(f.commands.some((command) => command[0] === 'update')).toBe(false);
  });

test('source actual initial inventory refuses additional dev backend before effects', async () => {
  const f = await fixture();
  let entered = false;
  const backend = structuredClone(f.source);
  backend.Id = 'f'.repeat(64);
  backend.Name = '/dev-be-01-blue';
  backend.Config.Image = `registry/wbs-be-01@sha256:${'e'.repeat(64)}`;
  backend.Config.Labels['com.docker.compose.service'] = 'dev-be-01-blue';
  f.inventory.push(backend);
  await rejects(
    withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
      (owner) =>
        withSourceDevExcluded(
          owner,
          f.layouts,
          'a'.repeat(40),
          f.docker,
          performance.now() + 10000,
          () => {
            entered = true;
            return Promise.resolve();
          },
        ),
      f.root,
    ),
    /transitional/,
  );
  expect(entered).toBe(false);
  expect(f.commands.some((command) => command[0] === 'update' || command[0] === 'stop')).toBe(
    false,
  );
});

for (const operation of ['recognition', 'inspection'] as const)
  test(`in-flight source ${operation} cannot return proof after token expiry`, async () => {
    const f = await fixture();
    let resume: () => void = () => {
      throw new Error('missing gate');
    };
    let announce: () => void = () => {
      throw new Error('missing start');
    };
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const started = new Promise<void>((resolve) => {
      announce = resolve;
    });
    let paused = false;
    let pending: Promise<unknown> | undefined;
    const docker: typeof f.docker = (args) => {
      if (paused && args[0] === 'ps') {
        paused = false;
        announce();
        return gate.then(() => f.docker(args));
      }
      return f.docker(args);
    };
    await withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
      async (owner) => {
        await withSourceDevExcluded(
          owner,
          f.layouts,
          'a'.repeat(40),
          docker,
          performance.now() + 10000,
          async (token) => {
            paused = true;
            pending =
              operation === 'recognition'
                ? inspectExcludedSourceMember(
                    owner,
                    f.layouts.prod,
                    token,
                    f.inventory,
                    performance.now() + 5000,
                  )
                : inspectSourceDevExclusion(owner, token, performance.now() + 5000);
            await started;
          },
        );
        if (pending === undefined) throw new Error('missing pending inspection');
        resume();
        await rejects(pending, /live|expired/);
      },
      f.root,
    );
  });

for (const fault of ['finish', 'exit-code'] as const)
  test(`retained source terminal identity refuses caller ${fault} drift`, async () => {
    const f = await fixture();
    await withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
      (owner) =>
        withSourceDevExcluded(
          owner,
          f.layouts,
          'a'.repeat(40),
          f.docker,
          performance.now() + 10000,
          async (token) => {
            const caller = structuredClone(f.source);
            if (fault === 'finish') caller.State.FinishedAt = '2026-10-23T02:00:00Z';
            else caller.State.ExitCode = 42;
            await rejects(
              inspectExcludedSourceMember(owner, f.layouts.prod, token, [caller]),
              /source dev audit inventory member/,
            );
          },
        ),
      f.root,
    );
  });

test('whole source exclusion accepts an already restarted source with historical finish', async () => {
  const f = await fixture();
  f.source.RestartCount = 2;
  f.source.State.FinishedAt = '2026-10-22T23:59:00Z';
  let entered = false;
  await withDependencyOwner(
    { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
    (owner) =>
      withSourceDevExcluded(
        owner,
        f.layouts,
        'a'.repeat(40),
        f.docker,
        performance.now() + 10000,
        () => {
          entered = true;
          return Promise.resolve();
        },
      ),
    f.root,
  );
  expect(entered).toBe(true);
  expect(f.source.RestartCount).toBe(2);
  expect(f.source.State.Pid).toBe(0);
});

test('source mount order may vary on successive complete inventory observations', async () => {
  const f = await fixture(true);
  let entered = false;
  await withDependencyOwner(
    { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
    async (owner) =>
      withSourceDevExcluded(
        owner,
        f.layouts,
        'a'.repeat(40),
        f.docker,
        performance.now() + 10000,
        async (exclusion) => {
          const inventory = structuredClone(f.inventory);
          expect(
            await inspectExcludedSourceMember(owner, f.layouts.prod, exclusion, inventory),
          ).toBe(inventory[0]);
          entered = true;
        },
      ),
    f.root,
  );
  expect(entered).toBe(true);
});

for (const operation of ['inspection', 'recognition'] as const) {
  for (const invalid of [NaN, Infinity, -1])
    test(`source ${operation} refuses invalid supplied deadline ${String(invalid)} before Docker reads`, async () => {
      const f = await fixture();
      await withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
        (owner) =>
          withSourceDevExcluded(
            owner,
            f.layouts,
            'a'.repeat(40),
            f.docker,
            performance.now() + 5000,
            async (token) => {
              const before = f.commands.length;
              await rejects(
                operation === 'inspection'
                  ? inspectSourceDevExclusion(owner, token, invalid)
                  : inspectExcludedSourceMember(owner, f.layouts.prod, token, f.inventory, invalid),
                /source dev observer deadline invalid/,
              );
              expect(f.commands.length).toBe(before);
            },
          ),
        f.root,
      );
    });
  for (const stalled of ['ps', 'image'])
    test(`source ${operation} tighter deadline aborts and reaps stalled ${stalled} child without changing original scope`, async () => {
      const f = await fixture();
      let armed = false;
      const children: Bun.Subprocess<'ignore', 'ignore', 'ignore'>[] = [];
      const signals: AbortSignal[] = [];
      const docker: RunDocker = (args, signal) => {
        if (armed && args[0] === stalled) {
          armed = false;
          if (signal === undefined) throw new Error('source child signal absent');
          signals.push(signal);
          const child = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)'], {
            stdin: 'ignore',
            stdout: 'ignore',
            stderr: 'ignore',
            signal,
            killSignal: 'SIGKILL',
          });
          children.push(child);
          return child.exited.then(() => {
            throw new Error('stalled source child reaped');
          });
        }
        return f.docker(args);
      };
      try {
        await withDependencyOwner(
          { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
          (owner) =>
            withSourceDevExcluded(
              owner,
              f.layouts,
              'a'.repeat(40),
              docker,
              performance.now() + 2000,
              async (token) => {
                armed = true;
                const deadline = performance.now() + 100;
                await rejects(
                  operation === 'inspection'
                    ? inspectSourceDevExclusion(owner, token, deadline)
                    : inspectExcludedSourceMember(
                        owner,
                        f.layouts.prod,
                        token,
                        f.inventory,
                        deadline,
                      ),
                  /deadline/,
                );
                expect(performance.now()).toBeLessThan(deadline + 500);
                expect(signals).toHaveLength(1);
                expect(signals[0]?.aborted).toBe(true);
                for (const child of children) {
                  await child.exited;
                  expect(child.signalCode).toBe('SIGKILL');
                }
                await inspectSourceDevExclusion(owner, token, performance.now() + 1000);
                await inspectSourceDevExclusion(owner, token);
              },
            ),
          f.root,
        );
      } finally {
        for (const child of children) {
          if (child.exitCode === null) child.kill('SIGKILL');
          await child.exited;
        }
      }
    });
}

for (const operation of ['inspection', 'recognition'] as const)
  test(`source ${operation} supplied longer deadline cannot extend original scope`, async () => {
    const f = await fixture();
    let armed = false,
      aborted = 0,
      completedAt = 0;
    const docker: RunDocker = (args, signal) => {
      if (armed && args[0] === 'ps') {
        armed = false;
        if (signal === undefined) throw new Error('deadline signal absent');
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted++;
              reject(new Error('Docker read deadline aborted'));
            },
            { once: true },
          );
        });
      }
      return f.docker(args);
    };
    const originalDeadline = performance.now() + 1000;
    await rejects(
      withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
        (owner) =>
          withSourceDevExcluded(
            owner,
            f.layouts,
            'a'.repeat(40),
            docker,
            originalDeadline,
            async (token) => {
              armed = true;
              await rejects(
                operation === 'inspection'
                  ? inspectSourceDevExclusion(owner, token, performance.now() + 2000)
                  : inspectExcludedSourceMember(
                      owner,
                      f.layouts.prod,
                      token,
                      f.inventory,
                      performance.now() + 2000,
                    ),
                /deadline/,
              );
              completedAt = performance.now();
            },
          ),
        f.root,
      ),
      /deadline/,
    );
    expect(aborted).toBe(1);
    expect(completedAt).toBeGreaterThan(0);
    expect(completedAt).toBeLessThan(originalDeadline + 300);
  });

for (const operation of ['inspection', 'recognition'] as const)
  for (const cleanup of ['complete', 'failure', 'accessor'] as const)
    test(`source ${operation} deadline joins ${cleanup} child and owner cleanup before returning`, async () => {
      const f = await fixture();
      let announceAbort: () => void = () => {
        throw new Error('abort gate absent');
      };
      const aborted = new Promise<void>((resolve) => {
        announceAbort = resolve;
      });
      let releaseCleanup: () => void = () => {
        throw new Error('cleanup gate absent');
      };
      const gate = new Promise<void>((resolve) => {
        releaseCleanup = resolve;
      });
      let armed = false,
        reaped = false,
        ownerChecked = false;
      const children: Bun.Subprocess<'ignore', 'ignore', 'ignore'>[] = [];
      let getterReads = 0;
      const rawFailure = new Error('PRIVATE_DOCKER_STDERR_CONFIG_ENV_SENTINEL', {
        cause: { Config: { Env: ['PRIVATE_DOCKER_ENV_CAUSE'] } },
      });
      if (cleanup === 'accessor')
        Object.defineProperty(rawFailure, 'message', {
          get() {
            getterReads++;
            throw new Error('PRIVATE_DOCKER_GETTER');
          },
        });
      await withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
        async (owner) => {
          const docker: RunDocker = async (args, signal) => {
            if (!armed || args[0] !== 'ps') return f.docker(args);
            armed = false;
            if (signal === undefined) throw new Error('join signal absent');
            const child = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)'], {
              stdin: 'ignore',
              stdout: 'ignore',
              stderr: 'ignore',
              signal,
              killSignal: 'SIGKILL',
            });
            children.push(child);
            if (!signal.aborted)
              await new Promise<void>((resolve) => {
                signal.addEventListener(
                  'abort',
                  () => {
                    resolve();
                  },
                  { once: true },
                );
              });
            announceAbort();
            await gate;
            await child.exited;
            reaped = true;
            await assertDependencyOwner(owner, f.layouts.dev);
            ownerChecked = true;
            if (cleanup !== 'complete') throw rawFailure;
            return f.docker(args);
          };
          try {
            await withSourceDevExcluded(
              owner,
              f.layouts,
              'a'.repeat(40),
              docker,
              performance.now() + 5000,
              async (token) => {
                const before = (await readdir(f.root)).filter((name) =>
                  name.endsWith('-readback.json'),
                ).length;
                armed = true;
                let settled = false;
                const pending = (
                  operation === 'inspection'
                    ? inspectSourceDevExclusion(owner, token, performance.now() + 100)
                    : inspectExcludedSourceMember(
                        owner,
                        f.layouts.prod,
                        token,
                        f.inventory,
                        performance.now() + 100,
                      )
                ).then(
                  () => {
                    settled = true;
                    return { state: 'success' as const };
                  },
                  (failure: unknown) => {
                    settled = true;
                    return { state: 'failure' as const, failure };
                  },
                );
                try {
                  await aborted;
                  await Bun.sleep(10);
                  expect(settled).toBe(false);
                  expect(reaped).toBe(false);
                  expect(ownerChecked).toBe(false);
                  await assertDependencyOwner(owner, f.layouts.dev);
                } finally {
                  releaseCleanup();
                  await pending;
                }
                const outcome = await pending;
                expect(outcome.state).toBe('failure');
                if (outcome.state !== 'failure')
                  throw new Error('observer returned proof past deadline');
                expect(reaped).toBe(true);
                expect(ownerChecked).toBe(true);
                expect(children[0]?.signalCode).toBe('SIGKILL');
                const after = (await readdir(f.root)).filter((name) =>
                  name.endsWith('-readback.json'),
                ).length;
                expect(after).toBe(before + (cleanup === 'complete' ? 1 : 0));
                expect(inspectFailure(outcome.failure, { depth: null })).not.toContain(
                  'PRIVATE_DOCKER',
                );
                expect(getterReads).toBe(0);
                if (cleanup !== 'complete') {
                  expect(outcome.failure).toBeInstanceOf(AggregateError);
                  if (!(outcome.failure instanceof AggregateError))
                    throw new Error('joined failure aggregation absent');
                  expect(outcome.failure.errors).toHaveLength(2);
                  expect(outcome.failure.cause).toBe(outcome.failure.errors[0]);
                  expect(String(outcome.failure.cause)).toContain('deadline');
                  expect(String(outcome.failure.errors[1])).toMatch(/join.*sha256:[a-f0-9]{64}/);
                }
                await inspectSourceDevExclusion(owner, token);
              },
            );
          } finally {
            releaseCleanup();
            for (const child of children) {
              if (child.exitCode === null) child.kill('SIGKILL');
              await child.exited;
            }
          }
        },
        f.root,
      );
    });
