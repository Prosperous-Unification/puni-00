import { lstatSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';
import { readWindowBackupReport } from '@wbs/contracts/window-backup-report';

import { parseDockerInspection } from './docker-inspection-json';

/** Exact argv subprocess boundary; missing tools, transport failure and nonzero exits never admit a window. */
export type RenameWindowDocker = (
  args: readonly string[],
) => Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }>;

/** Actual Bun Docker client adapter; argument arrays never invoke a shell or the application command. */
export const runRenameWindowDocker: RenameWindowDocker = async (args) => {
  const child = Bun.spawn(['docker', ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
};

/** Explicit paths are container paths, except the host release-state directory. No deploy defaults or overrides. */
export interface RenameWindowRequest {
  readonly stateDir: string;
  readonly container: string;
  readonly candidateImage: string;
  readonly sourcePath: string;
  readonly snapshotPath: string;
  readonly reportPath: string;
}

const containerSchema = type({
  Id: /^[a-f0-9]{64}$/,
  State: { Running: 'boolean', Paused: 'boolean', Restarting: 'boolean', Status: 'string' },
  Mounts: type({
    Type: "'bind'|'volume'|'tmpfs'",
    Source: 'string',
    Destination: 'string',
  }).array(),
});
const imageSchema = type({ Id: /^sha256:[0-9a-f]{64}$/ });
type ContainerInspection = typeof containerSchema.infer;
interface ArtifactMount {
  readonly source: string;
  readonly destination: string;
}

function assertReleaseAbsent(stateDir: string): void {
  const directory = lstatSync(stateDir);
  // Proof: window-host-state-directory-readability changes/removes this production field refusal boundary; observed named RED: refuses an unreadable state directory before Docker even with a valid report. The OS still denies unreadable directories. This proof concerns the explicit required-state diagnostic, not a successful privileged directory bypass.
  if (!directory.isDirectory() || (directory.mode & 0o444) === 0 || (directory.mode & 0o111) === 0)
    throw new Error('state directory must be an existing readable searchable directory');
  readdirSync(stateDir);
  for (const tier of ['be', 'gw', 'fe'])
    // Proof: window-host-release-record-presence changes/removes this production behavior boundary; observed named RED: refuses recorded be before Docker even with a real valid report; refuses recorded gw before Docker even with a real valid report; refuses recorded fe before Docker even with a real valid report. Actual production-path negative; no broader host/deployment claim.
    if (lstatSync(join(stateDir, tier + '.json'), { throwIfNoEntry: false }) !== undefined)
      throw new Error('recorded release ' + tier + '.json refuses the rename window');
}

function isWithin(path: string, root: string): boolean {
  // Proof: window-host-segment-boundary changes/removes this production path admission/order boundary; observed named RED: refuses prefix-only database mount before candidate image lookup. Naive string prefix must not select a foreign sibling mount. A later failed verifier is not a substitute for initial mount rejection.
  return root === '/' || path === root || path.startsWith(root + '/');
}

function assertContainerStopped(container: ContainerInspection): void {
  // Proof: window-host-stopped-state-tuple changes/removes this production inspected-state tuple boundary; observed named RED: refuses running without admitting a rename window; refuses restarted without admitting a rename window. One inspected running/paused/restarting/status tuple, at initial and settlement calls. No lasting process exclusion claim.
  if (
    container.State.Running ||
    container.State.Paused ||
    container.State.Restarting ||
    container.State.Status !== 'exited'
  )
    throw new Error('application container must be exactly stopped (exited)');
}

function assertContainerPath(path: string, field: string): void {
  // Proof: window-host-normalized-mount-paths changes/removes this production external path tuple boundary; observed named RED: refuses a comma in inspected mount Source before Docker can split its fields. Real spawned fake-Docker argv parser reproduces delimiter splitting; not live Docker/mount certification. One shared absolute/normalized/no-delimiter guard proof, not independent per-atom credit.
  if (!posix.isAbsolute(path) || posix.normalize(path) !== path || /[,\0\r\n]/.test(path))
    throw new Error(field + ' must be an absolute normalized Docker mount path without delimiters');
}

const protectedRoots = [
  '/app',
  '/usr',
  '/bin',
  '/sbin',
  '/lib',
  '/lib64',
  '/etc',
  '/proc',
  '/sys',
  '/dev',
  '/run',
];

/** Narrows actual deepest mount mappings to artifact directories, preserving sidecars without copying source binds. */
function readArtifactMounts(
  container: ContainerInspection,
  request: RenameWindowRequest,
): ArtifactMount[] {
  const selected: ArtifactMount[] = [];
  for (const [field, path] of [
    ['DB_PATH', request.sourcePath],
    ['snapshotPath', request.snapshotPath],
    ['reportPath', request.reportPath],
  ]) {
    assertContainerPath(path, field);
    const candidates = container.Mounts.filter((mount) => isWithin(path, mount.Destination)).sort(
      // Proof: window-host-deepest-mount changes/removes this production behavior boundary; observed named RED: selects the deepest actual artifact mount and never the broader wrong source. Actual production-path negative; no broader host/deployment claim.
      (left, right) => right.Destination.length - left.Destination.length,
    );
    const mount = candidates.at(0);
    if (mount === undefined) throw new Error(field + ' has no inspected container mount mapping');
    // Proof: window-host-supported-mount changes/removes this production behavior boundary; observed named RED: refuses unsupported database mount before candidate image lookup. Actual production-path negative; no broader host/deployment claim.
    if (mount.Type !== 'bind' && mount.Type !== 'volume')
      throw new Error(field + ' requires a bind or volume mount');
    assertContainerPath(mount.Source, 'mount Source');
    assertContainerPath(mount.Destination, 'mount Destination');
    const destination = posix.dirname(path);
    // Proof: window-host-directory-coverage changes/removes this production behavior boundary; observed named RED: refuses file-only database mount before candidate image lookup. Actual production-path negative; no broader host/deployment claim.
    if (!isWithin(destination, mount.Destination))
      throw new Error(field + ' requires a directory mount covering SQLite sidecars');
    // Proof: window-host-protected-roots changes/removes this production mount admission/order boundary; observed named RED: refuses artifact parent / that overlaps a protected candidate root; refuses artifact parent /app/artifacts that overlaps a protected candidate root; refuses artifact parent /usr/local/artifacts that overlaps a protected candidate root. Fake-Docker argv/control proof only. Later verifier path errors cannot replace early candidate-root shadowing refusal.
    if (protectedRoots.some((root) => isWithin(destination, root) || isWithin(root, destination)))
      throw new Error(field + ' artifact mount would shadow a protected candidate root');
    const source = posix.join(mount.Source, posix.relative(mount.Destination, destination));
    const existing = selected.find((prior) => prior.destination === destination);
    if (existing !== undefined) {
      continue;
    }
    selected.push({ source, destination });
  }
  selected.sort((left, right) => left.destination.localeCompare(right.destination));
  const retained: ArtifactMount[] = [];
  for (const mount of selected) {
    const parent = retained.find((prior) => isWithin(mount.destination, prior.destination));
    if (parent !== undefined) {
      const projected = posix.join(
        parent.source,
        posix.relative(parent.destination, mount.destination),
      );
      // Proof: window-host-overlap-mapping changes/removes this production behavior boundary; observed named RED: refuses conflicting overlapping derived mappings before running a candidate. Actual production-path negative; no broader host/deployment claim.
      if (projected !== mount.source)
        throw new Error('overlapping artifact mapping differs from its parent');
      continue;
    }
    retained.push(mount);
  }
  return retained;
}

async function inspectContainer(
  docker: RenameWindowDocker,
  name: string,
): Promise<ContainerInspection> {
  const answer = await docker(['container', 'inspect', name]);
  // Proof: window-host-inspection-status changes/removes this production behavior boundary; observed named RED: refuses inspect-failed even when backup artifacts remain valid. Actual production-path negative; no broader host/deployment claim.
  if (answer.exitCode !== 0)
    throw new Error('docker container inspection failed: ' + answer.stderr);
  // Proof: window-host-container-schema changes/removes this production behavior boundary; observed named RED: refuses container-id at its exact host admission boundary. Actual production-path negative; no broader host/deployment claim.
  const inspected = parseOrThrow(containerSchema.array(), parseDockerInspection(answer.stdout));
  const container = inspected.at(0);
  // Proof: window-host-container-cardinality changes/removes this production behavior boundary; observed named RED: refuses container-many at its exact host admission boundary. Actual production-path negative; no broader host/deployment claim.
  if (inspected.length !== 1 || container === undefined)
    throw new Error('docker inspection must identify exactly one container');
  assertContainerStopped(container);
  return container;
}

/**
 * Checks one stopped-host window without starting app CMD, applying migrations or changing a release.
 * Candidate identity is pinned and receives only readonly artifact directory mappings. Current state and
 * mappings are rechecked afterwards; this point-in-time receipt never replaces the paused poller/heavy lock.
 * Docker fakes establish argv/control flow only, not a live volume or process-barrier certificate.
 */
export async function assertRenameWindow(request: RenameWindowRequest, docker: RenameWindowDocker) {
  const retained = { ...request };
  // Proof: window-host-container-name changes/removes this production behavior boundary; observed named RED: refuses malformed-container-name at its exact host admission boundary. Actual production-path negative; no broader host/deployment claim.
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(retained.container))
    throw new Error('container name is malformed');
  // Proof: window-host-image-name changes/removes this production behavior boundary; observed named RED: refuses malformed-image-name at its exact host admission boundary. Actual production-path negative; no broader host/deployment claim.
  if (!/^[A-Za-z0-9][A-Za-z0-9_./:@-]*$/.test(retained.candidateImage))
    throw new Error('candidate image is required and malformed');
  // Proof: window-host-initial-release-installation changes/removes this production admission/order boundary; observed named RED: refuses recorded be before Docker even with a real valid report; refuses recorded gw before Docker even with a real valid report; refuses recorded fe before Docker even with a real valid report. The settlement release check remains. The initial check must refuse before Docker/image/verifier work.
  assertReleaseAbsent(retained.stateDir);
  const container = await inspectContainer(docker, retained.container);
  const mounts = readArtifactMounts(container, retained);
  const inspectedImage = await docker(['image', 'inspect', retained.candidateImage]);
  // Proof: window-host-image-inspection-status changes/removes this production behavior boundary; observed named RED: refuses image-failed even when backup artifacts remain valid. Actual production-path negative; no broader host/deployment claim.
  if (inspectedImage.exitCode !== 0)
    throw new Error('docker candidate image inspection failed: ' + inspectedImage.stderr);
  let images: (typeof imageSchema.infer)[];
  try {
    // Proof: window-host-image-schema changes/removes this production behavior boundary; observed named RED: refuses unknown-image without admitting a rename window. Actual production-path negative; no broader host/deployment claim.
    images = parseOrThrow(imageSchema.array(), parseDockerInspection(inspectedImage.stdout));
  } catch (cause) {
    throw new Error('candidate image inspection is malformed', { cause });
  }
  const image = images.at(0);
  // Proof: window-host-image-cardinality changes/removes this production behavior boundary; observed named RED: refuses image-many at its exact host admission boundary. Actual production-path negative; no broader host/deployment claim.
  if (images.length !== 1 || image === undefined)
    throw new Error('candidate image inspection must identify exactly one image');
  const args = [
    'run',
    '--rm',
    // Proof: window-host-readonly-root changes/removes this operational argv contract boundary; observed named RED: verifies a real generated report through exact candidate argv without copying the dev source bind. Actual production-path negative; no broader host/deployment claim.
    '--read-only',
    '--network',
    // Proof: window-host-no-network changes/removes this operational argv contract boundary; observed named RED: verifies a real generated report through exact candidate argv without copying the dev source bind. Checks the already configured network argument, not live packet isolation.
    'none',
    // Proof: window-host-bun-entrypoint changes/removes this operational argv contract boundary; observed named RED: verifies a real generated report through exact candidate argv without copying the dev source bind. No live app-boot claim; this proves the entrypoint override reaches the actual client argv.
    '--entrypoint',
    '/usr/local/bin/bun',
    '--workdir',
    // Proof: window-host-verifier-workdir changes/removes this operational argv contract boundary; observed named RED: verifies a real generated report through exact candidate argv without copying the dev source bind. Fake adapter independently invokes the verifier; the assertion establishes exact candidate argv, not Docker filesystem execution.
    '/app/apps/wbs/be-01',
    '--env',
    'DB_PATH=' + retained.sourcePath,
  ];
  for (const mount of mounts)
    args.push(
      '--mount',
      // Proof: window-host-readonly-artifacts changes/removes this operational argv contract boundary; observed named RED: verifies a real generated report through exact candidate argv without copying the dev source bind. Real denied-directory WAL/immutable capability test is separate; argv fakes alone do not prove live mount permissions.
      'type=bind,src=' + mount.source + ',dst=' + mount.destination + ',readonly',
    );
  // Proof: window-host-verifier-script changes/removes this operational argv contract boundary; observed named RED: verifies a real generated report through exact candidate argv without copying the dev source bind. Proves no app script is selected by this command builder; not a live Docker boot experiment.
  // Proof: window-host-image-id-pinning changes/removes this operational argv contract boundary; observed named RED: verifies a real generated report through exact candidate argv without copying the dev source bind. Actual spawned fake-Docker argv is checked; no live tag/image certificate.
  args.push(image.Id, 'src/assert-window-cli.ts', '--report=' + retained.reportPath);
  const verified = await docker(args);
  // Proof: window-host-verifier-status changes/removes this production behavior boundary; observed named RED: refuses verifier-failed without admitting a rename window. Actual production-path negative; no broader host/deployment claim.
  if (verified.exitCode !== 0) throw new Error('candidate verifier refused: ' + verified.stderr);
  // Proof: window-host-complete-decoder-installation changes/removes this production complete wire boundary boundary; observed named RED: refuses a zero-exit truncated verifier receipt despite matching source and snapshot paths. Actual candidate stdout decoder installation enforces the required eight-field tuple. Individual field validators have separately reached host/CLI negatives.
  const receipt = readWindowBackupReport(parseDockerInspection(verified.stdout));
  // Proof: window-host-receipt-source-binding changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with wrong-source. Actual production-path negative; no broader host/deployment claim.
  if (receipt.sourcePath !== retained.sourcePath)
    throw new Error('verified sourcePath differs from explicit DB_PATH');
  // Proof: window-host-receipt-snapshot-binding changes/removes this production behavior boundary; observed named RED: refuses wrong-receipt without admitting a rename window. Actual production-path negative; no broader host/deployment claim.
  if (receipt.snapshotPath !== retained.snapshotPath)
    throw new Error('verified snapshotPath differs from explicit snapshot-path');
  // Proof: window-host-current-original-name changes/removes this production behavior boundary; observed named RED: refuses original container name rebound to a new running object while old ID remains exited; refuses original container name rebound to a new exited object while old ID remains exited. Actual production-path negative; no broader host/deployment claim.
  const current = await inspectContainer(docker, retained.container);
  // Proof: window-host-container-id-fence changes/removes this production behavior boundary; observed named RED: refuses original container name rebound to a new exited object while old ID remains exited. Actual production-path negative; no broader host/deployment claim.
  if (current.Id !== container.Id) throw new Error('application container identity changed');
  const currentMounts = readArtifactMounts(current, retained);
  // Proof: window-host-current-mount-fence changes/removes this production behavior boundary; observed named RED: refuses mapping-changed without admitting a rename window. Actual production-path negative; no broader host/deployment claim.
  if (JSON.stringify(currentMounts) !== JSON.stringify(mounts))
    throw new Error('artifact mapping changed during verification');
  // Proof: window-host-final-release-installation changes/removes this production behavior boundary; observed named RED: refuses write-release even when backup artifacts remain valid. Actual production-path negative; no broader host/deployment claim.
  assertReleaseAbsent(retained.stateDir);
  return {
    containerId: container.Id,
    candidateImageId: image.Id,
    sourcePath: retained.sourcePath,
    snapshotPath: retained.snapshotPath,
    reportPath: retained.reportPath,
  };
}

/** Strict Bun argv boundary; omission/unknown/duplicate values refuse before Docker or artifact work. */
export function parseRenameWindowArguments(args: readonly string[]): RenameWindowRequest {
  const stateDir = args.at(0);
  const options = args.slice(1);
  // Proof: window-host-required-state-argv changes/removes this production argv field/order boundary; observed named RED: refuses missing host state argument before interpreting other options. Later missing-option/OS refusals remain; explicit state-argument refusal must precede them.
  if (stateDir === undefined || stateDir === '' || stateDir.startsWith('-'))
    throw new Error('state directory argument is required');
  const supplied = new Map<string, string>();
  const allowed = ['container', 'candidate-image', 'db-path', 'backup-report', 'snapshot-path'];
  for (const argument of options) {
    const equals = argument.indexOf('=');
    const key = argument.slice(2, equals);
    const value = argument.slice(equals + 1);
    // Proof: window-host-closed-option-tuple changes/removes this production argv tuple boundary; observed named RED: refuses the historical skeleton override rather than importing its exception. Accepting an unknown override option is itself forbidden; this is not a claim that the ignored option would bypass release-state checks.
    if (
      !argument.startsWith('--') ||
      equals < 3 ||
      !allowed.includes(key) ||
      value === '' ||
      supplied.has(key)
    )
      throw new Error('unknown, empty or duplicate rename-window argument');
    supplied.set(key, value);
  }
  const requireArgument = (name: string): string => {
    const value = supplied.get(name);
    // Proof: window-host-required-option-values changes/removes this production argv presence tuple boundary; observed named RED: refuses missing container before invoking Docker; refuses missing candidate-image before invoking Docker; refuses missing db-path before invoking Docker; refuses missing backup-report before invoking Docker; refuses missing snapshot argument before Docker. All five concrete named values required; no environment, old-image, account or path default. Later malformed/OS failures cannot stand in for this boundary.
    if (value === undefined) throw new Error('--' + name + ' is required');
    return value;
  };
  return {
    stateDir,
    container: requireArgument('container'),
    candidateImage: requireArgument('candidate-image'),
    sourcePath: requireArgument('db-path'),
    reportPath: requireArgument('backup-report'),
    snapshotPath: requireArgument('snapshot-path'),
  };
}
