import { dirname, join, resolve } from 'node:path';

import {
  preparePackageRelease,
  readPackageReleaseRecord,
  type RegistryVersionState,
  verifyPackageRelease,
} from './release';

interface RegistryInvocation {
  readonly exitCode: number;
  readonly stderr: Uint8Array;
  readonly stdout: Uint8Array;
}

type RegistryRunner = (command: string[]) => RegistryInvocation;

/** Accept only GitHub's authoritative absence response; every other state blocks creation. */
export function assertGitHubReleaseAbsent(status: string): void {
  if (status === '404') return;
  // Proof: injecting 500 made the workflow adapter continue as if the release were absent until
  // this refusal distinguished lookup failure from GitHub's explicit 404 response.
  if (status !== '200') throw new Error(`cannot determine GitHub release state: HTTP ${status}`);
  throw new Error('GitHub release already exists');
}

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

type Delay = (milliseconds: number) => Promise<void>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Wait for the published coordinate, then compare registry integrity to the tested tarball. */
export async function verifyPublishedPackage(
  recordPath: string,
  run: RegistryRunner = (command) => Bun.spawnSync(command, { stderr: 'pipe', stdout: 'pipe' }),
  delay: Delay = Bun.sleep,
): Promise<string> {
  const transferred = readPackageReleaseRecord(recordPath);
  const record = verifyPackageRelease(recordPath, join(dirname(recordPath), transferred.tarball));
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const invocation = run(['bun', 'info', `${record.packageName}@${record.version}`, '--json']);
    const stdout = new TextDecoder().decode(invocation.stdout);
    const stderr = new TextDecoder().decode(invocation.stderr);
    if (invocation.exitCode === 0) {
      let metadata: unknown;
      try {
        metadata = JSON.parse(stdout) as unknown;
      } catch (cause) {
        // Proof: injecting a successful registry response containing `{` made the production
        // verifier throw an unlabelled JSON diagnostic until this boundary named the metadata.
        throw new Error('published registry metadata is malformed', { cause });
      }
      const integrity = isRecord(metadata) ? metadata['dist'] : undefined;
      const publishedIntegrity = isRecord(integrity) ? integrity['integrity'] : undefined;
      // Proof: injecting another valid sha512 integrity made post-publication verification pass
      // until this comparison joined the registry coordinate back to the tested tarball.
      if (publishedIntegrity !== record.integrity) {
        throw new Error(
          `published registry integrity differs from release record: ${String(publishedIntegrity)}`,
        );
      }
      return `${record.packageName}@${record.version} ${record.integrity}`;
    }
    if (!/404|not found/i.test(`${stdout}\n${stderr}`)) {
      // Proof: injecting a registry timeout made the retry loop classify unknown state as
      // propagation until this refusal preserved the transport failure.
      throw new Error(`cannot read published registry package: ${stderr.trim() || stdout.trim()}`);
    }
    if (attempt < 12) await delay(5_000);
  }
  // Proof: injecting twelve 404 responses made the verifier return without proving publication
  // until this bounded-convergence refusal made the missing coordinate release-blocking.
  throw new Error(
    `published registry package did not become readable: ${record.packageName}@${record.version}`,
  );
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
    const flags = readFlags(arguments_, [
      'tag',
      'repository',
      'tarball',
      'record',
      'source-revision',
    ]);
    const release = await preparePackageRelease(
      {
        record: resolve(flags['record']),
        repository: resolve(flags['repository']),
        tag: flags['tag'],
        tarball: resolve(flags['tarball']),
        eventRevision: flags['source-revision'],
      },
      lookupRegistryVersion,
    );
    return JSON.stringify(release);
  }
  if (command === 'verify') {
    const flags = readFlags(arguments_, ['tarball', 'record', 'source-revision']);
    return JSON.stringify(
      verifyPackageRelease(
        resolve(flags['record']),
        resolve(flags['tarball']),
        flags['source-revision'],
      ),
    );
  }
  if (command === 'github-release-absent') {
    const flags = readFlags(arguments_, ['status']);
    assertGitHubReleaseAbsent(flags['status']);
    return 'GitHub release is absent';
  }
  if (command === 'verify-registry') {
    const flags = readFlags(arguments_, ['record']);
    return verifyPublishedPackage(resolve(flags['record']));
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
