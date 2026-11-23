import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from 'bun:test';

import { readInvocation } from './cli-parser';

for (const alias of ['burokrat', 'bur', 'b']) {
  test(
    'workflow manifest ' + alias + ' request preserves the caller directory through stdin',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'puni-workflow-transport-'));
      const validator = resolve(
        import.meta.dir,
        '../../../../apps/twilight-structure/twilight-burokrat/cli/src/cli.ts',
      );
      try {
        writeFileSync(
          join(root, 'workflow.json'),
          JSON.stringify({
            version: 2,
            project: { id: 'engagement', revision: 7 },
            default: [{ code: 'build', class: 'verify' }],
            types: [],
            classes: { verify: { executor: 'tool', command: 'verify' } },
          }),
        );
        writeFileSync(
          join(root, 'manifest.json'),
          JSON.stringify({
            version: 1,
            project: { id: 'engagement', revision: 7 },
            default: ['build'],
            types: [],
          }),
        );
        const words = [
          'validate',
          'workflow-binding',
          'workflow.json',
          '--manifest',
          'manifest.json',
        ];
        function invoke(label: string, request?: unknown) {
          const stdoutPath = join(root, label + '.stdout'),
            stderrPath = join(root, label + '.stderr');
          const stdout = openSync(stdoutPath, 'wx', 0o600);
          let child: ReturnType<typeof Bun.spawnSync>;
          try {
            const stderr = openSync(stderrPath, 'wx', 0o600);
            try {
              child = Bun.spawnSync({
                cmd: [
                  process.execPath,
                  '--no-env-file',
                  '--config=/dev/null',
                  validator,
                  ...(request === undefined ? words : ['--puni-request-v1']),
                ],
                cwd: request === undefined ? root : import.meta.dir,
                stdin:
                  request === undefined
                    ? 'ignore'
                    : Buffer.from(
                        JSON.stringify({
                          version: 1,
                          callerDirectory: root,
                          request,
                        }),
                      ),
                stdout,
                stderr,
                timeout: 30000,
              });
            } finally {
              closeSync(stderr);
            }
          } finally {
            closeSync(stdout);
          }
          expect(child.signalCode ?? null).toBeNull();
          expect(child.exitCode).toBe(0);
          expect(readFileSync(stderrPath, 'utf8')).toBe('');
          return readFileSync(stdoutPath, 'utf8');
        }
        const expected = invoke('baseline');
        expect(expected).toMatch(/^[0-9a-f]{64}\n$/);
        const invocation = readInvocation([alias, ...words], () => {
          throw Error('unexpected discovery');
        });
        if (invocation.kind !== 'command' || invocation.command.tool !== 'burokrat')
          throw Error('expected typed Burokrat request');
        expect(invoke('transport', invocation.command.request)).toBe(expected);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
}
