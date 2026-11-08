import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readRegistrySource } from './registry-source';
import { readRegistryBytes } from './registry-stream';

/** Execute fixed reader argv with bounded output and a deadline; overflow kills and reaps before refusal. Standalone shell callers own a process group; source readers retain the enclosing reader group. */
export async function runRegistryProcess(
  argv: readonly string[],
  cwd: string,
  timeoutMs = 30000,
  options: { ownProcessGroup?: boolean; signal?: AbortSignal } = {},
): Promise<string> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 180000)
    throw new Error('Registry process deadline is invalid');
  options.signal?.throwIfAborted();
  const child = Bun.spawn([...argv], {
    cwd,
    detached: options.ownProcessGroup === true,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { PATH: '/usr/bin:/bin', HOME: cwd },
  });
  const stdout = readRegistryBytes(child.stdout, 4 * 1024 ** 2, 'Registry source stdout');
  const stderr = readRegistryBytes(child.stderr, 65536, 'Registry source stderr');
  const terminate = () => {
    if (options.ownProcessGroup === true) {
      // Proof: native descendant test wrote after timeout with only child.kill; kill the owned group.
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
      }
    } else if (child.exitCode === null) child.kill('SIGKILL');
  };
  const timer = { expired: false };
  const deadline = setTimeout(() => {
    timer.expired = true;
    terminate();
  }, timeoutMs);
  options.signal?.addEventListener('abort', terminate, { once: true });
  if (options.signal?.aborted) terminate();
  try {
    const [code, output, diagnostic] = await Promise.all([child.exited, stdout, stderr]);
    options.signal?.throwIfAborted();
    if (timer.expired) throw new Error('Registry source command deadline exceeded');
    if (code !== 0)
      throw new Error(`Registry source command failed: ${new TextDecoder().decode(diagnostic)}`);
    return new TextDecoder().decode(output);
  } catch (cause) {
    terminate();
    await child.exited;
    await Promise.allSettled([stdout, stderr]);
    throw cause;
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', terminate);
  }
}

/** Run a native reader from a verified private executable snapshot; always remove owned bytes. */
export async function withRegistryExecutable<T>(
  pin: { path: string; sha256: string },
  run: (executable: string, directory: string) => Promise<T>,
): Promise<T> {
  const artifact = await readRegistrySource(pin.path, 128 * 1024 ** 2);
  if (createHash('sha256').update(artifact.bytes).digest('hex') !== pin.sha256)
    throw new Error('Registry native reader artifact digest mismatch');
  const directory = await mkdtemp(join(tmpdir(), 'registry-native-'));
  try {
    const executable = join(directory, 'reader');
    await writeFile(executable, artifact.bytes, { mode: 0o700 });
    return await run(executable, directory);
  } finally {
    await rm(directory, { recursive: true });
  }
}
