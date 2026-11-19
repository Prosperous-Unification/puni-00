import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

const repository = resolve(import.meta.dir, '../../../../..');
const selectedRoot = join(repository, 'apps/puni/cli/src/entrypoint.ts');
const projects = '--projects=wbs-be-01,wbs-gw-01,wbs-fe-01,wbs-mcp-01';

function readScript(name: string): string {
  const metadata: unknown = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8'));
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    !('scripts' in metadata) ||
    metadata.scripts === null ||
    typeof metadata.scripts !== 'object' ||
    !(name in metadata.scripts)
  )
    throw new Error('actual package script is absent: ' + name);
  const command: unknown = Reflect.get(metadata.scripts, name);
  if (typeof command !== 'string' || command.length === 0)
    throw new Error('actual package script is not a command: ' + name);
  return command;
}

function readLaunch(path: string): {
  readonly pid: number;
  readonly ppid: number;
  readonly argv: readonly string[];
} {
  const lines = readFileSync(path, 'utf8').split('\n');
  const line = lines.at(0);
  if (lines.length !== 2 || lines.at(1) !== '' || line === undefined)
    throw new Error('finite Nx fixture did not append exactly one launch record');
  const launch: unknown = JSON.parse(line);
  if (
    launch === null ||
    typeof launch !== 'object' ||
    !('pid' in launch) ||
    typeof launch.pid !== 'number' ||
    !Number.isSafeInteger(launch.pid) ||
    launch.pid <= 0 ||
    !('ppid' in launch) ||
    typeof launch.ppid !== 'number' ||
    !Number.isSafeInteger(launch.ppid) ||
    launch.ppid <= 0 ||
    !('argv' in launch) ||
    !Array.isArray(launch.argv)
  )
    throw new Error('finite Nx fixture published malformed native identity/vector');
  const argv: string[] = [];
  for (const value of launch.argv) {
    const word: unknown = value;
    if (typeof word !== 'string') throw new Error('finite Nx argument is not a string');
    argv.push(word);
  }
  return { pid: launch.pid, ppid: launch.ppid, argv };
}

