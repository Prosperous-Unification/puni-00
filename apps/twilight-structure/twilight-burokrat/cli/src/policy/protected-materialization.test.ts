import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { readLintRuntime } from '../lint-runtime';
import { captureCommittedSource } from './committed-source';
import { MaterializationFailure, materializeProtectedSource } from './materialized-source';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function git(repository: string, args: string[]): string {
  const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}
async function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni captured build source '));
  roots.push(root);
  const repository = join(root, 'source'),
    runtime = join(root, 'runtime');
  mkdirSync(repository);
  mkdirSync(runtime);
  git(repository, ['init', '--initial-branch=main']);
  git(repository, ['config', 'user.name', 'PUNI captured source']);
  git(repository, ['config', 'user.email', 'captured@example.test']);
  writeFileSync(join(repository, 'binary'), Uint8Array.from([0, 255, 10, 13]));
  writeFileSync(join(repository, 'run.ts'), 'export const marker="selected capture";\n');
  chmodSync(join(repository, 'run.ts'), 0o755);
  git(repository, ['add', '--all']);
  git(repository, ['commit', '-m', 'captured source']);
  const revision = git(repository, ['rev-parse', 'HEAD']);
  const captured = await captureCommittedSource(revision, {
    repository,
    runtime: readLintRuntime('/usr/bin:/bin', runtime),
    subscribeInterrupts: () => () => undefined,
  });
  if (captured.kind !== 'captured') throw new Error('unexpected capture cancellation');
  return {
    root,
    repository,
    runtime,
    source: captured.source,
    context: {
      callerDirectory: root,
      protectedPaths: [repository, runtime],
      subscribeInterrupts: () => () => undefined,
    },
  };
}

it('materializes exact captured build source using explicit protection and no toolkit', async () => {
  const fixture = await createFixture(),
    destination = join(fixture.root, 'view');
  const materialized = await materializeProtectedSource(
    fixture.source,
    destination,
    fixture.context,
  );
  expect(materialized).toEqual({ kind: 'materialized', directory: destination });
  expect(readFileSync(join(destination, 'binary'))).toEqual(Buffer.from([0, 255, 10, 13]));
  expect(readFileSync(join(destination, 'run.ts'))).toEqual(
    Buffer.from(fixture.source.readFile('run.ts')),
  );
  expect(statSync(join(destination, 'run.ts')).mode & 0o777).toBe(0o755);
});

it('cancels generic source materialization before missing parent or protected authority IO', async () => {
  const fixture = await createFixture();
  expect(
    await materializeProtectedSource(fixture.source, join(fixture.root, 'absent/new'), {
      ...fixture.context,
      protectedPaths: [join(fixture.root, 'absent-authority')],
      subscribeInterrupts: (listener) => {
        listener('SIGTERM');
        return () => undefined;
      },
    }),
  ).toEqual({ kind: 'cancelled', status: 143, directory: undefined });
});

it('refuses generic materialization inside its explicit captured source authority', async () => {
  const fixture = await createFixture(),
    destination = join(fixture.repository, 'view');
  const cause: unknown = await materializeProtectedSource(
    fixture.source,
    destination,
    fixture.context,
  ).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(cause).toBeInstanceOf(MaterializationFailure);
  if (!(cause instanceof MaterializationFailure))
    throw new Error('missing protected materialization refusal');
  expect(String(cause.cause)).toContain('beneath protected source authority');
  expect(cause.directory).toBeUndefined();
  expect(existsSync(destination)).toBe(false);
});
