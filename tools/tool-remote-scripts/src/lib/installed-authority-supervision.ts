import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';

import { AUTHORITY_COLLECTOR } from './installed-authority-collector';
import { AUTHORITY_SUPERVISOR } from './installed-authority-supervisor';
import { readClosed, readString } from './managed-cohort';
import { observeSolverProcess } from './solver-host';

/** Marks a retained-owner refusal when descendant cleanup cannot be established. */
export class AuthorityCleanupUnknown extends Error {
  readonly cleanup = 'unknown';
  constructor() {
    super('installed authority cleanup unknown; retain owner and inspect the collector attempt');
  }
}
/** Joins a fixed supervisor: clean terminal acknowledgement, EOF and child exit are all required.
 * A parent timeout requests cancellation first. Killing the direct sudo child can only end an
 * already unknown transport; it is never used to assert privileged descendant extinction.
 */
export async function joinAuthoritySupervisor(
  child: ChildProcessWithoutNullStreams,
  request: unknown,
  nonce: string,
  deadline: number,
  signal?: AbortSignal,
): Promise<string> {
  const session: {
    ready: boolean;
    terminal: Record<string, unknown> | undefined;
    malformed: boolean;
    stderr: boolean;
    timedOut: boolean;
  } = { ready: false, terminal: undefined, malformed: false, stderr: false, timedOut: false };
  let count = 0;
  let buffered = '';
  let cancellationRequested = signal?.aborted ?? false;
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  const closed = new Promise<void>((resolve) => {
    child.once('close', () => {
      resolve();
    });
  });
  const send = (kind: string) => {
    if (!child.stdin.destroyed && child.stdin.writable) child.stdin.write(`${kind} ${nonce}\n`);
  };
  child.stdin.on('error', () => {
    session.malformed = true;
  });
  const remaining = deadline - performance.now();
  if (child.pid === undefined) {
    await exited.catch(() => null);
    await closed;
    throw new AuthorityCleanupUnknown();
  }
  let transport;
  try {
    transport = await observeSolverProcess(child.pid);
  } catch {
    child.stdin.destroy();
    await exited.catch(() => null);
    await closed;
    throw new AuthorityCleanupUnknown();
  }
  child.stdin.write(JSON.stringify({ request, transport, budgetSeconds: remaining / 1000 }) + '\n');
  const requestCancellation = () => {
    cancellationRequested = true;
    if (session.ready) send('cancel');
  };
  signal?.addEventListener('abort', requestCancellation, { once: true });
  const heartbeat = setInterval(() => {
    if (session.ready && !session.terminal) send('ping');
  }, 150);
  const cancel = setTimeout(
    requestCancellation,
    Math.max(1, remaining - Math.min(10000, remaining / 3)),
  );
  const unknown = setTimeout(
    () => {
      session.timedOut = true;
      send('cancel');
      child.kill('SIGKILL');
    },
    Math.max(1, remaining),
  );
  async function drainOutput(): Promise<void> {
    for await (const chunk of child.stdout) {
      if (!Buffer.isBuffer(chunk)) throw new Error('authority supervisor emitted nonbyte output');
      count += chunk.length;
      if (count > 32 * 1024 * 1024) {
        session.malformed = true;
        send('cancel');
        continue;
      }
      buffered += chunk.toString('utf8');
      for (;;) {
        const newline = buffered.indexOf('\n');
        if (newline < 0) break;
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        try {
          const decoded: unknown = JSON.parse(line);
          const phase = readClosed(
            decoded,
            session.ready
              ? [
                  'phase',
                  'nonce',
                  'cleanup',
                  ...(typeof decoded === 'object' && decoded !== null && 'observation' in decoded
                    ? ['observation']
                    : []),
                ]
              : ['phase', 'nonce', 'monotonic'],
          );
          if (phase['nonce'] !== nonce || session.terminal !== undefined)
            throw new Error('authority supervisor response differs');
          if (!session.ready) {
            if (phase['phase'] !== 'ready')
              throw new Error('authority supervisor acknowledgement missing');
            const monotonic = phase['monotonic'];
            if (typeof monotonic !== 'number' || !Number.isFinite(monotonic) || monotonic <= 0)
              throw new Error('authority supervisor clock malformed');
            session.ready = true;
            if (cancellationRequested) send('cancel');
            else
              child.stdin.write(
                'start ' +
                  nonce +
                  ' ' +
                  String(monotonic + (deadline - performance.now()) / 1000) +
                  '\n',
              );
            send('ping');
          } else {
            if (!['complete', 'refused'].includes(readString(phase['phase'])))
              throw new Error('authority supervisor terminal malformed');
            session.terminal = phase;
          }
        } catch {
          session.malformed = true;
          send('cancel');
        }
      }
    }
  }
  async function drainErrors(): Promise<void> {
    for await (const chunk of child.stderr) {
      if (!Buffer.isBuffer(chunk) || chunk.length > 0) {
        session.stderr = true;
        send('cancel');
      }
    }
  }
  try {
    const failPipe = () => {
      session.malformed = true;
      send('cancel');
    };
    const [, , code] = await Promise.all([
      drainOutput().catch(failPipe),
      drainErrors().catch(failPipe),
      exited.catch(() => {
        failPipe();
        return null;
      }),
    ]);
    await closed;
    if (session.timedOut || session.terminal?.['cleanup'] !== 'complete' || buffered !== '')
      throw new AuthorityCleanupUnknown();
    if (
      session.malformed ||
      session.stderr ||
      !session.ready ||
      code !== 0 ||
      session.terminal['phase'] !== 'complete' ||
      !Object.hasOwn(session.terminal, 'observation')
    )
      throw new Error('installed authority collection refused after complete descendant cleanup');
    return JSON.stringify(session.terminal['observation']);
  } finally {
    signal?.removeEventListener('abort', requestCancellation);
    clearInterval(heartbeat);
    clearTimeout(cancel);
    clearTimeout(unknown);
    child.stdin.destroy();
  }
}

/** Fixed ephemeral supervisor; only private request/control bytes use stdin. */
export async function collectAuthorityHost(request: unknown, deadline: number): Promise<string> {
  const requestFields = readClosed(request, [
    'nonce',
    'writerManifestSha256',
    'coordinator',
    'databases',
    'layouts',
    'writerPaths',
    'solver',
  ]);
  const nonce = readString(requestFields['nonce']);
  const remaining = deadline - performance.now();
  if (remaining <= 0 || remaining > 120000)
    throw new Error('authority observation requires a bounded deadline');
  const program =
    AUTHORITY_COLLECTOR + '\n' + AUTHORITY_SUPERVISOR + '\nsupervisor_entry(collect)\n';
  if (Buffer.byteLength(program) > 96 * 1024)
    throw new Error('fixed authority supervisor exceeds argv bound');
  if (process.geteuid === undefined) throw new Error('Linux effective UID observation unavailable');
  const command =
    process.geteuid() === 0
      ? ['/usr/bin/python3', '-I', '-c', program]
      : ['/usr/bin/sudo', '-n', '/usr/bin/python3', '-I', '-c', program];
  const executable = command.shift();
  if (executable === undefined) throw new Error('fixed authority executable missing');
  const child = spawn(executable, command, { stdio: ['pipe', 'pipe', 'pipe'] });
  return joinAuthoritySupervisor(child, request, nonce, deadline);
}
