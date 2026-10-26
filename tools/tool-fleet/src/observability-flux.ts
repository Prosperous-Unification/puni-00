import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';

import { requireDirectory } from './creation-journal';
import {
  type ObservabilityRehearsalReceipt,
  validateObservabilityRehearsal,
} from './observability-parity-rehearsal';

/** Public errors contain a fixed category only; raw process output and private paths never escape. */
export class FluxRefusal extends Error {}
export function refuseFlux(category: string): never {
  throw new FluxRefusal(category);
}
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const graphRoot = './infra/clusters/platform/local';
const Source = type({
  repositoryURL: /^ssh:\/\/[a-z_][a-z0-9_-]*@[A-Za-z0-9][A-Za-z0-9.-]*\/[A-Za-z0-9._/-]+$/,
  artifactCommit: /^[a-f0-9]{40}$/,
  artifactRoot: "'.'",
  graphRoot: "'./infra/clusters/platform/local'",
  identityFile: 'string>0',
  knownHostsFile: 'string>0',
  timeoutMs: '0<number.integer<=300000',
  '+': 'reject',
});

/** Bounded descriptor read used for credentials, reviewed trust and requests; never follows a final symlink. */
export async function readFluxBytes(path: string): Promise<Buffer> {
  let descriptor;
  try {
    // Proof: removing NOFOLLOW changed the symlink refusal; removing NONBLOCK left the real FIFO CLI blocked until its 1.5s test deadline.
    descriptor = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (failure) {
    if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT')
      return refuseFlux('input-absent');
    return refuseFlux('input-unreadable');
  }
  try {
    const status = await descriptor.stat();
    if (!status.isFile()) return refuseFlux('input-unreadable');
    // Proof: bypassing this boundary accepted the mode0644 JSON in the public-input negative.
    if (status.uid !== process.getuid?.() || (status.mode & 0o777) !== 0o600)
      return refuseFlux('input-permissions');
    const bytes = Buffer.alloc(65537);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await descriptor.read(bytes, length, bytes.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    // Proof: removing this limit accepted oversized valid JSON; the bounded-input negative failed.
    if (length > 65536) return refuseFlux('input-too-large');
    return bytes.subarray(0, length);
  } catch (failure) {
    if (failure instanceof FluxRefusal) throw failure;
    return refuseFlux('input-unreadable');
  } finally {
    await descriptor.close();
  }
}
/** Decode owner-only request JSON without exposing schema values or parser diagnostics. */
export async function readFluxInput(path: string): Promise<unknown> {
  const bytes = await readFluxBytes(path);
  try {
    return JSON.parse(bytes.toString()) as unknown;
  } catch {
    return refuseFlux('input-malformed');
  }
}

/** Local subprocess group with one caller deadline and bounded combined output; no raw stderr in failures. */
export async function executeFluxRead(
  argv: string[],
  deadline: number,
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<Buffer> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return refuseFlux('deadline-expired');
  let child;
  try {
    child = Bun.spawn(argv, {
      ...options,
      detached: true,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch {
    return refuseFlux('command-unavailable');
  }
  let length = 0;
  async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const bytes of stream) {
      length += bytes.length;
      // Proof: removing this cap accepted the real subprocess overflow; the negative resolved.
      if (length > 64 * 1024 * 1024) return refuseFlux('command-output-too-large');
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    // Proof: delaying this deadline by one second failed the real subprocess elapsed-time assertion.
    timer = setTimeout(() => {
      reject(new FluxRefusal('deadline-expired'));
    }, remaining);
  });
  try {
    const completed = Promise.all([child.exited, collect(child.stdout), collect(child.stderr)]);
    const [exitCode, stdout] = await Promise.race([completed, expired]);
    if (exitCode !== 0) return refuseFlux('command-failed');
    return stdout;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    terminateProcess(child.pid);
  }
}

function terminateProcess(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (failure) {
    if (!(failure instanceof Error && 'code' in failure && failure.code === 'ESRCH'))
      refuseFlux('command-termination-failed');
  }
}

/** Exclusive durable receipt creation. An occupied pathname is never replaced or adopted. */
export async function writeFluxReceipt(path: string, receipt: unknown): Promise<void> {
  let descriptor;
  try {
    // Proof: removing the parent check wrote into a mode0755 directory; exposed-parent negative failed.
    await requireDirectory(dirname(path));
    // Proof: removing O_EXCL overwrote the first operation; exclusive-receipt negative resolved.
    descriptor = await open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
  } catch (failure) {
    if (failure instanceof Error && 'code' in failure && failure.code === 'EEXIST')
      return refuseFlux('receipt-occupied');
    return refuseFlux('receipt-unwritable');
  }
  try {
    await descriptor.writeFile(`${JSON.stringify(receipt, null, 2)}\n`);
    await descriptor.sync();
    const parent = await open(
      dirname(path),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } catch {
    return refuseFlux('receipt-unwritable');
  } finally {
    await descriptor.close();
  }
}

/** Opaque in-process validation capability; JSON receipts alone cannot supply this authority. */
export interface FluxPacket {
  readonly scope: 'validated-observability-packet';
}
interface PacketContent {
  tools: string;
  receipt: ObservabilityRehearsalReceipt;
  files: Map<string, Buffer>;
}
const packets = new WeakMap<FluxPacket, PacketContent>();
/** Invoke the existing complete source validator once; retain exact verified bytes for transport comparison and observation planning. */
export async function validateFluxPacket(
  root: string,
  tools: string,
  input: unknown,
  directory: string,
): Promise<FluxPacket> {
  const receipt = await validateObservabilityRehearsal(root, tools, input, directory);
  const files = new Map<string, Buffer>();
  for (const file of receipt.files) {
    const bytes = await readFile(join(directory, file.path));
    if (hash(bytes) !== file.sha256) return refuseFlux('packet-changed');
    files.set(file.path, bytes);
  }
  const provenance = await readFile(join(directory, 'rehearsal.json'));
  if (!isDeepStrictEqual(JSON.parse(provenance.toString()), receipt))
    return refuseFlux('packet-changed');
  files.set('rehearsal.json', provenance);
  const packet: FluxPacket = Object.freeze({ scope: 'validated-observability-packet' });
  packets.set(packet, { tools, receipt, files });
  return packet;
}
/** Return isolated verified bytes to the Fleet observation planner; forged capabilities refuse. */
export function readFluxPacket(packet: FluxPacket): PacketContent {
  const content = packets.get(packet);
  if (content === undefined) return refuseFlux('packet-unvalidated');
  return {
    tools: content.tools,
    receipt: structuredClone(content.receipt),
    files: new Map([...content.files].map(([path, bytes]) => [path, Buffer.from(bytes)])),
  };
}

const bindings = new WeakMap<object, FluxPacket>();
export type FluxBinding = Awaited<ReturnType<typeof bindObservabilitySource>>;
/** Require an actual successful authenticated-fetch operation from this process, not a caller's saved ready object. */
export function requireFluxBinding(binding: FluxBinding, packet: FluxPacket): void {
  // Proof: removing the capability check accepted cloned binding JSON in the observer.
  if (
    bindings.get(binding) !== packet ||
    binding.packetSHA256 !== readFluxPacket(packet).receipt.artifactSHA256
  )
    return refuseFlux('source-unbound');
}

/**
 * Fetch an externally published exact-root packet using only supplied SSH identity and host trust.
 * Compare every tracked blob, including provenance, before recording a usable binding. Never publish,
 * create a cluster/Secret, attest human review, or claim that successful transport establishes readiness.
 */
export async function bindObservabilitySource(
  packet: FluxPacket,
  input: unknown,
  receiptPath: string,
) {
  const source = Source(input);
  if (source instanceof type.errors || source.repositoryURL.split('/').includes('..'))
    return refuseFlux('source-malformed');
  const content = readFluxPacket(packet);
  const deadline = Date.now() + source.timeoutMs;
  const identity = await readFluxBytes(source.identityFile);
  const trust = await readFluxBytes(source.knownHostsFile);
  const scratch = await mkdtemp(join(tmpdir(), 'puni-flux-fetch-'));
  try {
    const keyPath = join(scratch, 'identity');
    const trustPath = join(scratch, 'known_hosts');
    await writeFile(keyPath, identity, { mode: 0o600 });
    await writeFile(trustPath, trust, { mode: 0o600 });
    await executeFluxRead(['ssh-keygen', '-y', '-P', '', '-f', keyPath], deadline);
    const host = new URL(source.repositoryURL).hostname;
    await executeFluxRead(['ssh-keygen', '-F', host, '-f', trustPath], deadline);
    await executeFluxRead(['ssh-keygen', '-l', '-f', trustPath], deadline);
    const path = process.env['PATH'];
    if (path === undefined) return refuseFlux('command-path-absent');
    const quote = (path: string) => `'${path.replaceAll("'", "'\\''")}'`;
    const env = {
      PATH: path,
      HOME: scratch,
      LC_ALL: 'C',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
      GIT_ALLOW_PROTOCOL: 'ssh',
      GIT_SSH_VARIANT: 'ssh',
      GIT_SSH_COMMAND: `ssh -F /dev/null -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile=${quote(trustPath)} -i ${quote(keyPath)}`,
    };
    const execute = (argv: string[]) =>
      executeFluxRead(['git', ...argv], deadline, { cwd: scratch, env });
    await execute(['init', '--bare', '-q']);
    await execute([
      '-c',
      'fetch.fsckObjects=true',
      'fetch',
      '--no-tags',
      '--depth=1',
      source.repositoryURL,
      source.artifactCommit,
    ]);
    const commit = (await execute(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']))
      .toString()
      .trim();
    if (commit !== source.artifactCommit) return refuseFlux('source-commit-mismatch');
    const tree = (await execute(['ls-tree', '-rz', '--full-tree', commit]))
      .toString()
      .split('\0')
      .filter(Boolean);
    const paths: string[] = [];
    for (const entry of tree) {
      const match = /^100644 blob [a-f0-9]{40}\t([^\0]+)$/.exec(entry);
      if (match === null) return refuseFlux('source-tree-refused');
      paths.push(match[1]);
    }
    // Proof: removing complete closure accepted an extra tracked file fetched from real Git.
    if (!isDeepStrictEqual(paths.sort(), [...content.files.keys()].sort()))
      return refuseFlux('source-file-closure');
    for (const [name, bytes] of content.files) {
      const fetched = await execute(['cat-file', 'blob', `${commit}:${name}`]);
      // Proof: removing byte comparison accepted changed fetched toolchain bytes.
      if (!fetched.equals(bytes)) return refuseFlux('source-content-mismatch');
    }
    const binding = Object.freeze({
      schemaVersion: 1 as const,
      scope: 'authenticated-observability-artifact' as const,
      operationId: randomUUID(),
      observedAt: new Date().toISOString(),
      sourceRevision: content.receipt.sourceRevision,
      sourceReviewStatus: content.receipt.sourceReviewStatus,
      generator: content.receipt.generator,
      packetSHA256: content.receipt.artifactSHA256,
      artifactCommit: commit,
      artifactRoot: '.' as const,
      graphRoot,
      repositoryIdentitySHA256: hash(source.repositoryURL),
      hostTrustSHA256: hash(trust),
      trustReview: 'external-prerequisite-unverified' as const,
      bootstrap: {
        contract: 'infra/ansible/playbooks/platform.yml',
        source: {
          kind: 'GitRepository',
          namespace: 'flux-system',
          name: 'puni-platform',
          commit,
          secretRef: 'puni-platform-auth',
        },
        root: {
          kind: 'Kustomization',
          namespace: 'flux-system',
          name: 'puni-cluster',
          path: graphRoot,
          sourceRef: 'puni-platform',
          prune: true,
          wait: true,
        },
        requiredSecrets: ['puni-platform-auth', 'sops-age', 'platform-local-kubeconfig'],
        externalPrerequisites: content.receipt.externalPrerequisites,
        handoffExecuted: false as const,
        blockers: [
          'complete created-resource ownership absent',
          'complete two-instance/transient/coexistence budget absent',
          'external material and observed network bindings required',
        ],
      },
      runtimeAcceptance: false as const,
      liveBinding: false as const,
    });
    await writeFluxReceipt(receiptPath, binding);
    bindings.set(binding, packet);
    return binding;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
