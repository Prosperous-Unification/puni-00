import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { serializeCanonical } from '../evidence/content-manifest';
import { decodeBootstrapConfiguration } from './bootstrap';
import { createGitHubRestReader, type GitHubFetch } from './github-reader';
import { type ObservationCliDiagnostic, runObservationCli } from './observation-cli';
import type { ObservationStateConfig } from './observation-state';

const Digest = /^[0-9a-f]{64}$/;
const Authority = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
// Linux O_CLOEXEC is absent from Node's cross-platform constants typing.
const CloseOnExec = 0o2000000;
const ServiceConfiguration = type({
  schemaVersion: '1',
  stateDirectory: 'string',
  bootstrapPath: 'string',
  pin: type({
    identity: Digest,
    journalIssuerId: Authority,
    publisherIssuerId: Authority,
  }).onUndeclaredKey('reject'),
  binding: type({
    repositoryId: 'number.integer>=1',
    owner: 'string>=1',
    name: 'string>=1',
    targetRef: 'string>=1',
    policyIdentity: Digest,
    mappingIdentity: Digest,
    toolkitIdentity: Digest,
    readDeadlineMs: 'number.integer>=1',
  }).onUndeclaredKey('reject'),
  policy: type({
    maxAttempts: 'number.integer>=1',
    wholeTickMs: 'number.integer>=1',
    maxSubjects: 'number.integer>=1',
    initialDelayMs: 'number.integer>=1',
    maxDelayMs: 'number.integer>=1',
    fallbackDelayMs: 'number.integer>=1',
    recoveryProbeMs: 'number.integer>=1',
    horizonMs: 'number.integer>=1',
  }).onUndeclaredKey('reject'),
  cleanupMs: 'number.integer>=1',
  credentialPath: 'string|null',
}).onUndeclaredKey('reject');
type ServiceConfiguration = typeof ServiceConfiguration.infer;

const Diagnostic = {
  kind: 'observation-service-failure',
  code: 'service-config-invalid',
  action: 'inspect protected observation service configuration',
} as const;

/** Emits only bounded diagnostic fields, never a provider exception or credential. */
export function reportObservationServiceDiagnostic(
  diagnostic: ObservationCliDiagnostic | typeof Diagnostic,
): void {
  process.stderr.write(`${JSON.stringify(diagnostic)}\n`);
}

function protectedBytes(path: string, maxBytes: number): string {
  // The path is a trusted locator, not a source of ambient discovery.
  if (!isAbsolute(path) || resolve(path) !== path || path.includes('\0'))
    throw new Error('observation service protected path malformed');
  const serviceUid = process.getuid?.();
  if (serviceUid === undefined) throw new Error('observation service owner unavailable');
  const rootUid = lstatSync(sep).uid;
  let ancestor: string = sep;
  for (const component of path.split(sep).filter(Boolean).slice(0, -1)) {
    ancestor = join(ancestor, component);
    const entry = lstatSync(ancestor);
    // Proof: ancestor_owner removed the UID comparison; a foreign-owned parent
    // passed this boundary and reached the tick-failed diagnostic.
    // Proof: ancestor_mode removed the replaceability comparison; a 0777
    // parent passed the protected configuration boundary.
    if (
      !entry.isDirectory() ||
      (entry.uid !== rootUid && entry.uid !== serviceUid) ||
      ((entry.mode & 0o022) !== 0 && (entry.mode & 0o1000) === 0)
    )
      throw new Error('observation service protected ancestor malformed');
  }
  // Proof: nofollow removed O_NOFOLLOW; a symlinked explicit credential reached a GET.
  // Proof: nonblock removed O_NONBLOCK; a credential FIFO held the child past 2 seconds.
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | CloseOnExec,
  );
  try {
    const opened = fstatSync(descriptor);
    // Proof: leaf_owner removed the UID comparison; a foreign-owned config
    // passed this boundary and reached the tick-failed diagnostic.
    // Proof: leaf_nlink removed the link-count comparison; a hard-linked
    // config passed this boundary.
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      (opened.uid !== rootUid && opened.uid !== serviceUid) ||
      // Proof: mode removed this bit check; a 0644 service configuration reached the tick.
      (opened.mode & 0o077) !== 0
    )
      throw new Error('observation service protected file malformed');
    const buffer = Buffer.alloc(maxBytes + 1);
    let count = 0;
    while (count < buffer.length) {
      const next = readSync(descriptor, buffer, count, buffer.length - count, count);
      if (next === 0) break;
      count += next;
    }
    // Proof: size omitted this bound; a canonical 16 KiB+ service config reached the tick.
    if (count > maxBytes) throw new Error('observation service protected file too large');
    return buffer.subarray(0, count).toString('utf8');
  } finally {
    closeSync(descriptor);
  }
}

