import { expect, test } from 'bun:test';

for (const mode of ['deletion-census', 'deletion-recover'] as const)
  for (const fault of ['none', 'operation', 'observation', 'both'] as const)
    test(`fixed partial owner ${mode} preserves held-session operation and observation ${fault}`, async () => {
      const source = await Bun.file(
        new URL('./registry-maintenance-host.native.ts', import.meta.url),
      ).text();
      const start = source.indexOf(
        "  if (mode === 'deletion-census' || mode === 'deletion-recover')",
      );
      const end = source.indexOf("  if (!['backup', 'retire'].includes(mode))", start);
      const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
        'async function owner() {' + source.slice(start, end) + '}',
      );
      const calls: string[] = [],
        output: string[] = [];
      const operationFailure = new Error('private operation'),
        observationFailure = new Error('private observation');
      const ports = {},
        runtime = { backup: {}, recovery: {} },
        session = {},
        verifier = { recoverRegistry: Symbol('actual verifier') };
      const run = (kind: string, _input: unknown) => {
        calls.push(kind);
        return fault === 'operation' || fault === 'both'
          ? Promise.reject(operationFailure)
          : Promise.resolve();
      };
      // Boundary: execute only the owned source slice; every effect port is explicit and modeled.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const invoke = new Function(
        'mode',
        'directory',
        'ports',
        'createRegistryMaintenanceRuntime',
        'startRegistryHttpObservation',
        'runRegistryMaintenance',
        'requireRegistryPartialCensus',
        'createRegistryRecoveryVerifier',
        'stageRegistryRecovery',
        'console',
        body + '; return owner();',
      ) as (...arguments_: unknown[]) => Promise<void>;
      const pending = invoke(
        mode,
        '/canonical',
        ports,
        () => runtime,
        () => ({
          finish: () => {
            if (fault === 'observation' || fault === 'both') throw observationFailure;
            return { pending: 0 };
          },
        }),
        async (
          directory: string,
          operation: unknown,
          actualPorts: unknown,
          callback: (session: unknown) => Promise<void>,
        ) => {
          expect(directory).toBe('/canonical');
          expect(operation).toEqual({
            operationId: 'native-host-retire',
            owner: 'operator',
            kind: 'retirement',
            recover: true,
          });
          expect(actualPorts).toBe(ports);
          await callback(session);
        },
        async (input: unknown) => {
          expect(input).toEqual({ session, runtime, ports });
          await run('census', input);
        },
        (input: unknown) => {
          expect(input).toEqual({
            runtime: runtime.recovery,
            backup: runtime.backup,
            consumers: ports,
          });
          return verifier;
        },
        async (input: unknown) => {
          expect(input).toEqual({
            directory: '/canonical',
            operationId: 'native-host-retire',
            owner: 'operator',
            kind: 'retirement',
            ports: { ...ports, ...verifier },
            runtime,
            backup: runtime.backup,
          });
          await run('recover', input);
        },
        { error: (line: string) => output.push(line), log: (line: string) => output.push(line) },
      );
      const rejected = await pending.then(
        () => undefined,
        (cause: unknown) => cause,
      );
      expect(calls).toEqual([mode === 'deletion-census' ? 'census' : 'recover']);
      if (fault === 'both') {
        expect(rejected).toBeInstanceOf(AggregateError);
        expect((rejected as AggregateError).errors).toEqual([operationFailure, observationFailure]);
        expect((rejected as Error).cause).toBe(operationFailure);
      } else if (fault === 'operation') expect(rejected).toBe(operationFailure);
      else if (fault === 'observation') expect(rejected).toBe(observationFailure);
      else {
        expect(rejected).toBeUndefined();
        expect(output.at(-1)).toBe(
          mode === 'deletion-recover'
            ? 'partial-recovery-staged-fenced'
            : 'partial-census-returned',
        );
      }
      expect(output.join('')).not.toContain('private');
    });

for (const [suffix, action, expected] of [
  ['prove-tag-recovery\0', 'serve-deletion', 'tag'],
  ['prove-tag-recovery\0', 'serve-readonly', 'direct'],
  ['prove-tag-recovery\0', 'backup-restore', 'direct'],
  ['prove-tag-recovery\0extra\0', 'serve-deletion', 'direct'],
] as const)
  test(`exact root dispatch ${suffix.replaceAll('\0', ':')} ${action}`, async () => {
    const source = await Bun.file(
      new URL('./registry-maintenance-host.native.ts', import.meta.url),
    ).text();
    const start = source.indexOf('        const dispatch =');
    const end = source.indexOf('        const receipt = await dispatch', start);
    // Boundary: execute only the owned source slice; every effect port is explicit and modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function(
      'fixtureCommand',
      'request',
      'isDirectFixture',
      'collectRegistryUnsafeFixture',
      'failRegistryTagCleanupFixture',
      'executeRegistryHostAction',
      'proveRegistryCollectionAdmission',
      'proveRegistryUploadGrace',
      source.slice(start, end) + '; return dispatch;',
    ) as (...arguments_: unknown[]) => unknown;
    expect(
      invoke(
        '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0' +
          suffix,
        { action },
        true,
        'unsafe',
        'tag',
        'direct',
        'collection',
        'grace',
      ),
    ).toBe(expected);
  });
