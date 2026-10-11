import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { kill as killProcess } from 'node:process';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import type { ReviewProviderAuthority } from './review-provider';

const Sha256 = /^[0-9a-f]{64}$/;
const ProtectedPath = /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
const MaximumBundleBytes = 1_048_576;
const MaximumManifestBytes = 65_536;
const MaximumOutputBytes = 262_144;
const ProcessDeadlineMs = 30_000;
const GitHubRepository = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const CommitSha = /^[0-9a-f]{40}$/;
const QualifiedRef = /^refs\/(?:heads|tags)\/[A-Za-z0-9._/-]+$/;
const Https = /^https:\/\/[^\s"'`$\\]+$/;

export interface OfflineVerifierPolicy {
  readonly executablePath: string;
  readonly executableIdentity: string;
  readonly version: string;
  readonly runtimeIdentity: string;
  readonly trustedRootPath: string;
  readonly trustedRootIdentity: string;
  readonly repository: string;
  readonly certIdentity: string;
  readonly signerDigest: string;
  readonly sourceDigest: string;
  readonly sourceRef: string;
  readonly issuer: string;
  readonly predicateType: string;
}

export interface OfflineVerifierRuntime {
  readonly executableIdentity: string;
  readonly version: string;
  readonly runtimeIdentity: string;
  readonly trustedRootIdentity: string;
}

export interface OfflineVerifierProcess {
  readonly executablePath: string;
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly manifestBytes: string;
  readonly bundleBytes: string;
  readonly maximumOutputBytes: number;
  readonly maximumDurationMs: number;
}

export interface OfflineVerifierExit {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function readBoundedOutput(
  stream: ReadableStream<Uint8Array>,
  child: ReturnType<typeof Bun.spawn>,
  maximumBytes: number,
  signal: AbortSignal,
  cleanupFailures: unknown[],
): Promise<string> {
  const reader = stream.getReader();
  let cancellation: Promise<void> | undefined;
  const cancel = () => {
    // Proof: reader_cancel_error omission lost the injected stream cleanup
    // failure, leaving only the timeout instead of both causes.
    cancellation = reader.cancel().catch((cause: unknown) => {
      cleanupFailures.push(cause);
    });
  };
  // Proof: reader_cancel omission let an escaped harmless child hold the
  // output pipe for ~1 s after a 30 ms process deadline.
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      // Proof: stream_bytes omitted this cap; the harmless child returned oversized output.
      if (size > maximumBytes) {
        child.kill(9);
        throw new Error('review verifier process output too large');
      }
      chunks.push(next.value);
    }
    // Proof: utf8_fatal omission accepted invalid stdout and stderr bytes.
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } finally {
    // Proof: reader_settle omission returned before both injected asynchronous
    // cancellations completed after timeout.
    if (cancellation !== undefined) await cancellation;
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/** Runs an absolute executable with private inputs and an empty environment after the caller independently validates its runtime and trust pins. */
export async function runPinnedOfflineGh(
  process: OfflineVerifierProcess,
  signal?: AbortSignal,
): Promise<OfflineVerifierExit> {
  // Proof: preaborted omission staged private files before the second cancel fence.
  if (signal?.aborted) throw new Error('review verifier process cancelled');
  // Proof: runner_path omission executed the noncanonical /bin/../bin/true fixture.
  assertProtectedPath(process.executablePath);
  // Proof: duration_lower/upper, output_lower/upper and duration_safe/output_safe
  // each admitted an invalid bound and launched /bin/true on its one omission.
  if (
    !Number.isSafeInteger(process.maximumDurationMs) ||
    process.maximumDurationMs < 1 ||
    process.maximumDurationMs > ProcessDeadlineMs ||
    !Number.isSafeInteger(process.maximumOutputBytes) ||
    process.maximumOutputBytes < 1 ||
    process.maximumOutputBytes > MaximumOutputBytes
  )
    throw new Error('review verifier process bounds malformed');
  // Proof: stage_deadline omission spawned /bin/true after a synchronous
  // staging write had already consumed the whole process budget.
  const startedAt = performance.now();
  const directory = mkdtempSync('/tmp/review-attestation-');
  const manifestPath = join(directory, 'manifest.json');
  const bundlePath = join(directory, 'bundle.json');
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let exit: OfflineVerifierExit | undefined;
  let failure: unknown;
  let primaryCause: unknown;
  let failed = false;
  let stdoutRead: Promise<string> | undefined;
  let stderrRead: Promise<string> | undefined;
  const cleanupFailures: unknown[] = [];
  const processState = { timedOut: false, cancelled: false };
  const readers = new AbortController();
  let treeKilled = false;
  const killTree = () => {
    if (treeKilled || child === undefined) return;
    treeKilled = true;
    try {
      // Proof: descendant_group omission left the recorded sleep process alive
      // although pipe cancellation made the runner return promptly.
      killProcess(-child.pid, 9);
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH'))
        cleanupFailures.push(cause);
    }
    child.kill(9);
    // Proof: reader_cancel omission left an escaped child holding the pipe
    // until its one-second sleep ended, despite the group kill.
    readers.abort();
  };
  const cancel = () => {
    processState.cancelled = true;
    killTree();
  };
  try {
    // Proof: manifest_mode and bundle_mode separately made the child observe 0644
    // instead of the required private 0600 staged files.
    writeFileSync(manifestPath, process.manifestBytes, { flag: 'wx', mode: 0o600 });
    writeFileSync(bundlePath, process.bundleBytes, { flag: 'wx', mode: 0o600 });
    if (signal?.aborted) throw new Error('review verifier process cancelled');
    // Proof: stage_deadline omission launched after the 30 ms deadline.
    if (performance.now() - startedAt >= process.maximumDurationMs)
      throw new Error('review verifier process timed out');
    const argv = process.argv.map((argument) =>
      argument === '@manifest' ? manifestPath : argument === '@bundle' ? bundlePath : argument,
    );
    // Proof: empty_env admitted the harmless GH_TOKEN sentinel to the child;
    // restored execution kept it absent. Runtime pin checks precede this launch.
    child = Bun.spawn([process.executablePath, ...argv], {
      cwd: directory,
      env: {},
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      // Proof: detached_group omission left the descendant outside the
      // signalable owned process group; its liveness assertion failed.
      detached: true,
    });
    if (!(child.stdout instanceof ReadableStream) || !(child.stderr instanceof ReadableStream))
      throw new Error('review verifier process output unavailable');
    // Proof: abort_listener omission changed active cancellation into a later timeout.
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(
      () => {
        processState.timedOut = true;
        // Proof: timer_kill omission let the finite child run for ~503 ms rather
        // than settling after the 30 ms deadline.
        killTree();
      },
      Math.max(0, process.maximumDurationMs - (performance.now() - startedAt)),
    );
    stdoutRead = readBoundedOutput(
      child.stdout,
      child,
      process.maximumOutputBytes,
      readers.signal,
      cleanupFailures,
    );
    // Proof: stderr_cap omission accepted 200 stderr bytes under a 100-byte cap.
    stderrRead = readBoundedOutput(
      child.stderr,
      child,
      process.maximumOutputBytes,
      readers.signal,
      cleanupFailures,
    );
    const [stdout, stderr, exitCode] = await Promise.all([stdoutRead, stderrRead, child.exited]);
    if (processState.cancelled || signal?.aborted)
      throw new Error('review verifier process cancelled');
    // Proof: monotonic_clock omission accepted the injected late completion
    // when the event-loop timer had not fired yet.
    if (processState.timedOut || performance.now() - startedAt >= process.maximumDurationMs)
      throw new Error('review verifier process timed out');
    exit = { exitCode, stdout, stderr };
  } catch (cause) {
    killTree();
    primaryCause = cause;
    failed = true;
    failure =
      processState.cancelled || signal?.aborted
        ? new Error('review verifier process cancelled', { cause })
        : processState.timedOut || performance.now() - startedAt >= process.maximumDurationMs
          ? new Error('review verifier process timed out', { cause })
          : cause instanceof Error && cause.message.startsWith('review verifier process ')
            ? cause
            : new Error('review verifier process unavailable', { cause });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    if (child !== undefined) {
      try {
        await child.exited;
      } catch (cause) {
        cleanupFailures.push(cause);
      }
    }
    // Proof: sibling_settle omission returned after stdout overflow while a
    // delayed stderr cancellation was still pending and lost its failure.
    const settledReaders = await Promise.allSettled(
      [stdoutRead, stderrRead].filter((read): read is Promise<string> => read !== undefined),
    );
    for (const settled of settledReaders) {
      if (settled.status === 'rejected' && settled.reason !== primaryCause)
        cleanupFailures.push(settled.reason);
    }
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch (cause) {
      cleanupFailures.push(cause);
    }
  }
  // Proof: cleanup_cancel and cleanup_deadline omissions returned success
  // after cancellation or a synchronous removal exceeded the budget.
  const settlementFailure =
    signal?.aborted && !processState.cancelled
      ? new Error('review verifier process cancelled')
      : performance.now() - startedAt >= process.maximumDurationMs && !processState.timedOut
        ? new Error('review verifier process timed out')
        : undefined;
  if (
    settlementFailure !== undefined &&
    failed &&
    !(failure instanceof Error && failure.message === settlementFailure.message)
  )
    cleanupFailures.push(settlementFailure);
  else if (settlementFailure !== undefined) {
    failed = true;
    failure = settlementFailure;
  }
  // Proof: cleanup_aggregate omission lost the cleanup sentinel after a
  // primary launch failure; restored rejection retains both causes.
  if (cleanupFailures.length > 0)
    throw new AggregateError(
      failed ? [failure, ...cleanupFailures] : cleanupFailures,
      'review verifier process cleanup failed',
    );
  if (failed) throw failure;
  if (exit === undefined) throw new Error('review verifier process unavailable');
  return exit;
}

export interface OfflineVerifierInvocation {
  readonly policy: OfflineVerifierPolicy;
  readonly bundleBytes: string;
  readonly manifestBytes: string;
  readonly resolveRuntime: () => Promise<OfflineVerifierRuntime | undefined>;
  readonly run: (process: OfflineVerifierProcess) => Promise<OfflineVerifierExit>;
}

export interface OfflineVerifierObservation {
  readonly manifestDigest: string;
  readonly bundleDigest: string;
  /** Fake process results cannot establish a cryptographic fact. */
  readonly untrustedCliOutput: unknown;
}

/** Derives CLI switches from the protected descriptor; no submission field selects policy. */
export function offlineVerifierPolicy(authority: ReviewProviderAuthority): OfflineVerifierPolicy {
  const { control, attestation } = authority.descriptor;
  // Proof: thirteen isolated map_* repins each changed one protected
  // authority field and failed the mapped-policy plus process-vector test.
  return {
    executablePath: attestation.verifierExecutablePath,
    executableIdentity: attestation.verifierIdentity,
    version: attestation.verifierVersion,
    runtimeIdentity: attestation.verifierRuntimeIdentity,
    trustedRootPath: attestation.trustedRootPath,
    trustedRootIdentity: attestation.trustedRootIdentity,
    repository: `${control.owner}/${control.repository}`,
    certIdentity: attestation.signerIdentity,
    signerDigest: control.signerDigest,
    sourceDigest: control.sourceCommitSha,
    sourceRef: control.dispatchRef,
    issuer: attestation.issuer,
    predicateType: attestation.predicateType,
  };
}

function assertProtectedPath(path: string): void {
  if (!ProtectedPath.test(path) || !isAbsolute(path) || resolve(path) !== path) {
    throw new Error('review verifier protected path malformed');
  }
}

function assertRuntime(
  runtime: OfflineVerifierRuntime | undefined,
  policy: OfflineVerifierPolicy,
): void {
  // Proof: runtime_barrier omission launched with no resolver result; each of
  // executable_pin, version_pin, closure_pin and root_pin separately launched
  // after its one independently resolved identity comparison was removed.
  if (runtime === undefined) throw new Error('review verifier runtime absent');
  if (
    runtime.executableIdentity !== policy.executableIdentity ||
    runtime.version !== policy.version ||
    runtime.runtimeIdentity !== policy.runtimeIdentity ||
    runtime.trustedRootIdentity !== policy.trustedRootIdentity
  ) {
    throw new Error('review verifier runtime differs from pin');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Checks one local bundle against an independently resolved pinned gh 2.98.0 runtime. */
export async function verifyOfflineReviewBundle(
  invocation: OfflineVerifierInvocation,
): Promise<OfflineVerifierObservation> {
  const { policy } = invocation;
  // Proof: executable_path and root_path separately admitted noncanonical
  // protected locators when their pre-launch check was omitted.
  assertProtectedPath(policy.executablePath);
  assertProtectedPath(policy.trustedRootPath);
  // Proof: policy_version admitted a coherent 2.99.0 repin; hash_executable,
  // hash_runtime and hash_root each launched with one malformed but coherently
  // resolver-matched pin when its single format predicate was omitted.
  if (
    !Sha256.test(policy.executableIdentity) ||
    !Sha256.test(policy.runtimeIdentity) ||
    !Sha256.test(policy.trustedRootIdentity) ||
    policy.version !== '2.98.0'
  ) {
    throw new Error('review verifier policy malformed');
  }
  // Proof: policy_repository/cert/signer/source/ref/issuer/predicate each
  // launched the fake process with one malformed policy switch when omitted.
  if (
    !GitHubRepository.test(policy.repository) ||
    !Https.test(policy.certIdentity) ||
    !CommitSha.test(policy.signerDigest) ||
    !CommitSha.test(policy.sourceDigest) ||
    !QualifiedRef.test(policy.sourceRef) ||
    !Https.test(policy.issuer) ||
    !Https.test(policy.predicateType)
  ) {
    throw new Error('review verifier policy malformed');
  }
  // Proof: bundle_input_cap and manifest_input_cap each launched the fake
  // process with its oversized exact input when independently omitted.
  if (
    Buffer.byteLength(invocation.bundleBytes, 'utf8') > MaximumBundleBytes ||
    Buffer.byteLength(invocation.manifestBytes, 'utf8') > MaximumManifestBytes
  ) {
    throw new Error('review verifier input too large');
  }
  let bundle: unknown;
  try {
    // Proof: bundle_parse omission launched on unparseable local input.
    bundle = JSON.parse(invocation.bundleBytes);
  } catch (cause) {
    throw new Error('review verifier bundle malformed', { cause });
  }
  // Proof: bundle_shape omission launched with an array rather than one bundle.
  if (!isRecord(bundle)) {
    throw new Error('review verifier bundle malformed');
  }
  const runtime = await invocation.resolveRuntime();
  // Proof: the runtime-policy fault must make the absent-runtime fixture launch.
  assertRuntime(runtime, policy);
  const process = await invocation.run({
    executablePath: policy.executablePath,
    // Proof: argv_manifest/bundle/repo/host/cert/signer/source/ref/issuer/
    // predicate/root/format and deny_self_hosted/no_public_good each broke
    // the mounted exact-v2.98.0 policy-vector assertion on one omission.
    argv: [
      'attestation',
      'verify',
      '@manifest',
      '--bundle',
      '@bundle',
      '--repo',
      policy.repository,
      '--hostname',
      'github.com',
      '--cert-identity',
      policy.certIdentity,
      '--signer-digest',
      policy.signerDigest,
      '--source-digest',
      policy.sourceDigest,
      '--source-ref',
      policy.sourceRef,
      '--cert-oidc-issuer',
      policy.issuer,
      '--predicate-type',
      policy.predicateType,
      '--custom-trusted-root',
      policy.trustedRootPath,
      '--deny-self-hosted-runners',
      '--no-public-good',
      '--format',
      'json',
    ],
    env: {},
    manifestBytes: invocation.manifestBytes,
    bundleBytes: invocation.bundleBytes,
    maximumOutputBytes: MaximumOutputBytes,
    maximumDurationMs: ProcessDeadlineMs,
  });
  // Proof: exit_status omission accepted an exit-one fake with otherwise valid JSON.
  if (process.exitCode !== 0) throw new Error('review verifier process refused');
  // Proof: result_bytes omission accepted a valid JSON record over the cap.
  if (Buffer.byteLength(process.stdout, 'utf8') > MaximumOutputBytes)
    throw new Error('review verifier output too large');
  let output: unknown;
  try {
    output = JSON.parse(process.stdout);
  } catch (cause) {
    throw new Error('review verifier output malformed', { cause });
  }
  // Proof: result_count omission accepted two otherwise valid records.
  if (!Array.isArray(output) || output.length !== 1) {
    throw new Error('review verifier output malformed');
  }
  const selected: unknown = output[0];
  if (
    !isRecord(selected) ||
    !isRecord(selected['attestation']) ||
    !isRecord(selected['verificationResult'])
  )
    throw new Error('review verifier output malformed');
  const verification = selected['verificationResult'];
  const signature = verification['signature'];
  const statement = verification['statement'];
  if (
    !isRecord(signature) ||
    !isRecord(signature['certificate']) ||
    !Array.isArray(verification['verifiedTimestamps']) ||
    // Proof: timestamp_count and timestamp_fields separately admitted empty
    // and structurally incomplete timestamp evidence when omitted.
    verification['verifiedTimestamps'].length === 0 ||
    !verification['verifiedTimestamps'].every(
      (timestamp: unknown) =>
        isRecord(timestamp) &&
        typeof timestamp['type'] === 'string' &&
        typeof timestamp['timestamp'] === 'string',
    ) ||
    !isRecord(statement) ||
    !Array.isArray(statement['subject']) ||
    // Proof: subject_count omission admitted two digests in one statement.
    statement['subject'].length !== 1 ||
    !isRecord(statement['subject'][0]) ||
    !isRecord(statement['subject'][0]['digest']) ||
    // Proof: predicate_shape omission admitted a missing predicate object.
    !isRecord(statement['predicate'])
  ) {
    throw new Error('review verifier output malformed');
  }
  const certificate = signature['certificate'];
  // Proof: cert_identity, issuer and predicate_type omissions independently
  // admitted their foreign exit-zero structured result.
  if (
    certificate['subjectAlternativeName'] !== policy.certIdentity ||
    certificate['issuer'] !== policy.issuer ||
    statement['predicateType'] !== policy.predicateType
  ) {
    throw new Error('review verifier output differs from policy');
  }
  // Proof: subject_digest omission admitted the foreign-manifest exit-zero result.
  const manifestDigest = hashBytes(Buffer.from(invocation.manifestBytes));
  if (statement['subject'][0]['digest']['sha256'] !== manifestDigest)
    throw new Error('review verifier subject differs from manifest');
  if (!isRecord(selected['attestation']['bundle']))
    throw new Error('review verifier output malformed');
  // Proof: bundle_join omission admitted a different bundle than the local input.
  if (serializeCanonical(selected['attestation']['bundle']) !== serializeCanonical(bundle))
    throw new Error('review verifier bundle differs from input');
  return {
    manifestDigest,
    bundleDigest: hashBytes(Buffer.from(invocation.bundleBytes)),
    untrustedCliOutput: selected,
  };
}
