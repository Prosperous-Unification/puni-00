import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';
import ts from 'typescript';

import { createWritePermit } from './registry-capacity';

/** Actual selected callback and actual revocation implementation with real files. Fixed-path mapping, unreadability, abort timing and the ACK subprocess are modeled. */
for (const fault of [
  'later-revocation',
  'missing',
  'unreadable',
  'abort-before',
  'abort-read',
  'probe-error',
] as const)
  test('selected pressure request capture ' + fault, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'registry-selected-request-'));
    try {
      const journal = join(directory, 'journal');
      const registry = join(directory, 'registry');
      await mkdir(journal, { mode: 0o700 });
      await mkdir(registry, { mode: 0o700 });
      const instance =
        '11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222\n';
      await writeFile(join(registry, '.authority-instance'), instance, { flag: 'wx', mode: 0o600 });
      const permit = createWritePermit(
        journal,
        () => {
          throw new Error('Unexpected capacity measurement');
        },
        registry,
      );
      const path = join(journal, 'readonly.request');
      await permit.revoke();
      const prior = await readFile(path, 'utf8');
      await permit.revoke();
      const selectedRequest = await readFile(path, 'utf8');
      expect(selectedRequest).not.toBe(prior);
      const source = await readFile(
        new URL('./registry-maintenance-pressure.native.ts', import.meta.url),
        'utf8',
      );
      const parsed = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
      let callback: ts.ArrowFunction | undefined;
      const find = (node: ts.Node) => {
        if (
          callback === undefined &&
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'startRegistryPressureBridge'
        ) {
          const argument = node.arguments.at(1);
          if (argument === undefined || !ts.isArrowFunction(argument))
            throw new Error('Missing selected callback');
          callback = argument;
        }
        ts.forEachChild(node, find);
      };
      find(parsed);
      if (callback === undefined) throw new Error('Missing selected callback source');
      const selected = new AbortController();
      const failure = Object.assign(new Error('modeled selected failure'), { code: 'EACCES' });
      if (fault === 'abort-before') selected.abort(failure);
      if (fault === 'missing') await unlink(path);
      let reads = 0;
      let probes = 0;
      let readFailure: unknown;
      const installed = { ordinary: { path: '/var/lib/puni-registry/registry/contents' } };
      const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
      // Boundary: exact first selected callback; real revocation/files, modeled path mapping and probe.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const compile = new Function(
        'readRegistryPressureRecord',
        'runRegistryPressureAcknowledgement',
        'installed',
        'let selectedRequest;\n' +
          new Bun.Transpiler({ loader: 'ts' }).transformSync(
            'const acknowledge = ' + callback.getText(parsed) + ';',
          ) +
          '\nreturn { acknowledge, captured: () => selectedRequest };',
      ) as (...ports: unknown[]) => {
        acknowledge: (signal: AbortSignal) => Promise<unknown>;
        captured: () => string | undefined;
      };
      const observed = compile(
        async (fixed: string) => {
          reads++;
          expect(fixed).toBe('/var/lib/puni-registry/journal/contents/readonly.request');
          if (fault === 'unreadable') throw failure;
          try {
            const request = await readFile(path, 'utf8');
            if (fault === 'abort-read') selected.abort(failure);
            return request;
          } catch (cause) {
            readFailure = cause;
            throw cause;
          }
        },
        async (owner: unknown, signal: AbortSignal) => {
          probes++;
          expect(owner).toBe(installed);
          expect(signal).toBe(selected.signal);
          if (fault === 'probe-error') throw failure;
          return {
            instanceSha256: hash(instance),
            requestSha256: hash(await readFile(path, 'utf8')),
            allocation: 'ENOSPC',
            stage: 'write',
          };
        },
        installed,
      );
      let receipt: unknown;
      let refused: unknown;
      try {
        receipt = await observed.acknowledge(selected.signal);
      } catch (cause) {
        refused = cause;
      }
      if (fault === 'later-revocation') {
        expect(refused).toBeUndefined();
        await permit.revoke();
        const latest = await readFile(path, 'utf8');
        expect(latest).not.toBe(selectedRequest);
        expect(observed.captured()).toBe(selectedRequest);
        expect(receipt).toMatchObject({ requestSha256: hash(selectedRequest) });
        expect(reads).toBe(1);
        expect(probes).toBe(1);
      } else {
        expect(refused).toBe(fault === 'missing' ? readFailure : failure);
        expect(refused).toBeInstanceOf(Error);
        expect(observed.captured()).toBeUndefined();
        expect(reads).toBe(fault === 'abort-before' ? 0 : 1);
        expect(probes).toBe(fault === 'probe-error' ? 1 : 0);
      }
    } finally {
      await rm(directory, { recursive: true });
    }
  });