function serviceConfiguration(path: string): ServiceConfiguration {
  let bytes: string;
  try {
    bytes = protectedBytes(path, 16 * 1024);
  } catch {
    throw new Error('observation service configuration unavailable');
  }
  try {
    const parsed: unknown = JSON.parse(bytes);
    const configuration = parseOrThrow(ServiceConfiguration, parsed);
    // Proof: canonical removed this comparison; noncanonical valid JSON reached the tick.
    if (serializeCanonical(configuration) !== bytes)
      throw new Error('observation service configuration not canonical');
    return configuration;
  } catch {
    throw new Error('observation service configuration malformed');
  }
}

function credential(path: string | null): string | undefined {
  // Proof: ambient replaced this return with GITHUB_TOKEN; an ambient sentinel was sent.
  if (path === null) return undefined;
  let bytes: string;
  try {
    bytes = protectedBytes(path, 4 * 1024);
  } catch {
    throw new Error('observation service credential unavailable');
  }
  // No token is read from process.env, .env, Bun config or a provider response.
  // Proof: token_grammar removed this predicate; a token containing a space
  // reached the provider and the tick returned success.
  if (!/^[A-Za-z0-9_-]+$/.test(bytes)) throw new Error('observation service credential malformed');
  return bytes;
}

export interface ObservationServiceOptions {
  /** Fake HTTP is test-only; production uses fixed-origin global fetch. */
  readonly fetcher?: GitHubFetch;
  readonly reportDiagnostic?: typeof reportObservationServiceDiagnostic;
  readonly clock?: () => number;
}

/** Executes one configured observation tick; it never initializes or migrates state. */
export async function runObservationService(
  configurationPath: string,
  options: ObservationServiceOptions = {},
): Promise<number> {
  const reportDiagnostic = options.reportDiagnostic ?? reportObservationServiceDiagnostic;
  try {
    const configuration = serviceConfiguration(configurationPath);
    // Proof: bootstrap omitted this preflight; a changed pin shifted the named
    // service refusal to the later tick failure. No authority was admitted.
    // Pin the independently selected bootstrap before any GET or state mutation.
    // Proof: bootstrap_fifo removed the bounded protected open; a FIFO held
    // the executable before its tick deadline and the child missed 2 seconds.
    const bootstrapBytes = protectedBytes(configuration.bootstrapPath, 16 * 1024);
    decodeBootstrapConfiguration(bootstrapBytes, configuration.pin);
    const token = credential(configuration.credentialPath);
    const clock = options.clock ?? Date.now;
    const state: ObservationStateConfig = {
      stateDirectory: configuration.stateDirectory,
      bootstrapPath: configuration.bootstrapPath,
      pin: configuration.pin,
      binding: configuration.binding,
      policy: configuration.policy,
      clock,
    };
    const reader = createGitHubRestReader({ token, fetcher: options.fetcher, clock });
    // The observer cannot initialize or migrate: those are separate administrator APIs.
    return await runObservationCli({
      state,
      reader,
      cleanupMs: configuration.cleanupMs,
      reportDiagnostic,
    });
  } catch {
    reportDiagnostic(Diagnostic);
    return 1;
  }
}
