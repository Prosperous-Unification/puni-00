import { constants } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { type } from 'arktype';

import { admitBuilderScratch, admitScratch, measureVerifiedFilesystem } from './registry-capacity';
import { parseRegistryCommandResponse } from './registry-journal';
import type { RegistryAuthority } from './registry-publication';

const Path = type('string > 0').narrow(isAbsolute);
const Machine = type(/^[0-9a-f]{32}$/);
const Enrollment = type({
  schemaVersion: '1',
  registryUrl: 'string > 0',
  registryId: 'string > 0',
  authorityMachineId: Machine,
  registryPath: Path,
  journalPath: Path,
  sshHost: /^[a-zA-Z0-9][a-zA-Z0-9.@-]*$/,
  owner: 'string > 0',
  product: 'string > 0',
  requiredRepositories: type(/^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/)
    .array()
    .atLeastLength(1),
  'caPath?': Path,
  builder: {
    uid: 'number.integer > 0 & number.integer < 61184',
    machineId: Machine,
    path: Path,
    receiptPath: Path,
    maximumBytes: 'number.safe > 0',
    maximumInodes: 'number.safe > 0',
    excludedFilesystems: type({ machineId: Machine, path: Path, '+': 'reject' }).array(),
    '+': 'reject',
  },
  '+': 'reject',
});
export type ManagedRegistry = typeof Enrollment.infer;

/** Root-owned regular enrollment is read from the same no-follow descriptor that was checked. */
async function readTrustedEnrollment(path: string): Promise<unknown> {
  if (!isAbsolute(path) || (await realpath(path)) !== path)
    throw new Error('Enrollment path is not canonical');
  const descriptor = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const status = await descriptor.stat();
    if (
      !status.isFile() ||
      status.uid !== 0 ||
      status.gid !== 0 ||
      (status.mode & 0o777) !== 0o644 ||
      status.nlink !== 1 ||
      status.size > 65536
    )
      // Proof: native removal admitted the same enrollment file after its owner changed to UID59001.
      throw new Error('Untrusted registry publication enrollment');
    return JSON.parse(await descriptor.readFile('utf8'));
  } finally {
    await descriptor.close();
  }
}

/** Explicit selected enrollment never degrades to the legacy registry path on failure. */
export async function readPublicationEnrollment(
  registry: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ManagedRegistry | undefined> {
  const path = env['REGISTRY_PUBLICATION_ENROLLMENT'];
  if (path === undefined) return undefined;
  const enrollment = Enrollment(await readTrustedEnrollment(path));
  if (enrollment instanceof type.errors)
    throw new Error(`Malformed publication enrollment: ${enrollment.summary}`);
  if (
    enrollment.registryUrl !== registry ||
    new Set(enrollment.requiredRepositories).size !== enrollment.requiredRepositories.length
  )
    // Proof: native removal admitted the same configuration for a different target registry.
    throw new Error('Publication enrollment registry or required repositories mismatch');
  const endpoint = new URL(enrollment.registryUrl);
  if (
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.pathname !== '/' ||
    endpoint.search !== '' ||
    endpoint.hash !== '' ||
    !['https:', 'http:'].includes(endpoint.protocol)
  )
    throw new Error('Invalid enrolled registry endpoint');
  return enrollment;
}

/** Trusted machine IDs select only genuinely co-located exclusion paths; missing local paths throw. */
export async function admitExportScratch(enrollment: ManagedRegistry) {
  const machineId = (await readFile('/etc/machine-id', 'utf8')).trim();
  if (machineId !== enrollment.builder.machineId)
    // Proof: native removal admitted an enrollment naming another builder machine.
    throw new Error('Builder machine identity mismatch');
  const owner = await lstat(enrollment.builder.path);
  if (
    process.getuid?.() !== enrollment.builder.uid ||
    owner.uid !== enrollment.builder.uid ||
    owner.gid !== enrollment.builder.uid ||
    (owner.mode & 0o777) !== 0o700 ||
    !owner.isDirectory()
  )
    // Proof: native removal admitted UID59002 enrollment while the actual caller and scratch owner were UID59001.
    throw new Error('Builder scratch owner or caller differs from enrollment');
  // Proof: native removal of these mandatory local exclusions admitted the actual registry volume as scratch.
  const targetPaths =
    enrollment.authorityMachineId === machineId
      ? [enrollment.registryPath, enrollment.journalPath]
      : [];
  return admitBuilderScratch({
    path: enrollment.builder.path,
    receiptPath: enrollment.builder.receiptPath,
    excludedPaths: [
      ...targetPaths,
      ...enrollment.builder.excludedFilesystems
        .filter((filesystem) => filesystem.machineId === machineId)
        .map((filesystem) => filesystem.path),
    ],
    envelope: { bytes: enrollment.builder.maximumBytes, inodes: enrollment.builder.maximumInodes },
  });
}

/** Reject scratch growth beyond the declared envelope before any registry upload. */
export async function checkExportScratch(
  enrollment: ManagedRegistry,
  before: Awaited<ReturnType<typeof admitExportScratch>>,
): Promise<void> {
  const current = await measureVerifiedFilesystem(
    enrollment.builder.path,
    enrollment.builder.receiptPath,
  );
  if (current.identity !== before.identity)
    throw new Error('Builder scratch changed during export');
  // Proof: native removal admitted a 2 MiB exported file against the declared 1 MiB scratch envelope.
  admitScratch(
    { bytes: current.usedBytes - before.usedBytes, inodes: current.usedInodes - before.usedInodes },
    { bytes: enrollment.builder.maximumBytes, inodes: enrollment.builder.maximumInodes },
  );
}

/** Only the installed root-owned authority command is invoked; caller commands go exclusively on stdin. */
export function connectRegistryAuthority(enrollment: ManagedRegistry): RegistryAuthority {
  return async (request) => {
    const child = Bun.spawn(
      [
        '/usr/bin/ssh',
        '-o',
        'BatchMode=yes',
        '--',
        enrollment.sshHost,
        'sudo -n /usr/local/sbin/puni-registry-authority',
      ],
      { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
    );
    await child.stdin.write(JSON.stringify(request));
    await child.stdin.end();
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (code !== 0) throw new Error(`Registry authority refused request: ${stderr.trim()}`);
    if (stdout.length > 16 * 1024 * 1024)
      throw new Error('Registry authority response exceeds bound');
    return parseRegistryCommandResponse(JSON.parse(stdout));
  };
}
