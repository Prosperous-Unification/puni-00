import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { expect, it } from 'bun:test';

import {
  type BuildMode,
  createExecutionFixture,
  type ExecutionFixture,
  fixtureHasCurrent,
} from './performance-execution-fixture';
import { createPerformanceProcessOwner } from './performance-processes';

interface SpawnRecord {
  kind: 'spawn';
  pid: number;
  argv: string[];
  cwd: string;
  env: Record<string, string>;
}
interface PhaseRecord {
  phase: string;
  pid: number;
  ppid: number;
  execPath: string;
}
function readRecords(path: string): unknown[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as unknown);
}
function readSpawns(path: string): SpawnRecord[] {
  return readRecords(path).filter((record): record is SpawnRecord => {
    if (record === null || typeof record !== 'object' || !('kind' in record))
      throw new Error('Malformed execution observation');
    if (record.kind === 'exit') return false;
    if (
      record.kind !== 'spawn' ||
      !('pid' in record) ||
      !Number.isSafeInteger(record.pid) ||
      !('argv' in record) ||
      !Array.isArray(record.argv) ||
      !record.argv.every((argument) => typeof argument === 'string') ||
      !('cwd' in record) ||
      typeof record.cwd !== 'string' ||
      !('env' in record) ||
      record.env === null ||
      typeof record.env !== 'object' ||
      !Object.values(record.env).every((value) => typeof value === 'string')
    )
      throw new Error('Malformed execution spawn observation');
    return true;
  });
}
function readPhases(path: string): PhaseRecord[] {
  return readRecords(path).map((record) => {
    if (
      record === null ||
      typeof record !== 'object' ||
      !('phase' in record) ||
      typeof record.phase !== 'string' ||
      !('pid' in record) ||
      !Number.isSafeInteger(record.pid) ||
      !('ppid' in record) ||
      !Number.isSafeInteger(record.ppid) ||
      !('execPath' in record) ||
      typeof record.execPath !== 'string'
    )
      throw new Error('Malformed Vite phase observation');
    // Test-owned JSONL producer above supplies these exact closed scalar fields.
    return record as PhaseRecord;
  });
}
async function bounded<T>(pending: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} did not settle within ${String(milliseconds)}ms`));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
async function waitForBuild(fixture: ExecutionFixture): Promise<void> {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (readPhases(fixture.phases).some((phase) => phase.phase === 'build-start')) return;
    await Bun.sleep(25);
  }
  throw new Error('Actual Vite build-start did not occur within 120000ms');
}
function requireGone(pid: number): void {
  try {
    readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
  } catch (cause) {
    if (cause !== null && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT')
      return;
    throw cause;
  }
  throw new Error(`Recorded child PID ${String(pid)} remains or was reused; namespace retained`);
}
/** Uses the actual production pidfd/subreaper owner, numeric exit and both pipe EOFs, independently of the runner's receipt. */
async function withExecution(
  mode: BuildMode,
  assertions: (
    fixture: ExecutionFixture,
    exitCode: number,
    output: { stdout: string; stderr: string },
  ) => Promise<void> | void,
  fault?: 'inventory-after-run',
): Promise<void> {
  const fixture = await createExecutionFixture(mode);
  const receipt = join(fixture.parent, 'supervisor.json');
  const failures: unknown[] = [];
  let known = false;
  let owner: ReturnType<typeof createPerformanceProcessOwner> | undefined;
  let stopping: Promise<void> | undefined;
  const stopOwner = (active: ReturnType<typeof createPerformanceProcessOwner>): Promise<void> =>
    (stopping ??= active.stop());
  let closure:
    | Promise<{ ok: true; value: [number, string, string] } | { ok: false; cause: unknown }>
    | undefined;
  try {
    owner = createPerformanceProcessOwner();
    const child = owner.spawn(
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        ...(fault === undefined
          ? []
          : ['--preload', join(import.meta.dir, 'performance-processes.fault.preload.ts')]),
        join(import.meta.dir, 'performance-execution.fixture-cli.ts'),
        fixture.root,
        fixture.policy,
        fixture.trace,
        receipt,
      ],
      join(import.meta.dir, '../../..'),
      { ...fixture.environment, ...(fault === undefined ? {} : { PUNI_PROCESS_FAULT: fault }) },
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const stdoutPipe = child.stdout,
      stderrPipe = child.stderr;
    if (!(stdoutPipe instanceof ReadableStream) || !(stderrPipe instanceof ReadableStream))
      throw new Error('Actual supervisor pipes were not acquired');
    closure = (async (): Promise<[number, string, string]> => {
      const channels = await Promise.allSettled([
        child.exited,
        new Response(stdoutPipe).text(),
        new Response(stderrPipe).text(),
      ] as const);
      const causes = channels.flatMap((channel) =>
        channel.status === 'rejected' ? [channel.reason as unknown] : [],
      );
      if (causes.length > 0)
        throw new AggregateError(causes, 'Actual supervisor exit or EOF failed');
      const [exit, stdout, stderr] = channels;
      if (
        exit.status !== 'fulfilled' ||
        stdout.status !== 'fulfilled' ||
        stderr.status !== 'fulfilled'
      )
        throw new Error('Actual supervisor channel settlement is inconsistent');
      return [exit.value, stdout.value, stderr.value];
    })().then(
      (value) => ({ ok: true as const, value }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    if (mode === 'pending') {
      await waitForBuild(fixture);
      await stopOwner(owner);
    }
    const settledChannels = await bounded(
      closure,
      mode === 'pending' ? 10000 : 180000,
      'Performance supervisor exit and EOFs',
    );
    if (!settledChannels.ok) throw settledChannels.cause;
    const [exitCode, stdout, stderr] = settledChannels.value;
    await stopOwner(owner);
    requireGone(child.pid);
    for (const record of readSpawns(fixture.trace)) requireGone(record.pid);
    for (const phase of readPhases(fixture.phases)) requireGone(phase.pid);
    known = true;
    if (mode !== 'pending') {
      const settled: unknown = JSON.parse(await readFile(receipt, 'utf8'));
      expect(settled).toMatchObject({
        schemaVersion: 1,
        ok: mode === 'success' && fault === undefined,
        observationFailures: [],
      });
    }
    await assertions(fixture, exitCode, { stdout, stderr });
  } catch (cause) {
    failures.push(cause);
  } finally {
    if (owner !== undefined) {
      try {
        await stopOwner(owner);
      } catch (cause) {
        failures.push(cause);
        known = false;
      }
    }
    if (!known && closure !== undefined) {
      try {
        const settledChannels = await bounded(closure, 10000, 'final supervisor exit and EOFs');
        if (!settledChannels.ok) failures.push(settledChannels.cause);
      } catch (cause) {
        failures.push(cause);
      }
    }
    if (known && failures.length === 0 && fault === undefined) {
      try {
        await rm(fixture.parent, { recursive: true });
      } catch (cause) {
        failures.push(cause);
      }
    } else if (known && failures.length === 0) {
      process.stdout.write(
        'Known-owned Performance cleanup-refusal artifacts retained: ' + fixture.parent + '\n',
      );
    } else
      failures.push(
        new Error(
          `${known ? 'Known execution custody, failed owner' : 'Unknown execution custody'}; retained ${fixture.parent}`,
        ),
      );
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'Performance execution owner failed');
}
function requireSpawn(
  records: SpawnRecord[],
  predicate: (record: SpawnRecord) => boolean,
  label: string,
): SpawnRecord {
  const matches = records.filter(predicate);
  const selected = matches.at(0);
  if (matches.length !== 1 || selected === undefined)
    throw new Error(`Expected exactly one actual ${label} spawn; saw ${String(matches.length)}`);
  return selected;
}
function hasDiscovery(records: SpawnRecord[]): boolean {
  return records.some((record) => record.argv.includes('--list'));
}
for (const vector of [
  'approved BE/GW services',
  'both Playwright stages',
  'settled FE build then preview',
] as const) {
  it(
    'Performance selects captured Bun for ' + vector,
    async () => {
      await withExecution('success', async (fixture, exitCode, output) => {
        expect({ exitCode, stderr: output.stderr }).toMatchObject({ exitCode: 0 });
        expect(fixtureHasCurrent(fixture)).toBe(true);
        const pointer: unknown = JSON.parse(
          await readFile(
            join(fixture.root, 'tmp/junit/wbs-fe-01.performance.current.json'),
            'utf8',
          ),
        );
        expect(pointer).toMatchObject({ schemaVersion: 1, certifies: false });
        if (
          pointer === null ||
          typeof pointer !== 'object' ||
          !('bundle' in pointer) ||
          typeof pointer.bundle !== 'string' ||
          !pointer.bundle.startsWith('tmp/junit/performance/')
        )
          throw new Error('Published current bundle path is absent');
        const bundle = join(fixture.root, pointer.bundle);
        const manifest: unknown = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8'));
        expect(manifest).toMatchObject({
          schemaVersion: 1,
          certifies: false,
          collected: [
            {
              caseId: 'paint-ready',
              fixture: 'apps/wbs/fe-01/e2e-performance/paint.perf.spec.ts',
              titlePath: ['Paint', 'records readiness'],
            },
          ],
        });
        for (const [key, filename] of [
          ['discovery', 'discovery.json'],
          ['run', 'run.json'],
          ['evidence', 'evidence.json'],
          ['report', 'report.xml'],
        ] as const) {
          const bytes = await readFile(join(bundle, filename));
          expect(bytes.byteLength).toBeGreaterThan(0);
          expect(manifest).toMatchObject({
            [key]: { path: filename, digest: createHash('sha256').update(bytes).digest('hex') },
          });
        }
        const evidence: unknown = JSON.parse(await readFile(join(bundle, 'evidence.json'), 'utf8'));
        expect(evidence).toMatchObject({
          schemaVersion: 1,
          selection: {
            project: 'chromium',
            selectionEnvironment: { CI: '1', E2E_PORT_SHIFT: String(fixture.shift) },
          },
        });
        expect(await readFile(join(bundle, 'report.xml'), 'utf8')).toContain('failures="0"');
        const records = readSpawns(fixture.trace);
        const phases = readPhases(fixture.phases);
        expect(phases.map((phase) => phase.phase)).toEqual([
          'build-start',
          'build-complete',
          'preview-start',
        ]);
        const be = requireSpawn(records, (record) => record.cwd.endsWith('/apps/wbs/be-01'), 'BE');
        const gw = requireSpawn(records, (record) => record.cwd.endsWith('/apps/wbs/gw-01'), 'GW');
        const discovery = requireSpawn(
          records,
          (record) => record.argv.includes('--list'),
          'Playwright discovery',
        );
        const measurement = requireSpawn(
          records,
          (record) =>
            record.argv.includes('test') &&
            record.argv.includes('--reporter=json') &&
            !record.argv.includes('--list'),
          'Playwright measurement',
        );
        for (const selected of [be, gw, discovery, measurement]) {
          expect(selected.env['CI']).toBe('1');
          expect(selected.env['E2E_PORT_SHIFT']).toBe(String(fixture.shift));
        }
        // Each feature oracle follows the actual successful report and native cleanup prerequisites above.
        if (vector === 'approved BE/GW services') {
          expect(be.argv).toEqual([process.execPath, 'src/testing/ordinary-browser-server.ts']);
          expect(gw.argv).toEqual([process.execPath, 'src/testing/ordinary-browser-gateway.ts']);
        } else if (vector === 'both Playwright stages') {
          expect(discovery.argv[0]).toBe(process.execPath);
          expect(measurement.argv[0]).toBe(process.execPath);
        } else {
          const build = requireSpawn(
            records,
            (record) => record.argv.includes('build') && record.cwd.endsWith('/apps/wbs/fe-01'),
            'Vite build',
          );
          const preview = requireSpawn(
            records,
            (record) => record.argv.includes('preview') && record.cwd.endsWith('/apps/wbs/fe-01'),
            'Vite preview',
          );
          const vite = join(import.meta.dir, '../../../node_modules/vite/bin/vite.js');
          expect(build.argv).toEqual([process.execPath, vite, 'build', '--minify=false']);
          expect(preview.argv).toEqual([
            process.execPath,
            vite,
            'preview',
            '--host',
            'localhost',
            '--port',
            String(4200 + fixture.shift),
            '--strictPort',
          ]);
          expect(phases[0]?.pid).toBe(build.pid);
          expect(phases[2]?.pid).toBe(preview.pid);
          const complete = readRecords(fixture.trace);
          const settledBuild = complete.findIndex(
            (record) =>
              record !== null &&
              typeof record === 'object' &&
              'kind' in record &&
              record.kind === 'exit' &&
              'pid' in record &&
              record.pid === build.pid &&
              'exitCode' in record &&
              record.exitCode === 0,
          );
          const previewStart = complete.findIndex(
            (record) =>
              record !== null &&
              typeof record === 'object' &&
              'kind' in record &&
              record.kind === 'spawn' &&
              'pid' in record &&
              record.pid === preview.pid,
          );
          expect(settledBuild).toBeGreaterThanOrEqual(0);
          expect(previewStart).toBeGreaterThan(settledBuild);
          for (const selected of [build, preview]) {
            expect(selected.env['CI']).toBe('1');
            expect(selected.env['E2E_PORT_SHIFT']).toBe(String(fixture.shift));
          }
        }
      });
    },
    240000,
  );
}
it('Performance failed actual Vite build cannot preview or discover tests', async () => {
  await withExecution('failure', (fixture, exitCode) => {
    expect(exitCode).not.toBe(0);
    expect(readPhases(fixture.phases).map((phase) => phase.phase)).toEqual(['build-start']);
    expect(hasDiscovery(readSpawns(fixture.trace))).toBe(false);
    expect(fixtureHasCurrent(fixture)).toBe(false);
  });
}, 240000);
it('Performance cancellation while actual Vite build is pending settles owned children before any later stage', async () => {
  await withExecution('pending', (fixture, exitCode, output) => {
    expect(exitCode).not.toBe(0);
    expect(output.stderr).not.toContain('Performance cancellation cleanup failed:');
    expect(readPhases(fixture.phases).map((phase) => phase.phase)).toEqual(['build-start']);
    expect(hasDiscovery(readSpawns(fixture.trace))).toBe(false);
    expect(fixtureHasCurrent(fixture)).toBe(false);
  });
}, 180000);

it('Performance retains the actual checkout and archive when native post-run owner recovery is unknown', async () => {
  await withExecution(
    'success',
    async (fixture, exitCode) => {
      expect(exitCode).not.toBe(0);
      const receipt: unknown = JSON.parse(
        await readFile(join(fixture.parent, 'supervisor.json'), 'utf8'),
      );
      expect(receipt).toMatchObject({ ok: false, observationFailures: [] });
      const records = readSpawns(fixture.trace);
      const setup = requireSpawn(
        records,
        (record) => record.argv.includes('tools/dev/setup.ts'),
        'actual setup',
      );
      const bundles = readdirSync(join(fixture.root, 'tmp/junit/performance'));
      expect(bundles).toHaveLength(1);
      const bundle = bundles.at(0);
      if (bundle === undefined) throw new Error('Actual failed bundle is absent');
      expect(existsSync(join(fixture.root, 'tmp/junit/performance', bundle, 'manifest.json'))).toBe(
        true,
      );
      const failure = await readFile(
        join(fixture.root, 'tmp/junit/performance', bundle, 'failure.json'),
        'utf8',
      );
      expect(failure).toContain('injected post-run inventory ambiguity');
      expect(fixtureHasCurrent(fixture)).toBe(false);
      // The real post-report native failure precedes this physical-retention oracle.
      expect(existsSync(setup.cwd)).toBe(true);
      expect(existsSync(dirname(setup.cwd))).toBe(true);
    },
    'inventory-after-run',
  );
}, 240000);
