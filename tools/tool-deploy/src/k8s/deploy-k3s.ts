import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { prepareDesiredRevision } from './deploy-repo';
import { releaseIdentityOf } from './descriptor';
import {
  type DeployRepository,
  executeRelease,
  kubectlEffects,
  type KubectlSettings,
  renderOverlay,
  run,
} from './execute';
import { fileJournal } from './journal';
import {
  assertProtectedStateDirectory,
  checkDescriptor,
  type CheckedDescriptor,
  readDeliveryTarget,
  requestFor,
  stagingProofFor,
  stagingProofPath,
} from './promotion';
import {
  assertRequest,
  initialState,
  planRelease,
  releaseIdOf,
  type ReleaseRequest,
  settleInterrupted,
} from './release';

const USAGE =
  'usage: deploy-k3s --request <request.json> --journal <path> [--kubectl <path>] [--kubeconfig <path>] [--apply]\n' +
  '       deploy-k3s --descriptor <descriptor.json> --descriptor-sha256 <hex> --admission <admission.json>\n' +
  '                  --environment staging|prod --context <ctx> --cluster-uid <uid> --state <dir>\n' +
  '                  --deploy-repo <clone> [--deploy-remote origin] [--deploy-branch main]\n' +
  '                  [--kubectl <path>] [--kubeconfig <path>] [--apply]\n' +
  '  Plans by default. --apply runs or resumes the transaction recorded in the journal.';

function flag(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  if (index + 1 >= args.length) throw new Error(`${name} needs a value\n${USAGE}`);
  const value = args[index + 1];
  if (value.startsWith('--')) throw new Error(`${name} needs a value\n${USAGE}`);
  return value;
}

function required(args: readonly string[], name: string): string {
  const value = flag(args, name);
  if (value === null) throw new Error(`${name} is required\n${USAGE}`);
  return value;
}

/** The locked kubectl version; any other client refuses to run the transaction. */
export function lockedKubectlVersion(root: string): string {
  const lock = JSON.parse(readFileSync(resolve(root, 'infra/versions/toolchain.json'), 'utf8')) as {
    binaries?: { kubectl?: { version?: string } };
  };
  const version = lock.binaries?.kubectl?.version;
  if (version === undefined)
    throw new Error('infra/versions/toolchain.json has no kubectl version');
  return version;
}

async function assertKubectl(kubectl: string, expected: string): Promise<void> {
  const probe = await run([kubectl, 'version', '--client', '-o', 'json'], null, 30_000);
  if (probe.exitCode !== 0) throw new Error(`${kubectl} is not runnable: ${probe.stderr.trim()}`);
  const actual = (JSON.parse(probe.stdout) as { clientVersion?: { gitVersion?: string } })
    .clientVersion?.gitVersion;
  if (actual !== expected)
    throw new Error(`${kubectl} is ${String(actual)}; the toolchain lock requires ${expected}`);
}

/** Bounds per environment: the lab fails fast, production allows real image pulls and drains. */
export function boundsFor(
  environment: ReleaseRequest['environment'],
): Pick<
  KubectlSettings,
  | 'rolloutTimeoutSeconds'
  | 'jobTimeoutSeconds'
  | 'drainTimeoutMs'
  | 'anonymousProjectsStatus'
  | 'leaseDurationSeconds'
> {
  if (environment === 'local') {
    return {
      rolloutTimeoutSeconds: 120,
      jobTimeoutSeconds: 300,
      drainTimeoutMs: 10_000,
      anonymousProjectsStatus: 200,
      leaseDurationSeconds: 20,
    };
  }
  return {
    rolloutTimeoutSeconds: 600,
    jobTimeoutSeconds: 1800,
    drainTimeoutMs: 300_000,
    anonymousProjectsStatus: 401,
    leaseDurationSeconds: 120,
  };
}

function writeOwnerOnly(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(`${path}.partial`, text, { mode: 0o600 });
  renameSync(`${path}.partial`, path);
}

interface Prepared {
  request: ReleaseRequest;
  journalPath: string;
  deployRepository: DeployRepository | null;
  /** Set for descriptor runs: what a successful staging promotion records as proven. */
  staging: { checked: CheckedDescriptor; stateDirectory: string } | null;
}

function environmentOf(value: string): 'staging' | 'prod' {
  if (value !== 'staging' && value !== 'prod') {
    throw new Error(`--environment must be staging or prod, got ${value}\n${USAGE}`);
  }
  return value;
}

/**
 * Descriptor mode: checks the descriptor, admission and (for prod) staging proof, then reads the
 * live cluster read-only and prepares, without pushing, the deploy-repository commit. The
 * generated request is kept beside the journal; a resumed run must rebuild it identically.
 */
