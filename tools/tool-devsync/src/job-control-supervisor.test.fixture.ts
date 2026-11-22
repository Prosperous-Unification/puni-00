import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect } from 'bun:test';

import {
  createPerformanceProcessOwner,
  type PerformanceProcessOwner,
} from './performance-processes';

const scenario = process.argv.at(2);
if (scenario === undefined || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(scenario))
  throw new Error('expected a job-control scenario name');

const root = mkdtempSync(join(tmpdir(), 'puni-c35-job-control-'));
let owner: PerformanceProcessOwner | undefined, output: number | undefined;
let primary: { kind: 'healthy' } | { kind: 'failed'; cause: unknown } = { kind: 'healthy' };
let stop: Promise<void> | undefined;
const failures: unknown[] = [];
const stopOnce = () => {
  stop ??= owner === undefined ? Promise.resolve() : owner.stop();
  return stop;
};
try {
  output = openSync(join(root, 'output.log'), 'wx', 0o600);
  owner = createPerformanceProcessOwner();
  writeFileSync(
    join(root, 'setup-input.json'),
    JSON.stringify({ credential: 'wbs_mk_' + crypto.randomUUID() + '.' + 'k'.repeat(43) }),
    { mode: 0o600 },
  );
  const fixture = resolve(
    import.meta.dir,
    '../../../apps/twilight-structure/twilight-dash/cli/src/ops/testing/job-control.test.fixture.ts',
  );
  const child = owner.spawn(
    [
      'unshare',
      '--user',
      '--map-current-user',
      '--pid',
      '--fork',
      '--mount-proc',
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      fixture,
      root,
      scenario,
    ],
    root,
    Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    { stdout: output, stderr: output },
  );
  const exited = child.exited.then(
    (exitCode) => ({ kind: 'exited' as const, exitCode }),
    (cause: unknown) => ({ kind: 'failed' as const, cause }),
  );
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const observed = await Promise.race([
    exited,
    new Promise<{ kind: 'expired' }>((resolveExpiry) => {
      watchdog = setTimeout(() => {
        resolveExpiry({ kind: 'expired' });
      }, 12000);
    }),
  ]);
  clearTimeout(watchdog);
  writeFileSync(
    join(root, 'native.json'),
    JSON.stringify({ observed, exitCode: child.exitCode, signalCode: child.signalCode }),
  );
  expect(observed.kind, readFileSync(join(root, 'output.log'), 'utf8')).toBe('exited');
  if (observed.kind !== 'exited') throw new Error('job-control native fixture did not settle');
  expect(observed.exitCode, readFileSync(join(root, 'output.log'), 'utf8')).toBe(0);
  expect(JSON.parse(readFileSync(join(root, 'receipt.json'), 'utf8'))).toMatchObject({
    scenario,
  });
} catch (cause) {
  primary = { kind: 'failed', cause };
} finally {
  try {
    await stopOnce();
  } catch (cause) {
    failures.push(cause);
  }
  if (output !== undefined) {
    try {
      closeSync(output);
    } catch (cause) {
      failures.push(cause);
    }
  }
  writeFileSync(
    join(root, 'cleanup.json'),
    JSON.stringify({
      settled: failures.length === 0,
      failures: failures.map((cause) => String(cause)),
      primary: primary.kind === 'failed' ? String(primary.cause) : null,
    }),
  );
  const capture = process.env['PUNI_C35_JOB_CONTROL_CAPTURE'];
  if (capture !== undefined) {
    mkdirSync(capture, { recursive: true });
    cpSync(root, join(capture, scenario), { recursive: true });
    if (existsSync(join(root, 'pool-path')))
      cpSync(readFileSync(join(root, 'pool-path'), 'utf8'), join(capture, scenario, 'pool'), {
        recursive: true,
      });
  }
  if (failures.length === 0 && existsSync(join(root, 'pool-path')))
    rmSync(readFileSync(join(root, 'pool-path'), 'utf8'), { recursive: true, force: true });
  if (failures.length === 0) rmSync(root, { recursive: true, force: true });
}
if (failures.length > 0)
  throw new AggregateError(
    primary.kind === 'failed' ? [primary.cause, ...failures] : failures,
    'job-control oracle and cleanup failed',
  );
if (primary.kind === 'failed') throw primary.cause;
writeSync(2, 'completed job-control scenario ' + scenario + '\n');
