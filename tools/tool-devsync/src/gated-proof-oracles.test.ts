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
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

function receipt(root: string, name: string): Record<string, unknown> {
  const decoded: unknown = JSON.parse(readFileSync(join(root, name), 'utf8'));
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded))
    throw new Error('invalid oracle receipt');
  return decoded as Record<string, unknown>;
}
async function wait(root: string, name: string): Promise<void> {
  const deadline = performance.now() + 5000;
  while (!existsSync(join(root, name))) {
    if (performance.now() >= deadline) throw new Error('oracle prerequisite not reached: ' + name);
    await Bun.sleep(2);
  }
}
for (const scenario of [
  'joint-no-start',
  'joint-no-env-eof',
  'duplicate-done',
  'death-before-start',
  'death-during-child',
  'death-after-status',
  'count-group-HUP',
  'count-group-INT',
  'count-group-TERM',
  'count-wrapper-TERM',
  'diagnostic-stall',
  'ambiguous-close',
  'environment-ownership',
  'env-tuple-object',
  'env-tuple-arity',
  'env-version',
  'env-entries-object',
  'env-entry-object',
  'env-entry-arity',
  'env-name-type',
  'env-value-type',
  'env-name-empty',
  'env-name-equal',
  'env-name-nul',
  'env-value-nul',
  'env-duplicate',
  'env-count-stage',
  'env-utf8',
  'env-json',
  'env-zero',
  'env-over-limit',
  'env-partial-header',
  'env-partial-body',
  'env-trailing',
  'control-crlf',
  'control-space',
  'control-partial',
  'control-overlong',
  'control-duplicate-start',
])
  it(
    'gated proof oracle ' + scenario,
    async () => {
      const name = 'gated proof oracle ' + scenario;
      if (process.env['PUNI_C34_PROOF_ORACLE_SUPERVISOR'] !== '1') {
        const supervisor = Bun.spawn(
          [process.execPath, 'test', import.meta.path, '-t', '^' + name + '$'],
          {
            env: { ...process.env, PUNI_C34_PROOF_ORACLE_SUPERVISOR: '1' },
            stdin: 'ignore',
            stdout: 'ignore',
            stderr: 'pipe',
          },
        );
        const observed = await awaitPerformanceSupervisor(supervisor, 12000);
        expect(observed.exitCode, observed.stderr).toBe(0);
        return;
      }
      const owner = createPerformanceProcessOwner(),
        root = mkdtempSync(join(tmpdir(), 'puni c34 proof oracle '));
      const stdout = openSync(join(root, 'stdout'), 'wx', 0o600),
        stderr = openSync(join(root, 'stderr'), 'wx', 0o600);
      let primary: { kind: 'healthy' } | { kind: 'failed'; cause: unknown } = { kind: 'healthy' };
      try {
        const fixture = resolve(
          import.meta.dir,
          '../../../apps/twilight-structure/twilight-dash/cli/src/ops/testing/gated-proof-oracles.test.fixture.ts',
        );
        const controller = owner.spawn(
          [
            process.execPath,
            '--no-env-file',
            '--config=/dev/null',
            fixture,
            'controller',
            root,
            scenario,
          ],
          root,
          Object.fromEntries(
            Object.entries(process.env).filter(
              (entry): entry is [string, string] => entry[1] !== undefined,
            ),
          ),
          { stdout, stderr },
        );
        closeSync(stdout);
        closeSync(stderr);
        if (scenario.startsWith('death-')) {
          await wait(root, 'kill-controller');
          // This is the actual registered controller capability, not an explicit FD3 EOF substitute.
          controller.kill('SIGKILL');
          await controller.exited;
          expect(controller.signalCode, 'controller death must be actual native SIGKILL').toBe(
            'SIGKILL',
          );
          if (scenario === 'death-during-child') {
            await Bun.sleep(1300);
            expect(
              existsSync(join(root, 'helper-completed.json')),
              'controller death cannot retire a live child owner',
            ).toBe(false);
            writeFileSync(join(root, 'release-payload'), 'release');
          }
          await wait(root, 'helper-completed.json');
          expect(receipt(root, 'helper-completed.json'), 'controller-death helper outcome').toEqual(
            scenario === 'death-after-status' ? { status: 37 } : { failed: true },
          );
          if (scenario === 'death-before-start')
            expect(existsSync(join(root, 'payload-ready.json'))).toBe(false);
          if (scenario === 'death-after-status')
            expect(receipt(root, 'kill-controller')['statusText']).toBe('37\n');
        } else {
          const controllerExit = await controller.exited;
          if (scenario.startsWith('count-')) {
            const native = receipt(root, 'helper-native-exit.json');
            expect(
              {
                beforeAcknowledgement: receipt(root, 'signal-before-ack.json'),
                acknowledgement: receipt(root, 'signal-acknowledgement.json')['kind'],
                nativeSignal: native['signal'],
              },
              'native signal keeper must remain until acknowledgement',
            ).toEqual({
              beforeAcknowledgement: { kind: 'pending' },
              acknowledgement: 'sent',
              nativeSignal: null,
            });
          }
          if (scenario === 'joint-no-start') {
            expect(receipt(root, 'before-start.json'), 'joint gate must await start').toEqual({
              payloadAbsent: true,
              nativeSpawned: false,
              pending: true,
              statusText: '',
            });
          }
          expect(controllerExit, readFileSync(join(root, 'stderr'), 'utf8')).toBe(0);
          const observed = receipt(root, 'oracle-receipt.json');
          if (scenario === 'env-over-limit')
            expect(
              existsSync(join(root, 'oversized-body-allocation.json')),
              'oversized FD5 header cannot allocate its body',
            ).toBe(false);
          if (scenario === 'ambiguous-close') {
            expect(
              receipt(root, 'ambiguous-before-cleanup.json'),
              'ambiguous required close retains its actual owner',
            ).toEqual({ helperPending: true, operationPending: true });
            expect(receipt(root, 'ambiguous-close-attempts.json')).toEqual({ attempts: 1 });
          }
          const refusalReason = new Map([
            ...['env-tuple-object', 'env-tuple-arity', 'env-version', 'env-entries-object'].map(
              (mode): [string, string] => [mode, 'version or shape is invalid'],
            ),
            ...['env-entry-object', 'env-entry-arity'].map((mode): [string, string] => [
              mode,
              'entry shape is invalid',
            ]),
            ...['env-name-type', 'env-value-type'].map((mode): [string, string] => [
              mode,
              'entry type is invalid',
            ]),
            ...['env-name-empty', 'env-name-equal', 'env-name-nul', 'env-value-nul'].map(
              (mode): [string, string] => [mode, 'entry is invalid'],
            ),
            ['env-duplicate', 'name is duplicated'],
            ['env-count-stage', 'has too many entries'],
            ['env-utf8', 'UTF8 is invalid'],
            ['env-json', 'JSON is invalid'],
            ['env-zero', 'JSON is invalid'],
          ]).get(scenario);
          if (refusalReason !== undefined)
            expect(receipt(root, 'decode-stage.json'), 'native FD5 decoder stage').toEqual({
              kind: 'refused',
              reason: 'gated payload: private environment ' + refusalReason,
            });
          const refusal =
            scenario.startsWith('env-') ||
            scenario.startsWith('control-') ||
            scenario === 'diagnostic-stall' ||
            scenario === 'ambiguous-close';
          if (!refusal)
            expect(
              receipt(root, 'before-ack.json')['pending'],
              'native keeper must remain until acknowledgement',
            ).toBe(true);
          expect(observed['code'], 'native oracle helper status').toBe(
            scenario === 'ambiguous-close'
              ? null
              : refusal || scenario === 'duplicate-done'
                ? 125
                : 37,
          );
          expect(observed['statusText'], 'native oracle FD4 classification').toBe(
            refusal ? '' : '37\n',
          );
          expect(
            observed['payloadAbsent'],
            'native malformed input must refuse before payload',
          ).toBe(refusal);
          expect(observed['diagnosticCanonical']).toBe(true);
          expect(observed['diagnosticCount']).toBe(
            (refusal && scenario !== 'diagnostic-stall') || scenario === 'duplicate-done' ? 1 : 0,
          );
          if (scenario === 'joint-no-env-eof')
            expect(
              receipt(root, 'before-environment-eof.json'),
              'joint gate must await environment EOF',
            ).toEqual({ payloadAbsent: true, pending: true, statusText: '' });
          if (scenario === 'environment-ownership') {
            expect(receipt(root, 'helper-environment-observed.json')).toEqual({
              hasPrivate: false,
              hasProto: false,
              hasConstructor: false,
            });
            expect(receipt(root, 'payload-ready.json')).toMatchObject({
              privateHash: observed['privateHash'],
              proto: 'own-proto',
              constructor: 'own-constructor',
            });
          }
          if (scenario.startsWith('count-')) {
            expect(
              existsSync(join(root, 'helper-forward-attempts.json')),
              'keeper must not forward an already delivered group signal',
            ).toBe(false);
            const signal = scenario.endsWith('HUP')
              ? 'SIGHUP'
              : scenario.endsWith('INT')
                ? 'SIGINT'
                : 'SIGTERM';
            expect(receipt(root, 'count-observation.json')).toEqual({
              counts: scenario.startsWith('count-wrapper')
                ? {}
                : {
                    SIGHUP: signal === 'SIGHUP' ? 1 : 0,
                    SIGINT: signal === 'SIGINT' ? 1 : 0,
                    SIGTERM: signal === 'SIGTERM' ? 1 : 0,
                  },
              helperPending: true,
              native: { kind: 'pending' },
              statusText: '',
            });
          }
          if (scenario === 'diagnostic-stall') {
            expect(receipt(root, 'diagnostic-sink.json')).toEqual({
              writes: 1,
              unrefs: 0,
              flushes: 0,
              canonical: true,
            });
            expect(receipt(root, 'diagnostic-abandoned.json')).toEqual({
              writes: 1,
              unrefs: 1,
              flushes: 0,
            });
            expect(receipt(root, 'helper-completed.json')).toEqual({ failed: true });
          }
        }
      } catch (cause) {
        primary = { kind: 'failed', cause };
      }
      const cleanup = await owner.stop().then(
        () => ({ kind: 'stopped' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      const capture = process.env['PUNI_C34_PROOF_ORACLE_CAPTURE'];
      if (capture !== undefined) {
        mkdirSync(capture, { recursive: true });
        cpSync(root, join(capture, scenario), { recursive: true });
      }
      if (cleanup.kind === 'failed')
        throw primary.kind === 'failed'
          ? new AggregateError([primary.cause, cleanup.cause], 'oracle and reaping failed')
          : cleanup.cause;
      rmSync(root, { recursive: true, force: true });
      if (primary.kind === 'failed') throw primary.cause;
    },
    15000,
  );
