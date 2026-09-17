import { resolve } from 'node:path';

import { preparePackageRelease, type RegistryVersionState, verifyPackageRelease } from './release';

interface RegistryInvocation {
  readonly exitCode: number;
  readonly stderr: Uint8Array;
  readonly stdout: Uint8Array;
}

type RegistryRunner = (command: string[]) => RegistryInvocation;

/** Read one immutable package coordinate without treating registry failures as absence. */
export function lookupRegistryVersion(
  packageName: 'twilight-bureaucrat',
  version: string,
  run: RegistryRunner = (command) => Bun.spawnSync(command, { stderr: 'pipe', stdout: 'pipe' }),
): Promise<RegistryVersionState> {
  const invocation = run(['bun', 'info', `${packageName}@${version}`, '--json']);
  if (invocation.exitCode === 0) return Promise.resolve('present');
  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
  const diagnostic = `${decode(invocation.stdout)}\n${decode(invocation.stderr)}`;
  if (/404|not found/i.test(diagnostic)) return Promise.resolve('absent');
  // Proof: injecting a registry timeout exited nonzero and was misclassified as an available name
  // until this branch preserved unknown registry state as a release-blocking failure.
  return Promise.reject(new Error(`cannot determine registry version state: ${diagnostic.trim()}`));
}

function readFlags(argv: readonly string[], names: readonly string[]): Record<string, string> {
  if (argv.length % 2 !== 0) throw new Error('release flag is incomplete');
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name.startsWith('--')) throw new Error('release flag is incomplete');
    const key = name.slice(2);
    if (!names.includes(key)) throw new Error(`unknown release flag: ${name}`);
    if (flags.has(key)) throw new Error(`repeated release flag: ${name}`);
    flags.set(key, value);
  }
  for (const name of names) {
    if (!flags.has(name)) throw new Error(`missing required release flag: --${name}`);
  }
  return Object.fromEntries(flags);
}

/** Run the preparation or cross-job verification boundary used by the package release workflow. */
export async function runPackageRelease(argv: readonly string[]): Promise<string> {
  if (argv.length === 0) throw new Error('unknown package release command: (absent)');
  const [command, ...arguments_] = argv;
  if (command === 'prepare') {
    const flags = readFlags(arguments_, ['tag', 'repository', 'tarball', 'record']);
    const release = await preparePackageRelease(
      {
        record: resolve(flags['record']),
        repository: resolve(flags['repository']),
        tag: flags['tag'],
        tarball: resolve(flags['tarball']),
      },
      lookupRegistryVersion,
    );
    return JSON.stringify(release);
  }
  if (command === 'verify') {
    const flags = readFlags(arguments_, ['tarball', 'record']);
    return JSON.stringify(
      verifyPackageRelease(resolve(flags['record']), resolve(flags['tarball'])),
    );
  }
  throw new Error(`unknown package release command: ${command}`);
}

if (import.meta.main) {
  try {
    process.stdout.write(`${await runPackageRelease(process.argv.slice(2))}\n`);
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
