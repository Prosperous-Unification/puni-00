import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

for (const fault of ['none', 'root', 'installation', 'ack', 'other'] as const)
  test('fixed pressure ACK owner dispatch ' + fault, async () => {
    const source = await readFile(
      new URL('./registry-maintenance-host.native.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('async function owner(mode: string) {');
    const end = source.indexOf("  populationBoundary = 'ports';", start);
    if (start < 0 || end < start) throw new Error('Missing actual owner installation boundary');
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source.slice(start, end) + '\nreturn "ordinary-owner";\n}',
    );
    const effects: unknown[] = [];
    const installed = { identity: 'exact installed fixture' };
    const acknowledgement = {
      allocation: 'ENOSPC',
      stage: 'write',
      requestSha256: 'a'.repeat(64),
      instanceSha256: 'b'.repeat(64),
    };
    const failure = new Error('Modeled required dependency failed');
    // Boundary: actual fixed owner prefix; root transport and allocator effects are modeled capabilities.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function(
      'process',
      'readRegistryMaintenanceInstallation',
      'proveRegistryPressureAcknowledgement',
      'console',
      'let populationBoundary;\n' + body + '\nreturn owner;',
    ) as (...ports: unknown[]) => (mode: string) => Promise<unknown>;
    const owner = invoke(
      { getuid: () => (fault === 'root' ? 0 : 59001), getgid: () => 59001 },
      () => {
        effects.push('installation');
        return fault === 'installation' ? Promise.reject(failure) : Promise.resolve(installed);
      },
      (selected: unknown) => {
        effects.push(['ack', selected]);
        return fault === 'ack' ? Promise.reject(failure) : Promise.resolve(acknowledgement);
      },
      {
        log: (serialized: string) => {
          effects.push(['receipt', serialized]);
        },
      },
    );
    const call = owner(fault === 'other' ? 'pressure-ack-extra' : 'pressure-ack');
    if (fault === 'root') {
      const refused = await call.then(
        () => undefined,
        (cause: unknown) => cause,
      );
      expect(refused).toMatchObject({ message: 'Wrong fixture owner' });
      expect(effects).toEqual([]);
    } else if (fault === 'installation' || fault === 'ack') {
      const refused = await call.then(
        () => undefined,
        (cause: unknown) => cause,
      );
      expect(refused).toBe(failure);
      expect(effects).toEqual(
        fault === 'installation' ? ['installation'] : ['installation', ['ack', installed]],
      );
    } else if (fault === 'other') {
      expect(await call).toBe('ordinary-owner');
      expect(effects).toEqual(['installation']);
    } else {
      expect(await call).toBeUndefined();
      expect(effects).toEqual([
        'installation',
        ['ack', installed],
        ['receipt', JSON.stringify(acknowledgement)],
      ]);
    }
  });
