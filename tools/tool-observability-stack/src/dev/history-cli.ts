import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

import { type } from 'arktype';

import { parseCheckpoint } from './checkpoint';
import {
  captureHistory,
  HistoryReadFault,
  type HistoryRoutes,
  readHistoryReceipt,
  verifyHistory,
} from './history-provider';
import { parseTransportBinding, type TransportEndpoint } from './transport';

const Route = type({ '+': 'reject', kind: "'loopback'", url: 'string' }).or({
  '+': 'reject',
  kind: "'binding-file'",
  path: 'string',
});
const Request = type({
  '+': 'reject',
  version: '1',
  checkpointPath: 'string',
  elastic: Route,
  prometheus: Route,
});
/** Regular private trusted input; bounded reads distinguish missing, unreadable, oversized and malformed state. */
export function readPrivate(path: string): Buffer {
  let descriptor: number;
  try {
    // Proof: removing O_NOFOLLOW made trusted request symlink follow another file and successfully capture.
    // Proof: without O_NONBLOCK the actual FIFO test hit its controlled2s child deadline before descriptor validation; this permits prompt nonregular refusal.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    // Proof: removing this contextual category made trusted request-missing lose its distinct absent diagnostic.
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw new Error('history-file-absent', { cause: error });
    // Proof: removing this contextual category made trusted request-unreadable lose its distinct unreadable diagnostic.
    if (
      error instanceof Error &&
      'code' in error &&
      ['EACCES', 'EPERM', 'ELOOP'].includes(String(error.code))
    )
      throw new Error('history-file-unreadable', { cause: error });
    throw error;
  }
  try {
    const metadata = fstatSync(descriptor);
    // Proof: removing this guard made trusted request-public accept group/world-readable state; mode-zero inputs independently refuse.
    if (
      !metadata.isFile() ||
      (metadata.mode & 0o444) === 0 ||
      (metadata.mode & 0o077) !== 0 ||
      metadata.uid !== process.getuid?.()
    )
      throw new Error('history-file-unreadable'); // guard: private
    // Proof: removing both file-size checks made trusted request-big accept valid JSON padded past262144 bytes.
    if (metadata.size > 262144) throw new Error('history-file-size'); // guard: file-size
    const bytes = Buffer.alloc(262145);
    let count = 0;
    while (count < bytes.length) {
      const length = readSync(descriptor, bytes, count, bytes.length - count, null);
      if (length === 0) break;
      count += length;
    }
    // Proof: the trusted request-big fault removed both metadata and streaming bounds before accepting padded JSON.
    if (count > 262144) throw new Error('history-file-size');
    return bytes.subarray(0, count);
  } finally {
    closeSync(descriptor);
  }
}
export function decode(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    // Proof: removing this context made trusted request-malformed lose its distinct redacted malformed diagnostic.
    if (error instanceof SyntaxError) {
      // eslint-disable-next-line preserve-caught-error -- Trusted JSON may contain credentials; retain only its exception class and emit fixed CLI diagnostics.
      throw new Error('history-file-malformed', { cause: error.name });
    }
    throw error;
  }
}
function resolveRoute(route: typeof Route.infer): TransportEndpoint {
  if (route.kind === 'loopback') return route.url;
  // Proof: deterministic binding pathname substitution retains these checked bytes; the former reopen consumed public replacement credentials and failed authentication.
  return parseTransportBinding(decode(readPrivate(route.path)));
}
/** Publishes a new owner-private receipt exclusively, syncing both file and containing directory. */
export function publish(path: string, wire: unknown): void {
  const bytes = `${JSON.stringify(wire)}\n`;
  // Proof: removing this guard made receipt encoding size publish an oversized receipt under the injected serializer fault.
  if (Buffer.byteLength(bytes) > 262144) throw new Error('history-output-size');
  // Proof: changing wx to w made simultaneous captures both succeed against one receipt, overwriting an operation.
  const descriptor = openSync(path, 'wx', 0o600); // guard: exclusive
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const directory = openSync(dirname(path), 'r');
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}
function availableOutput(path: string): void {
  try {
    lstatSync(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  // Proof: bypassing this refusal made trusted occupied reach wx and lose its fixed occupied diagnostic; earlier bytes stayed intact.
  throw new Error('history-output-occupied');
}
/** Actual runtime CLI boundary; never reads current checkpoints during historical verification. */
export async function runHistoryCli(args: string[]): Promise<void> {
  const [operation, requestPath, receiptPath, expectedDigest, verificationPath] = args;
  try {
    // Proof: removing this guard made trusted extra-arguments perform a successful capture with an ignored operand.
    if (
      (operation !== 'history-capture' && operation !== 'history-verify') ||
      args.length !== (operation === 'history-capture' ? 3 : 5)
    )
      throw new Error('history-arguments'); // guard: arity
    const request = Request(decode(readPrivate(requestPath)));
    // Proof: bypassing Request validation made request unknown fields accept an unconsumed field.
    if (request instanceof type.errors) throw new Error('history-request'); // guard: request
    const routes: HistoryRoutes = {
      elastic: resolveRoute(request.elastic),
      prometheus: resolveRoute(request.prometheus),
    };
    if (operation === 'history-capture') {
      availableOutput(receiptPath);
      // Proof: deterministic checkpoint pathname substitution made the former reopen capture a replacement observation from public unchecked bytes; this retains the original identity.
      const previous = parseCheckpoint(readPrivate(request.checkpointPath).toString('utf8'));
      // Proof: removing this refusal made the empty-checkpoint test lose its explicit empty-state diagnostic.
      if (previous === undefined) throw new Error('history-checkpoint-empty');
      publish(receiptPath, await captureHistory(routes, previous));
      console.log(JSON.stringify({ state: 'complete', authority: 'evidence-only' }));
    } else {
      const bytes = readPrivate(receiptPath);
      const receiptSha256 = createHash('sha256').update(bytes).digest('hex');
      // Proof: removing this guard made trusted digest verify with a wrong expected SHA256.
      if (!/^[a-f0-9]{64}$/.test(expectedDigest) || receiptSha256 !== expectedDigest)
        throw new Error('history-digest'); // guard: digest
      const receipt = readHistoryReceipt(decode(bytes));
      availableOutput(verificationPath);
      let state: 'complete' | 'unavailable' = 'complete';
      try {
        await verifyHistory(routes, receipt);
      } catch (error) {
        // Boundary: bounded backend and stored-record failures are explicit unavailable history, never empty success.
        // Proof: removing this distinction made authenticated history publish an outcome for invalid authority; boundary-only proof.
        if (!(error instanceof HistoryReadFault)) throw error;
        state = 'unavailable';
      }
      publish(verificationPath, {
        version: 1,
        operationId: randomUUID(),
        receiptSha256,
        verifiedAt: Date.now(),
        state,
        ...(state === 'unavailable' ? { reason: 'stored-evidence-unavailable-or-changed' } : {}),
        authority: 'evidence-only',
      });
      console.log(JSON.stringify({ state, receiptSha256, authority: 'evidence-only' }));
      if (state !== 'complete') process.exitCode = 1;
    }
  } catch (error) {
    // Boundary: all trusted/provider failures are thrown with fixed redacted diagnostics; never print raw errors or input paths.
    const category =
      error instanceof Error && /^history-[a-z-]+$/.test(error.message)
        ? error.message
        : 'history-operation-failed';
    // Proof: printing the raw error instead exposed the synthetic marker in trusted checkpoint-malformed; restored output is fixed.
    console.error(category);
    process.exitCode = 1;
  }
}
