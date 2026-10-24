import type { DependencyOwner } from './edge-ownership';
import { ownerDockerHashed } from './edge-ownership';
import type { EnvLayout } from './env';

export type ProductMetadataRequest =
  | { readonly kind: 'container' | 'top'; readonly id: string }
  | { readonly kind: 'image'; readonly id: string };

/** Only raw child lifecycle facts cross this internal fixture seam. */
export interface ProductMetadataChild {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  kill(): void;
}

export type SpawnProductMetadata = (
  request: ProductMetadataRequest,
  signal?: AbortSignal,
) => ProductMetadataChild;

function commandFor(request: ProductMetadataRequest): string[] {
  if (request.kind === 'image') {
    if (!/^sha256:[a-f0-9]{64}$/.test(request.id))
      throw new Error('product metadata request malformed');
    return ['image', 'inspect', request.id];
  }
  if (!/^[a-f0-9]{64}$/.test(request.id)) throw new Error('product metadata request malformed');
  return request.kind === 'container'
    ? ['inspect', '--format', '{{json .}}', request.id]
    : ['top', request.id, '-eo', 'pid,ppid'];
}

/** Fixed production adapter. Its caller owns deadline, incremental pipe reads and child settlement. */
export function spawnProductMetadata(
  request: ProductMetadataRequest,
  signal?: AbortSignal,
): ProductMetadataChild {
  const command = commandFor(request);
  if (signal?.aborted) throw new Error('product metadata cancelled before spawn');
  const child = Bun.spawn(['docker', ...command], {
    stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal, killSignal: 'SIGKILL',
  });
  return {
    stdout: child.stdout,
    stderr: child.stderr,
    exited: child.exited,
    kill: () => { child.kill('SIGKILL'); },
  };
}

/** Distinct terminal outcome: exact child/pipe settlement could not be proved within cleanup reserve. */
export class ProductMetadataCleanupUnproved extends Error {
  constructor() { super('product metadata cleanup unproved'); }
}

function checkDeadline(deadline: number, reserve: number): void {
  if (!Number.isFinite(deadline) || deadline - performance.now() <= reserve || deadline - performance.now() > 600000)
    throw new Error('product metadata deadline exhausted');
}

async function observeChild(
  child: ProductMetadataChild,
  request: ProductMetadataRequest,
  cutoff: number,
  deadline: number,
  controller: AbortController,
): Promise<string> {
  const maximum = request.kind === 'top' ? 64 * 1024 : 4 * 1024 * 1024;
  const chunks: Uint8Array[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stopped = false;
  const isStopped = () => stopped;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    try { child.kill(); } catch { /* Exact-child kill failure is represented by settlement refusal. */ }
  };
  const read = async (stream: ReadableStream<Uint8Array>, kind: 'stdout' | 'stderr') => {
    const reader = stream.getReader();
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        if (kind === 'stdout') {
          stdoutBytes += next.value.byteLength;
          if (stdoutBytes > maximum) {
            stop();
            throw new Error('product metadata stdout bound exceeded');
          }
          chunks.push(next.value);
        } else {
          stderrBytes += next.value.byteLength;
          if (stderrBytes > 65536 || stderrBytes > 0) {
            stop();
            throw new Error('product metadata stderr refused');
          }
        }
      }
    } catch {
      stop();
      throw new Error(`product metadata ${kind} read failed`);
    } finally {
      reader.releaseLock();
    }
  };
  const stdoutTask = read(child.stdout, 'stdout');
  const stderrTask = read(child.stderr, 'stderr');
  const exitTask = child.exited.then(
    (code) => code,
    () => { stop(); throw new Error('product metadata exit unavailable'); },
  );
  const all = Promise.allSettled([stdoutTask, stderrTask, exitTask]);
  const workRemaining = cutoff - performance.now();
  const workTimer = setTimeout(stop, Math.max(0, workRemaining));
  controller.signal.addEventListener('abort', stop, { once: true });
  if (controller.signal.aborted) stop();
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const cleanupRemaining = Math.min(5000, deadline - performance.now());
    const settled = await Promise.race([
      all,
      new Promise<null>((resolve) => {
        cleanupTimer = setTimeout(() => { resolve(null); }, Math.max(0, workRemaining + cleanupRemaining));
      }),
    ]);
    if (settled === null) {
      stop();
      throw new ProductMetadataCleanupUnproved();
    }
    const [stdout, stderr, exit] = settled;
    if (isStopped() || stdout.status !== 'fulfilled' || stderr.status !== 'fulfilled' || exit.status !== 'fulfilled' || exit.value !== 0)
      throw new Error('product metadata observation refused');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } catch {
      throw new Error('product metadata UTF-8 malformed');
    }
  } finally {
    clearTimeout(workTimer);
    if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
    controller.signal.removeEventListener('abort', stop);
  }
}

/** Owner-audited, closed metadata request. A completed callback has joined both pipes and exact child exit. */
export async function readProductMetadata(
  owner: DependencyOwner,
  layout: EnvLayout,
  spawn: SpawnProductMetadata,
  request: ProductMetadataRequest,
  deadline: number,
  signal?: AbortSignal,
): Promise<string> {
  const command = commandFor(request);
  checkDeadline(deadline, 20000);
  if (signal?.aborted) throw new Error('product metadata cancelled before dispatch');
  const cutoff = Math.min(performance.now() + 15000, deadline - 20000);
  const audited = ownerDockerHashed(owner, layout, async (_command, ownerSignal) => {
    checkDeadline(cutoff, 0);
    const controller = new AbortController();
    if (ownerSignal?.aborted) throw new Error('product metadata cancelled before spawn');
    const onAbort = () => { controller.abort(); };
    ownerSignal?.addEventListener('abort', onAbort, { once: true });
    try {
      const child = spawn(request, controller.signal);
      return await observeChild(child, request, cutoff, deadline, controller);
    } finally {
      ownerSignal?.removeEventListener('abort', onAbort);
    }
  });
  const response = await audited(command, signal);
  if (signal?.aborted) throw new Error('product metadata cancelled after child settlement');
  return response;
}
