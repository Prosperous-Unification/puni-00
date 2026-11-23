import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
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
function isolateHome(anchor: string, scratch: string): void {
  const retained = join(anchor, 'home');
  const storage = join(anchor, 'private');
  const assigned = join(anchor, 'scratch');
  mountNamespace(['--make-rprivate', '/']);
  for (const directory of [retained, storage, assigned]) mkdirSync(directory);
  mountNamespace(['--rbind', '/home', retained]);
  mountNamespace(['--bind', scratch, assigned]);
  mountNamespace(['-t', 'tmpfs', 'tmpfs', storage]);
  mountNamespace(['-t', 'tmpfs', 'tmpfs', '/home']);
  for (const name of readdirSync(retained)) {
    const original = join(retained, name);
    if (!existsSync(original)) continue;
    if (name === 'puni1' && process.env['HOME'] !== '/home/puni1') continue;
    const destination = join('/home', name);
    mkdirSync(destination);
    mountNamespace(['--rbind', original, destination]);
  }
  const home = '/home/puni1';
  mkdirSync(home, { recursive: true });
  for (const name of ['.config', '.cache', '.local']) {
    const directory = join(home, name);
    if (process.env['HOME'] === home) {
      if (!statSync(directory).isDirectory())
        throw new Error('launcher namespace authority directory is not a directory');
    } else mkdirSync(directory, { recursive: true });
    const privateDirectory = join(storage, name);
    mkdirSync(privateDirectory);
    mountNamespace(['--bind', privateDirectory, directory]);
  }
}

const arguments_ = process.argv.slice(2),
  anchor = arguments_.at(0),
  scratch = arguments_.at(1),
  argv = arguments_.slice(2),
  executable = argv.at(0);
if (anchor === undefined || scratch === undefined || executable === undefined)
  throw new Error('launcher namespace roots or command are missing');
if (process.execve === undefined) throw new Error('launcher namespace execve is unavailable');
isolateHome(anchor, scratch);
const environment: Record<string, string> = {};
for (const [name, value] of Object.entries(process.env))
  if (value !== undefined) environment[name] = value;
environment['DASH_LAUNCHER_TEST_ANCHOR'] = anchor;
environment['TMPDIR'] = join(anchor, 'scratch');
process.execve(executable, argv, environment);