for (const selection of [
  { script: 'dev', target: 'serve', status: 0, capture: false },
  { script: 'dev:local-solver', target: 'serve-local-solver', status: 3, capture: true },
]) {
  it(
    selection.script +
      ' uses selected PUNI development without owned Bash and retains the full finite Nx vector',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'puni complete dev caller '));
      let primary: { readonly cause: unknown } | undefined;
      const custody = { isConfirmed: true };
      try {
        const checkout = join(root, 'consumer checkout');
        const tools = join(root, 'trusted tools');
        const nxDirectory = join(checkout, 'node_modules/nx');
        mkdirSync(join(nxDirectory, 'dist/bin'), { recursive: true });
        mkdirSync(tools);
        const runtime = realpathSync.native(process.execPath);
        const marker = join(root, 'owned-bash-called');
        const launches = join(root, 'nx-launches.jsonl');
        const log = join(root, 'capture directory', 'development.log');
        const command = readScript(selection.script);
        writeFileSync(
          join(checkout, 'package.json'),
          JSON.stringify({
            private: true,
            type: 'module',
            scripts: { [selection.script]: command },
          }) + '\n',
        );
        const copied = [
          'bin/dev.sh',
          'bin/dev-ports.sh',
          'libs/shared/adapters/bun-output/src/index.ts',
          'libs/shared/adapters/bun-output/src/interrupts.ts',
        ];
        // The first epoch has no adapter. Its later delivered bytes, when present, remain actual source.
        if (existsSync(join(repository, 'bin/dev.ts'))) copied.push('bin/dev.ts');
        for (const relative of copied) {
          const source = join(repository, relative),
            destination = join(checkout, relative);
          mkdirSync(dirname(destination), { recursive: true });
          writeFileSync(destination, readFileSync(source), { mode: statSync(source).mode & 0o777 });
        }
        symlinkSync(runtime, join(tools, 'bun'));
        writeFileSync(
          join(tools, 'bash'),
          '#!' +
            runtime +
            '\nconst fs=await import("node:fs");fs.writeFileSync(' +
            JSON.stringify(marker) +
            ',"owned Bash caller reached");process.exit(73);\n',
          { mode: 0o700 },
        );
        writeFileSync(
          join(nxDirectory, 'package.json'),
          JSON.stringify({ name: 'nx', type: 'commonjs', bin: { nx: './dist/bin/nx.js' } }),
        );
        const nx = join(nxDirectory, 'dist/bin/nx.js');
        writeFileSync(
          nx,
          [
            'const fs=require("node:fs");',
            'fs.appendFileSync(' +
              JSON.stringify(launches) +
              ',JSON.stringify({pid:process.pid,ppid:process.ppid,argv:process.argv.slice(2)})+"\\n");',
            'fs.writeSync(1,"\\u001b[32mCALLER-OUT\\u001b[39m\\n");fs.writeSync(2,"CALLER-ERR\\n");',
            'process.exit(' + String(selection.status) + ');',
          ].join('\n'),
        );
        const environment = {
          PATH: tools,
          TMPDIR: root,
          PUNI_EXECUTABLE: selectedRoot,
          WBS_DEV_PORTS: '',
          NO_COLOR: '1',
          LC_ALL: 'C',
          LANG: 'C',
        };
        function runOwned(argv: readonly string[], cwd: string, variables: Record<string, string>) {
          custody.isConfirmed = false;
          const child = Bun.spawnSync([...argv], {
            cwd,
            env: variables,
            stdin: 'ignore',
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 10000,
            killSignal: 'SIGKILL',
            maxBuffer: 1024 * 1024,
          });
          custody.isConfirmed =
            child.signalCode === undefined &&
            !child.exitedDueToTimeout &&
            !child.exitedDueToMaxBuffer;
          return child;
        }
        const controlDirectory = join(root, 'Bun-only launcher');
        mkdirSync(controlDirectory);
        writeFileSync(
          join(controlDirectory, 'package.json'),
          JSON.stringify({
            private: true,
            scripts: { probe: 'bun --no-env-file --config=/dev/null ./entry.ts' },
          }),
        );
        writeFileSync(
          join(controlDirectory, 'entry.ts'),
          'process.stdout.write("BUN-ONLY-DEV-CALLER\\n");\n',
        );
        const launcher = runOwned(
          [runtime, '--no-env-file', '--config=/dev/null', 'run', '--shell=bun', 'probe'],
          controlDirectory,
          environment,
        );
        expect(launcher.signalCode).toBeUndefined();
        expect(launcher.exitedDueToTimeout).toBe(false);
        expect(launcher.exitedDueToMaxBuffer).toBe(false);
        expect(launcher.exitCode, launcher.stderr.toString()).toBe(0);
        expect(launcher.stdout.toString()).toBe('BUN-ONLY-DEV-CALLER\n');
        expect(existsSync(marker)).toBe(false);
        const baseline = runOwned(
          [
            runtime,
            '--no-env-file',
            '--config=/dev/null',
            nx,
            'run-many',
            '-t',
            selection.target,
            projects,
          ],
          checkout,
          environment,
        );
        expect(baseline.signalCode).toBeUndefined();
        expect(baseline.exitedDueToTimeout).toBe(false);
        expect(baseline.exitedDueToMaxBuffer).toBe(false);
        expect(baseline.exitCode, baseline.stderr.toString()).toBe(selection.status);
        expect(baseline.stdout.toString()).toBe('\u001b[32mCALLER-OUT\u001b[39m\n');
        expect(baseline.stderr.toString()).toBe('CALLER-ERR\n');
        expect(readLaunch(launches).argv).toEqual(['run-many', '-t', selection.target, projects]);
        unlinkSync(launches);
        expect(existsSync(launches)).toBe(false);
        const child = runOwned(
          [runtime, '--no-env-file', '--config=/dev/null', 'run', '--shell=bun', selection.script],
          checkout,
          selection.capture ? { ...environment, WBS_DEV_LOG: log } : environment,
        );
        expect(child.signalCode).toBeUndefined();
        expect(child.exitedDueToTimeout).toBe(false);
        expect(child.exitedDueToMaxBuffer).toBe(false);
        // This is the intended first owned-caller oracle after independent launcher/Nx premises.
        expect(existsSync(marker)).toBe(false);
        expect(child.exitCode, child.stderr.toString()).toBe(selection.status);
        expect(readLaunch(launches).argv).toEqual(['run-many', '-t', selection.target, projects]);
        if (selection.capture) {
          expect(child.stdout.toString()).toBe('\u001b[32mCALLER-OUT\u001b[39m\nCALLER-ERR\n');
          expect(readFileSync(log, 'utf8')).toBe('CALLER-OUT\nCALLER-ERR\n');
          expect(child.stderr.toString()).toContain(
            'WBS_DEV_PORTS is set and empty: no dev port is being checked\n',
          );
        } else {
          expect(child.stdout.toString()).toBe('\u001b[32mCALLER-OUT\u001b[39m\n');
          expect(child.stderr.toString()).toContain('CALLER-ERR\n');
          expect(existsSync(log)).toBe(false);
        }
      } catch (cause: unknown) {
        primary = { cause };
      }
      let cleanup: { readonly cause: unknown } | undefined;
      if (custody.isConfirmed) {
        try {
          rmSync(root, { recursive: true });
        } catch (cause: unknown) {
          cleanup = { cause };
        }
      } else
        cleanup = {
          cause: new Error('direct sync-child settlement unconfirmed; fixture retained: ' + root),
        };
      if (primary !== undefined && cleanup !== undefined)
        throw new AggregateError(
          [primary.cause, cleanup.cause],
          'development caller and fixture removal failed',
          { cause: primary.cause },
        );
      if (primary !== undefined) throw primary.cause;
      if (cleanup !== undefined) throw cleanup.cause;
    },
    45000,
  );
}
