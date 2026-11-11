import { mkdirSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Run mount operations inside the caller's private user, mount and PID namespace. */
function mountNamespace(arguments_: readonly string[]): void {
  const execution = Bun.spawnSync(['mount', ...arguments_], {
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (execution.exitCode !== 0) throw new Error('launcher namespace mount failed');
}

/** Preserve checkout paths while isolating the fixed host-pool account's writable state. */
function isolateHome(): void {
  const retained = mkdtempSync(join(tmpdir(), 'puni launcher home '));
  mountNamespace(['--make-rprivate', '/']);
  mountNamespace(['--rbind', '/home', retained]);
  mountNamespace(['-t', 'tmpfs', 'tmpfs', '/home']);
  for (const name of readdirSync(retained)) {
    const destination = join('/home', name);
    mkdirSync(destination);
    mountNamespace(['--rbind', join(retained, name), destination]);
  }
  const home = '/home/puni1';
  mkdirSync(home, { recursive: true });
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error('launcher namespace UID is unavailable');
  // A foreign UID is unmapped here, so namespace root cannot create its private subdirectories.
  // The entire foreign home can be overlaid: this account's checkout lives in another home.
  if (statSync(home).uid !== uid) mountNamespace(['-t', 'tmpfs', 'tmpfs', home]);
  for (const name of ['.config', '.cache', '.local']) {
    const directory = join(home, name);
    mkdirSync(directory, { recursive: true });
    mountNamespace(['-t', 'tmpfs', 'tmpfs', directory]);
  }
}

const argv = process.argv.slice(2),
  executable = argv.at(0);
if (executable === undefined) throw new Error('launcher namespace command is missing');
if (process.execve === undefined) throw new Error('launcher namespace execve is unavailable');
isolateHome();
const environment: Record<string, string> = {};
for (const [name, value] of Object.entries(process.env))
  if (value !== undefined) environment[name] = value;
process.execve(executable, argv, environment);
