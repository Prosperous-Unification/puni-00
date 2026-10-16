import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, sep } from 'node:path';

import { observeProcesses } from './forge-process-observation';
import type { PodObservation } from './forge-recovery-check';
import { type SourceMemoryEvidence, validateSourceMemory } from './forge-source-memory-evidence';

interface LocalRuntime {
  readonly executable: string;
  readonly endpoint: string;
  readonly windowMs: number;
}
interface LocalRoots {
  readonly procRoot: string;
  readonly cgroupRoot: string;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('malformed local runtime response');
  // The object boundary excludes null and arrays; values remain unknown until checked below.
  return value as Record<string, unknown>;
}

/**
 * Discovers one current source init from an explicitly selected local containerd CRI endpoint,
 * observes one complete sample, and rechecks runtime/process/cgroup identity before validating.
 * The absolute crictl executable is resolved once and receives only fixed inspect arguments;
 * no shell, Docker, SSH, runtime discovery, lifecycle or remote observation is performed.
 * Required filesystem reads and combined child output are capped at 64KiB. One monotonic
 * window (1..30000ms) bounds both inspections and sampling, with scheduler tolerance.
 * Throws a fixed sanitized error without raw runtime output, paths, argv or environment.
 * Roots select the local namespace boundary for offline fixtures. Operators must establish
 * that this namespace belongs to the selected runtime; this cannot authenticate that assertion,
 * a cluster, historical first-attempt ownership, readiness, OOM cause or F9 acceptance.
 * Sequential reads cannot exclude changes that revert between checks. See docs/infra/local.md.
 */
