import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

const repository = resolve(import.meta.dir, '../../../../..');
const selectedRoot = join(repository, 'apps/puni/cli/src/entrypoint.ts');

for (const script of ['dev:ports', 'dev:kill']) {
  it(
    script + ' invokes the selected PUNI development-port operation without executing owned Bash',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'puni dev-port caller '));
      const tools = join(root, 'trusted tools');
      mkdirSync(tools);
      const marker = join(root, 'bash-called');
      const runtime = realpathSync.native(process.execPath);
      const lsof = Bun.which('lsof');
      if (lsof === null) throw new Error('actual development release caller control requires lsof');
      symlinkSync(runtime, join(tools, 'bun'));
      symlinkSync(realpathSync.native(lsof), join(tools, 'lsof'));
      writeFileSync(
        join(tools, 'bash'),
        '#!' +
          runtime +
          '\n' +
          'const fs=await import("node:fs");fs.writeFileSync(' +
          JSON.stringify(marker) +
          ',"owned Bash caller reached");process.exit(73);\n',
        { mode: 0o700 },
      );
      let primary: { readonly cause: unknown } | undefined;
      try {
        expect(readFileSync(selectedRoot, 'utf8')).toContain('export async function main(');
        const runtimeControl = Bun.spawnSync(
          [runtime, '--no-env-file', '--config=/dev/null', '--version'],
          {
            cwd: repository,
            env: { PATH: tools },
            stdin: 'ignore',
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 10000,
            killSignal: 'SIGKILL',
            maxBuffer: 1024 * 1024,
          },
        );
        expect(runtimeControl.exitCode, runtimeControl.stderr.toString()).toBe(0);
        expect(runtimeControl.signalCode).toBeUndefined();
        expect(existsSync(marker)).toBe(false);
        const launcherControl = join(root, 'Bun-only package control');
        mkdirSync(launcherControl);
        writeFileSync(
          join(launcherControl, 'package.json'),
          JSON.stringify({
            private: true,
            type: 'module',
            scripts: { probe: 'bun --no-env-file --config=/dev/null ./entry.ts' },
          }) + '\n',
        );
        writeFileSync(
          join(launcherControl, 'entry.ts'),
          'process.stdout.write("BUN-ONLY-CALLER-CONTROL\\n");\n',
        );
        const controlled = Bun.spawnSync(
          [runtime, '--no-env-file', '--config=/dev/null', 'run', '--shell=bun', 'probe'],
          {
            cwd: launcherControl,
            env: {
              PATH: tools,
              TMPDIR: root,
              PUNI_EXECUTABLE: selectedRoot,
              WBS_DEV_PORTS: '',
              NO_COLOR: '1',
              LC_ALL: 'C',
              LANG: 'C',
            },
            stdin: 'ignore',
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 10000,
            killSignal: 'SIGKILL',
            maxBuffer: 1024 * 1024,
          },
        );
        expect(controlled.signalCode, controlled.stderr.toString()).toBeUndefined();
        expect(controlled.exitedDueToTimeout).toBe(false);
        expect(controlled.exitedDueToMaxBuffer).toBe(false);
        expect(controlled.exitCode, controlled.stderr.toString()).toBe(0);
        expect(controlled.stdout.toString()).toBe('BUN-ONLY-CALLER-CONTROL\n');
        expect(existsSync(marker)).toBe(false);
        const child = Bun.spawnSync(
          [runtime, '--no-env-file', '--config=/dev/null', 'run', '--shell=bun', script],
          {
            cwd: repository,
            env: {
              PATH: tools,
              TMPDIR: root,
              PUNI_EXECUTABLE: selectedRoot,
              WBS_DEV_PORTS: '',
              NO_COLOR: '1',
              LC_ALL: 'C',
              LANG: 'C',
            },
            stdin: 'ignore',
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 10000,
            killSignal: 'SIGKILL',
            maxBuffer: 1024 * 1024,
          },
        );
        expect(child.signalCode, child.stderr.toString()).toBeUndefined();
        expect(child.exitedDueToTimeout).toBe(false);
        expect(child.exitedDueToMaxBuffer).toBe(false);
        expect(existsSync(marker)).toBe(false);
        expect(child.exitCode, child.stderr.toString()).toBe(0);
        expect(child.stderr.toString()).toContain(
          'WBS_DEV_PORTS is set and empty: no dev port is being checked\n',
        );
        expect(child.stdout.toString()).toBe(
          script === 'dev:kill' ? 'every dev port is already free\n' : '',
        );
      } catch (cause: unknown) {
        primary = { cause };
      }
      let cleanup: { readonly cause: unknown } | undefined;
      try {
        rmSync(root, { recursive: true });
      } catch (cause: unknown) {
        cleanup = { cause };
      }
      if (primary !== undefined && cleanup !== undefined)
        throw new AggregateError(
          [primary.cause, cleanup.cause],
          'dev-port caller and fixture removal failed',
          { cause: primary.cause },
        );
      if (primary !== undefined) throw primary.cause;
      if (cleanup !== undefined) throw cleanup.cause;
    },
    15000,
  );
}
