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
 * The bounded initial-envelope option encodes the actual request/observed transport/budget
 * once, counts its UTF-8 bytes including newline, and writes that identical Buffer.
 * An unsent request cannot establish descendant cleanup: after original transport/pipe
 * settlement it throws AuthorityCleanupUnknown. Callers needing exclusion must retain
 * their own lifetime lock on unknown; this joiner does not own the runtime lock.
 */
export async function joinAuthoritySupervisor(
  child: ChildProcessWithoutNullStreams,
  request: unknown,
  nonce: string,
  deadline: number,
  signal?: AbortSignal,
  options?: Readonly<{ initialEnvelope: 'bounded' }>,
): Promise<string> {
  const strict = options?.initialEnvelope === 'bounded';
  let transmitted = false;
  const session: {
    ready: boolean;
    terminal: Record<string, unknown> | undefined;
    malformed: boolean;
    stderr: boolean;
    timedOut: boolean;
    failedRead: boolean;
  } = {
    ready: false,
    terminal: undefined,
    malformed: false,
    stderr: false,
    timedOut: false,
    failedRead: false,
  };
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
    if (
      (!strict || (transmitted && session.ready)) &&
      !child.stdin.destroyed &&
      child.stdin.writable
    )
      child.stdin.write(`${kind} ${nonce}\n`);
  };
  child.stdin.on('error', () => {
    session.malformed = true;
  });
  const requestCancellation = () => {
    cancellationRequested = true;
    if (session.ready) send('cancel');
  };
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
            if (strict && !transmitted)
              throw new Error('authority acknowledgement preceded request');
            if (phase['phase'] !== 'ready')
              throw new Error('authority supervisor acknowledgement missing');
            const monotonic = phase['monotonic'];
            if (typeof monotonic !== 'number' || !Number.isFinite(monotonic) || monotonic <= 0)
              throw new Error('authority supervisor clock malformed');
            session.ready = true;
            if (strict && (signal?.aborted === true || deadline - performance.now() <= 0))
              cancellationRequested = true;
            if (cancellationRequested) send('cancel');
            else if (strict) {
              const startRemaining = deadline - performance.now();
              if (
                !Number.isFinite(startRemaining) ||
                startRemaining <= 0 ||
                signal?.aborted === true
              ) {
                cancellationRequested = true;
                send('cancel');
              } else {
                child.stdin.write(
                  'start ' + nonce + ' ' + String(monotonic + startRemaining / 1000) + '\n',
                );
              }
            } else {
              child.stdin.write(
                'start ' +
                  nonce +
                  ' ' +
                  String(monotonic + (deadline - performance.now()) / 1000) +
                  '\n',
              );
            }
            if (!strict || !cancellationRequested) send('ping');
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
  const failPipe = () => {
    if (strict) session.failedRead = true;
    session.malformed = true;
    send('cancel');
  };
  // Strict calls take custody of both original pipes before observing transport or serializing.
  const output = strict ? drainOutput().catch(failPipe) : undefined;
  const errors = strict ? drainErrors().catch(failPipe) : undefined;
  let remaining = deadline - performance.now();
  if (!strict) {
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
    child.stdin.write(
      JSON.stringify({ request, transport, budgetSeconds: remaining / 1000 }) + '\n',
    );
  } else {
    try {
      if (child.pid === undefined) throw new AuthorityCleanupUnknown();
      const transport = await observeSolverProcess(child.pid);
      remaining = deadline - performance.now();
      if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 120000)
        throw new Error('strict authority deadline expired before serialization');
      const envelope = Buffer.from(
        JSON.stringify({ request, transport, budgetSeconds: remaining / 1000 }) + '\n',
        'utf8',
      );
      if (envelope.byteLength < 1 || envelope.byteLength > 65536)
        throw new Error('strict authority initial envelope exceeds byte bound');
      if (deadline - performance.now() <= 0)
        throw new Error('strict authority deadline expired after encoding');
      if (deadline - performance.now() <= 0)
        throw new Error('strict authority deadline expired before transmission');
      transmitted = true;
      child.stdin.write(envelope);
    } catch {
      child.stdin.end();
      await Promise.all([output, errors, exited.catch(() => null)]);
      await closed;
      throw new AuthorityCleanupUnknown();
    }
    remaining = deadline - performance.now();
  }
  signal?.addEventListener('abort', requestCancellation, { once: true });
  const heartbeat = setInterval(() => {
    if (session.ready && !session.terminal && (!strict || !cancellationRequested)) send('ping');
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
  try {
    const [, , code] = await Promise.all([
      output ?? drainOutput().catch(failPipe),
      errors ?? drainErrors().catch(failPipe),
      exited.catch(() => {
        failPipe();
        return null;
      }),
    ]);
    await closed;
    if (
      session.failedRead ||
      session.timedOut ||
      session.terminal?.['cleanup'] !== 'complete' ||
      buffered !== ''
    )
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
