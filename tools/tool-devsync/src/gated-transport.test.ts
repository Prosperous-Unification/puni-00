import { createHash } from 'node:crypto';
import {
  closeSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

import { readScopeAvailability } from './gated-test-installation.test.fixture';
import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

const scope = readScopeAvailability();
if (scope.kind === 'unavailable')
  process.stderr.write('gated transport real-systemd lane skipped: ' + scope.reason + '\n');

function readReceipt(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('transport receipt not an object');
  return value as Record<string, unknown>;
}
for (const lane of ['direct', 'systemd'])
  for (const scenario of [
    'transfer',
    'write-pressure',
    'cancel-env',
    'closed-status',
    'write-cancel',
  ])
    (process.platform !== 'linux' || (lane === 'systemd' && scope.kind === 'unavailable')
      ? it.skip
      : it)(
      'gated transport ' + lane + ' ' + scenario,
      async () => {
        const name = 'gated transport ' + lane + ' ' + scenario;
        if (process.env['PUNI_C34_TRANSPORT_SUPERVISOR'] !== '1') {
          const supervisor = Bun.spawn([process.execPath, 'test', import.meta.path, '-t', name], {
            env: { ...process.env, PUNI_C34_TRANSPORT_SUPERVISOR: '1' },
            stdin: 'ignore',
            stdout: 'ignore',
            stderr: 'pipe',
          });
          const observed = await awaitPerformanceSupervisor(supervisor, 12000);
          expect(observed.exitCode, observed.stderr).toBe(0);
          return;
        }
        const owner = createPerformanceProcessOwner(),
          root = mkdtempSync(join(tmpdir(), 'puni c34 transport '));
        writeFileSync(join(root, 'stdin.bin'), new Uint8Array([0, 2, 255, 48]));
        const stdout = openSync(join(root, 'stdout.bin'), 'wx', 0o600),
          stderr = openSync(join(root, 'stderr.bin'), 'wx', 0o600);
        const environment: Record<string, string> = Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        );
        const fixture = resolve(
          import.meta.dir,
          '../../../apps/twilight-structure/twilight-dash/cli/src/ops/testing/gated-transport.test.fixture.ts',
        );
        let failure: { kind: 'none' } | { kind: 'failed'; cause: unknown } = { kind: 'none' };
        try {
          const controller = owner.spawn(
            [
              process.execPath,
              '--no-env-file',
              '--config=/dev/null',
              fixture,
              'controller',
              root,
              lane,
              scenario,
            ],
            root,
            environment,
            { stdout, stderr },
          );
          closeSync(stdout);
          closeSync(stderr);
          const ended = await Promise.race([
            controller.exited.then((code) => ({ kind: 'ended' as const, code })),
            Bun.sleep(8000).then(() => ({ kind: 'pending' as const })),
          ]);
          expect(ended.kind).toBe('ended');
          expect(controller.exitCode, readFileSync(join(root, 'stderr.bin'), 'utf8')).toBe(0);
          const receipt = readReceipt(join(root, 'receipt.json'));
          expect(readReceipt(join(root, 'settled-io.json'))['originalEndpointsOpen']).toEqual([]);
          if (scenario === 'cancel-env') {
            expect(receipt['statusLength']).toBe(0);
            expect(readReceipt(join(root, 'worker.json'))['payloadStarted']).toBe(false);
          } else {
            const input = readReceipt(join(root, 'private-read.json'));
            expect(input['length']).toBe(2097156);
            expect(typeof input['receiveBuffer']).toBe('number');
            expect(Number(input['receiveBuffer'])).toBeLessThan(2097152);
            expect(input['digest']).toBe(
              'c355154f8dbc31d3ff5ae9dfd3efbd2536183a1cacf5234df0cbf012e37e3526',
            );
            expect(Number(receipt['inputPressure'])).toBeGreaterThan(0);
            if (scenario === 'transfer') {
              expect(receipt['status']).toBe('37\n');
              const payload = readReceipt(join(root, 'payload.json'));
              expect(payload['inheritedOriginalEndpoints']).toEqual([]);
              expect(payload['stdin']).toBe('0002ff30');
              expect(payload['ppid']).toBe(readReceipt(join(root, 'worker.json'))['wrapper']);
              expect(payload['proto']).toBe('native-proto-value');
              expect(payload['constructorValue']).toBe('native-constructor-value');
              expect(readFileSync(join(root, 'stdout.bin')).toString('hex')).toBe('0001feff');
              expect(readFileSync(join(root, 'stderr.bin')).toString('hex')).toBe('ff00fd');
            } else if (scenario === 'write-pressure') {
              expect(receipt['statusLength']).toBe(2097152);
              expect(receipt['statusDigest']).toBe(
                createHash('sha256').update(Buffer.alloc(2097152, 0x62)).digest('hex'),
              );
              expect(
                Number(readReceipt(join(root, 'worker.json'))['outputPressure']),
              ).toBeGreaterThan(0);
            } else if (scenario === 'closed-status') {
              expect(receipt['statusLength']).toBe(0);
              expect(readReceipt(join(root, 'status-failed.json'))['code']).toBe('EPIPE');
            } else {
              expect(Number(receipt['statusLength'])).toBeGreaterThan(0);
              expect(Number(receipt['statusLength'])).toBeLessThan(2097152);
              expect(readReceipt(join(root, 'worker.json'))['writeCancelled']).toBe(true);
            }
          }
        } catch (cause) {
          failure = { kind: 'failed', cause };
        }
        const cleanup = await owner.stop().then(
          () => ({ kind: 'stopped' as const }),
          (cause: unknown) => ({ kind: 'failed' as const, cause }),
        );
        const capture = process.env['PUNI_C34_TRANSPORT_CAPTURE'];
        if (capture !== undefined) {
          mkdirSync(capture, { recursive: true });
          cpSync(root, join(capture, lane + '-' + scenario), { recursive: true });
        }
        if (cleanup.kind === 'failed') {
          if (failure.kind === 'failed')
            throw new AggregateError(
              [failure.cause, cleanup.cause],
              'transport assertion and native cleanup failed',
            );
          throw cleanup.cause;
        }
        rmSync(root, { recursive: true, force: true });
        if (failure.kind === 'failed') throw failure.cause;
      },
      15000,
    );