async function prepareFromDescriptor(
  args: readonly string[],
  root: string,
  kubectl: string,
): Promise<Prepared> {
  const environment = environmentOf(required(args, '--environment'));
  const stateDirectory = resolve(required(args, '--state'));
  assertProtectedStateDirectory(stateDirectory, process.getuid?.() ?? -1);
  const checked = checkDescriptor({
    descriptorPath: required(args, '--descriptor'),
    expectedSha256: required(args, '--descriptor-sha256'),
    admissionPath: required(args, '--admission'),
    environment,
    stateDirectory,
  });
  const overlays = resolve(root, 'deploy/k8s/wbs/overlays');
  const target = readDeliveryTarget(overlays, environment);
  const context = required(args, '--context');
  const expectedUid = required(args, '--cluster-uid');
  const reader = kubectlEffects({
    kubectl,
    kubeconfig: flag(args, '--kubeconfig'),
    context,
    namespaces: target.namespaces,
    stateDir: stateDirectory,
    overlay: join(overlays, environment),
    log: (line) => {
      console.log(line);
    },
    ...boundsFor(environment),
  });
  const uid = await reader.clusterUid();
  if (uid !== expectedUid) {
    throw new Error(`context ${context} reaches cluster ${uid}, not ${expectedUid}`);
  }
  const deployRepository: DeployRepository = {
    path: resolve(required(args, '--deploy-repo')),
    remote: flag(args, '--deploy-remote') ?? 'origin',
    branch: flag(args, '--deploy-branch') ?? 'main',
  };
  const release = releaseIdentityOf(checked.descriptor);
  const releaseId = releaseIdOf(release);
  const environmentState = join(stateDirectory, environment);
  const journalPath = join(environmentState, 'journal', 'release.json');
  const requestPath = join(environmentState, 'requests', `${releaseId}.json`);
  const journal = fileJournal(journalPath).read();
  let request: ReleaseRequest;
  if (journal !== null && journal.state.releaseId === releaseId) {
    // A journal for this release exists: resume exactly the request it bound. The cluster is
    // mid-transaction, so its release record no longer describes expectedCurrent.
    request = journal.request;
    const expected = requestFor(checked, target, { context, uid }, request.expectedCurrent, {
      previousRevision: request.flux?.previousRevision ?? '',
      desiredRevision: request.flux?.desiredRevision ?? '',
    });
    // Proof: deploy-k3s.test.ts `refuses to resume a journal recorded against another cluster
    // context`; with this comparison removed the run resumed the other context's transaction.
    if (JSON.stringify(expected) !== JSON.stringify(request)) {
      throw new Error(
        `the journal at ${journalPath} records release ${releaseId} under another request; ` +
          "this run's descriptor, admission or cluster differ, so it cannot resume",
      );
    }
    console.log(`resuming the request recorded in ${journalPath}`);
  } else {
    const current = await reader.currentRelease();
    if (current === null) {
      throw new Error(`${context} records no WBS release; the first install is the cutover plan`);
    }
    const rendered = await renderOverlay(
      { kubectl, overlay: join(overlays, environment) },
      release,
    );
    const revisions = prepareDesiredRevision(
      deployRepository,
      target.deployManifestPath,
      rendered,
      releaseId,
    );
    request = requestFor(checked, target, { context, uid }, current, revisions);
    writeOwnerOnly(requestPath, `${JSON.stringify(request, null, 2)}\n`);
  }
  writeOwnerOnly(
    join(stateDirectory, 'descriptors', `${checked.sha256}.json`),
    readFileSync(required(args, '--descriptor'), 'utf8'),
  );
  return {
    request,
    journalPath,
    deployRepository,
    staging: environment === 'staging' ? { checked, stateDirectory } : null,
  };
}

export async function main(args: readonly string[], root: string): Promise<void> {
  const kubectl = flag(args, '--kubectl') ?? 'kubectl';
  let prepared: Prepared;
  if (flag(args, '--descriptor') !== null) {
    await assertKubectl(kubectl, lockedKubectlVersion(root));
    prepared = await prepareFromDescriptor(args, root, kubectl);
  } else {
    // Boundary: the request file is the release descriptor's projection; assertRequest checks it.
    const request = JSON.parse(readFileSync(required(args, '--request'), 'utf8')) as ReleaseRequest;
    prepared = {
      request,
      journalPath: resolve(required(args, '--journal')),
      deployRepository: null,
      staging: null,
    };
  }
  const { request, journalPath } = prepared;
  assertRequest(request);
  const journal = fileJournal(journalPath);
  const existing = journal.read();
  const state =
    existing?.state.releaseId !== releaseIdOf(request.release)
      ? initialState(request)
      : settleInterrupted(existing.state);
  console.log(`release ${state.releaseId} at ${state.phase} (journal ${journalPath})`);
  for (const step of planRelease(request, state)) console.log(`  ${step.kind} -> ${step.reaches}`);
  if (!args.includes('--apply')) {
    console.log('plan only; pass --apply to run it');
    return;
  }
  await assertKubectl(kubectl, lockedKubectlVersion(root));
  const stateDir = dirname(journalPath);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const bounds = boundsFor(request.environment);
  const effects = kubectlEffects({
    kubectl,
    kubeconfig: flag(args, '--kubeconfig'),
    context: request.cluster.context,
    namespaces: request.namespaces,
    stateDir,
    overlay: resolve(root, 'deploy/k8s/wbs/overlays', request.environment),
    deployRepository: prepared.deployRepository,
    log: (line) => {
      console.log(line);
    },
    ...bounds,
  });
  const final = await executeRelease(
    request,
    journal,
    effects,
    (line) => {
      console.log(line);
    },
    { heartbeatMs: bounds.leaseDurationSeconds * 250 },
  );
  if (prepared.staging !== null && final.phase === 'lease-released') {
    const { checked, stateDirectory } = prepared.staging;
    const proof = stagingProofPath(stateDirectory, checked.sha256);
    writeOwnerOnly(proof, stagingProofFor(checked, request.cluster, new Date()));
    console.log(`staging proof ${proof}`);
  }
  console.log(`release ${final.releaseId} promoted`);
}

if (import.meta.main) {
  await main(process.argv.slice(2), resolve(import.meta.dir, '../../../..'));
}