export async function observeSourceMemory(
  first: PodObservation,
  runtime: LocalRuntime,
  roots: LocalRoots = { procRoot: '/proc', cgroupRoot: '/sys/fs/cgroup' },
): Promise<SourceMemoryEvidence> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let terminate: (() => void) | undefined;
  try {
    // Proof: endpoint/absolute-executable/window-upper-bound faults RETURN EVIDENCE for
    // forbidden selections. Removing both basename checks RETURNS EVIDENCE for a Docker-named
    // fixture; the two name checks form one redundant enforcement path.
    if (
      !/^containerd:\/\/[a-f0-9]{64}$/.test(first.container) ||
      first.uid.length === 0 ||
      !isAbsolute(runtime.executable) ||
      basename(runtime.executable) !== 'crictl' ||
      !/^unix:\/\/\/(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+\.sock$/.test(runtime.endpoint) ||
      runtime.endpoint
        .slice(8)
        .split('/')
        .some((segment) => segment === '.' || segment === '..') ||
      /docker/i.test(runtime.endpoint) ||
      !Number.isFinite(runtime.windowMs) ||
      runtime.windowMs < 1 ||
      runtime.windowMs > 30_000
    )
      throw new Error('invalid local observation selection');
    const started = performance.now();
    const deadline = started + runtime.windowMs;
    const requireTime = () => {
      if (performance.now() >= deadline) throw new Error('local observation deadline');
    };
    const readText = async (path: string): Promise<string> => {
      requireTime();
      // Proof: no-follow fault RETURNS EVIDENCE for the post-sample valid-status symlink.
      // Nonblocking and regular-file checks also refuse special required files before parsing.
      const descriptor = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        if (!(await descriptor.stat()).isFile())
          throw new Error('required local file is not regular');
        const bytes = Buffer.alloc(65_537);
        let length = 0;
        while (length < bytes.length) {
          requireTime();
          const read = await descriptor.read(bytes, length, bytes.length - length, null);
          if (read.bytesRead === 0) break;
          length += read.bytesRead;
        }
        // Proof: read-cap fault RETURNS EVIDENCE for oversized valid status after sampling.
        if (length > 65_536) throw new Error('local observation byte limit');
        requireTime();
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
      } finally {
        await descriptor.close();
      }
    };
    const collect = async (): Promise<SourceMemoryEvidence> => {
      const executable = await realpath(runtime.executable);
      if (basename(executable) !== 'crictl') throw new Error('local crictl executable required');
      const inspect = async (): Promise<number> => {
        requireTime();
        const bytes = await new Promise<Buffer>((resolve, reject) => {
          const child = spawn(
            executable,
            [
              '--config',
              '/dev/null',
              '--runtime-endpoint',
              runtime.endpoint,
              '--timeout',
              '2s',
              'inspect',
              '--output',
              'json',
              first.container.slice(13),
            ],
            { env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] },
          );
          terminate = () => {
            child.kill('SIGKILL');
          };
          const chunks: Buffer[] = [];
          let length = 0;
          const consume = (chunk: Buffer, retain: boolean) => {
            length += chunk.length;
            // Proof: output-cap fault RETURNS EVIDENCE for oversized valid JSON and stderr.
            if (length > 65_536) {
              child.kill('SIGKILL');
              reject(new Error('local runtime output limit'));
            } else if (retain) chunks.push(chunk);
          };
          child.stdout.on('data', (chunk: Buffer) => {
            consume(chunk, true);
          });
          child.stderr.on('data', (chunk: Buffer) => {
            consume(chunk, false);
          });
          child.on('error', () => {
            reject(new Error('local runtime unavailable'));
          });
          child.on('close', (code) => {
            terminate = undefined;
            if (code !== 0) reject(new Error('local runtime inspection failed'));
            else resolve(Buffer.concat(chunks));
          });
        });
        requireTime();
        const decoded: unknown = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        );
        const inspection = readRecord(decoded);
        const status = readRecord(inspection['status']);
        const pid = readRecord(inspection['info'])['pid'];
        // Proof: runtime-id/uid/name/running faults RETURN EVIDENCE for foreign inspections;
        // host-pid1 fault RETURNS EVIDENCE for otherwise consistent local PID1 files.
        if (
          status['id'] !== first.container.slice(13) ||
          status['state'] !== 'CONTAINER_RUNNING' ||
          readRecord(status['labels'])['io.kubernetes.pod.uid'] !== first.uid ||
          readRecord(status['metadata'])['name'] !== 'source' ||
          typeof pid !== 'number' ||
          !Number.isSafeInteger(pid) ||
          pid <= 1
        )
          throw new Error('local runtime source identity mismatch');
        return pid;
      };
      const pid = await inspect();
      const proc = join(roots.procRoot, String(pid));
      const identify = async () => {
        const identity = await readText(join(proc, 'stat'));
        const end = identity.lastIndexOf(')');
        const fields = identity
          .slice(end + 2)
          .trim()
          .split(/\s+/);
        const starttime = fields.at(19);
        const ppid = fields.at(1);
        const status = await readText(join(proc, 'status'));
        const namespace = /^NSpid:\s+([\d\t ]+)$/m.exec(status)?.at(1)?.trim().split(/\s+/);
        const membership = (await readText(join(proc, 'cgroup'))).trim();
        if (
          end < 0 ||
          !identity.startsWith(`${String(pid)} (`) ||
          starttime === undefined ||
          !/^\d+$/.test(starttime) ||
          ppid === undefined ||
          !/^\d+$/.test(ppid) ||
          /^Pid:\s+(\d+)$/m.exec(status)?.at(1) !== String(pid) ||
          /^PPid:\s+(\d+)$/m.exec(status)?.at(1) !== ppid ||
          // Proof: namespace-pid1 fault RETURNS EVIDENCE for initial/final namespace PID2.
          namespace?.at(0) !== String(pid) ||
          namespace.at(-1) !== '1' ||
          !/^0::\/(?:[^/\s]+\/)*[^/\s]+$/.test(membership) ||
          membership
            .slice(4)
            .split('/')
            .some((segment) => segment === '.' || segment === '..')
        )
          throw new Error('local init identity mismatch');
        return { starttime, ppid, cgroup: membership.slice(3) };
      };
      const before = await identify();
      const root = await realpath(roots.cgroupRoot);
      const directory = await realpath(join(root, before.cgroup));
      const suffix = relative(root, directory);
      if (
        suffix === '' ||
        suffix === '..' ||
        suffix.startsWith(`..${sep}`) ||
        isAbsolute(suffix) ||
        `/${suffix.split(sep).join('/')}` !== before.cgroup
      )
        throw new Error('exact local cgroup required');
      const identity = await stat(directory, { bigint: true });
      if (!identity.isDirectory()) throw new Error('local cgroup directory required');
      requireTime();
      const samples = await observeProcesses(
        {
          cgroup: directory,
          samples: 1,
          intervalMs: 0,
          windowMs: Math.max(1, deadline - performance.now()),
        },
        roots,
      );
      // Proof: runtime-reinspect fault RETURNS EVIDENCE after the runtime switches init PID.
      if ((await inspect()) !== pid) throw new Error('local runtime init changed');
      const after = await identify();
      const observed = await stat(directory, { bigint: true });
      // Proof: starttime/parent/membership/directory-recheck faults each RETURN EVIDENCE
      // for the corresponding post-sample identity change in consuming spawned-runtime tests.
      if (
        before.starttime !== after.starttime ||
        before.ppid !== after.ppid ||
        before.cgroup !== after.cgroup ||
        identity.dev !== observed.dev ||
        identity.ino !== observed.ino
      )
        throw new Error('local source identity changed');
      requireTime();
      return validateSourceMemory(samples, first, {
        uid: first.uid,
        container: first.container,
        init: { pid, starttime: before.starttime },
        cgroup: before.cgroup,
        device: String(identity.dev),
        inode: String(identity.ino),
      });
    };
    const ceiling = new Promise<never>((_, reject) => {
      // Proof: child-termination fault leaves the spawned stalled fixture alive after failure.
      // Proof: deadline fault exceeds the stalled-runtime test's external 2000ms ceiling.
      timer = setTimeout(() => {
        terminate?.();
        reject(new Error('local source observation deadline'));
      }, runtime.windowMs);
    });
    return await Promise.race([collect(), ceiling]);
  } catch {
    // Proof: sanitize fault exposes the credential-bearing ENOENT path to its consuming test.
    // Raw runtime/filesystem failures can contain credentials, argv and operator paths.
    throw new Error('local source memory observation failed');
  } finally {
    clearTimeout(timer);
    terminate?.();
  }
}
