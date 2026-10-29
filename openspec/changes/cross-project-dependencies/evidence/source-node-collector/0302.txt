import { createHash, randomUUID } from 'node:crypto';

import type { FinalizedParticipantRestorationContext } from './dependency-participant-preparation';
import { checkDeadline } from './dependency-product-process';
import type { HostMember } from './dependency-product-validation';
import { decodePasses, updateReceiptHash } from './dependency-product-validation';
import { ownerDockerHashed } from './edge-ownership';
import { SOURCE_NODE_LAUNCHER } from './source-inner-program';

interface ExecSession {
  readonly pid: string;
  readonly ticks: string;
  readonly group: string;
  readonly sid: string;
}

async function runSession(
  context: FinalizedParticipantRestorationContext,
  id: string,
  arguments_: readonly string[],
  deadline: number,
  mode: 'observe' | 'cleanup',
  roster?: readonly HostMember[],
): Promise<{
  readonly session: ExecSession | null;
  readonly frames: readonly (readonly string[])[];
  readonly failure: unknown;
}> {
  checkDeadline(deadline, 15000);
  const nonce = randomUUID();
  let session: ExecSession | null = null;
  let tag: string | null = null;
  let fields: string[] = [];
  let done = false;
  let reaped = false;
  const receiptHash = createHash('sha256');
  // Proof: source-complete-reap group; REAPED lost at the consumer dependency. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
  const isComplete = () => tag === null && done && reaped;
  const frames: string[][] = [];
  const arity: Readonly<Record<string, number>> = {
    SESSION: 5,
    PASS: 1,
    PROC: 11,
    FD: 3,
    SELF: 3,
    TCP: 2,
    ADDR: 1,
    MEMBER: 3,
    DONE: 2,
    REAPED: 1,
  };
  const consume = (token: string): boolean => {
    // Proof: source-receipt-bound group; oversized SESSION token. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
    if (Buffer.byteLength(token) > 4 * 1024 * 1024 || frames.length > 40000)
      throw new Error('source receipt bound exceeded');
    updateReceiptHash(receiptHash, token);
    if (tag === null) {
      // Proof: source-tag-boundary group; unknown raw tag. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
      if (!Object.hasOwn(arity, token) || (done && token !== 'REAPED'))
        throw new Error('source receipt tag unsupported');
      tag = token;
      fields = [];
      return false;
    }
    fields.push(token);
    if (fields.length < arity[tag]) return false;
    const frame = tag;
    tag = null;
    if (frame === 'SESSION') {
      const [attempt, pid, group, sid, ticks] = fields;
      // Proof: source-session-tuple group; foreign SESSION nonce. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
      if (
        session !== null ||
        frames.length !== 0 ||
        attempt !== nonce ||
        !/^[1-9][0-9]*$/.test(pid) ||
        group !== pid ||
        sid !== pid ||
        !/^[1-9][0-9]*$/.test(ticks)
      )
        throw new Error('source private session malformed');
      session = { pid, ticks, group, sid };
      return false;
    }
    // Proof: source-session-before-ack group; absent SESSION with later ACK. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
    if (session === null) throw new Error('source receipt lacks private session');
    if (frame === 'DONE') {
      // Proof: source-done group; DONE pass count1. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
      if (
        done ||
        fields[0] !== nonce ||
        (mode === 'observe'
          ? fields[1] !== '2'
          : !/^[0-9]+$/.test(fields[1]) || Number(fields[1]) > 10000)
      )
        throw new Error('source completion malformed');
      if (mode === 'observe') {
        // Proof: source-before-ack-join group; missing modeled MCP process. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
        if (roster === undefined) throw new Error('source expected process roster absent');
        decodePasses(frames, roster);
      }
      done = true;
      return true;
    }
    if (frame === 'REAPED') {
      // Proof: source-reap-frame group; foreign REAPED nonce. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
      if (!done || reaped || fields[0] !== nonce) throw new Error('source reap malformed');
      reaped = true;
      return false;
    }
    // Proof: source-mode-frame group; observe-mode MEMBER. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
    if (done || (mode === 'observe') === (frame === 'MEMBER'))
      throw new Error('source receipt frame unsupported');
    frames.push([frame, ...fields]);
    return false;
  };
  const controller = new AbortController();
  const timer = setTimeout(
    () => {
      controller.abort();
    },
    Math.min(15000, deadline - performance.now() - 10000),
  );
  try {
    const args = [
      '--host',
      'unix:///var/run/docker.sock',
      'exec',
      '-i',
      '--user',
      // Proof: fixed-source-command group; UID0 command dispatch. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
      '1000:1000',
      '--workdir',
      '/',
      id,
      '/usr/bin/env',
      '-i',
      'PATH=/usr/local/bin:/usr/bin:/bin',
      'LC_ALL=C',
      '/usr/local/bin/node',
      '-e',
      SOURCE_NODE_LAUNCHER,
      '--',
      nonce,
      mode,
      ...arguments_,
    ];
    const audit = ownerDockerHashed(
      context.owner,
      context.layouts.prod,
      async (_command, signal) => {
        await context.ports.execDocker(args, nonce, consume, signal);
        if (signal?.aborted || !isComplete())
          throw new Error('source receipt complete/reap absent');
        return JSON.stringify({
          nonce,
          session,
          done,
          reaped,
          receiptSha256: receiptHash.digest('hex'),
        });
      },
    );
    await audit(
      ['exec', 'source-process-observer', 'unix:///var/run/docker.sock', id, nonce, mode],
      controller.signal,
    );
    if (controller.signal.aborted || !isComplete())
      throw new Error('source receipt complete/reap absent');
    return { session, frames, failure: null };
  } catch (cause) {
    return { session, frames, failure: cause };
  } finally {
    clearTimeout(timer);
  }
}

async function verifySessionCleared(
  context: FinalizedParticipantRestorationContext,
  id: string,
  session: ExecSession,
): Promise<void> {
  const receipt = await runSession(
    context,
    id,
    [session.pid, session.group, session.sid, session.ticks],
    context.deadline,
    'cleanup',
  );
  // Proof: source-empty-census group; nonempty raw cleanup census. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
  if (receipt.failure !== null || receipt.session === null || receipt.frames.length !== 0)
    throw new Error('source observer group remains');
}

/** Collects both bounded raw inner passes and verifies the exact helper group is gone; throws unless transport and cleanup are proved. */
export async function observeSourceInner(
  context: FinalizedParticipantRestorationContext,
  id: string,
  roster: readonly HostMember[],
): Promise<readonly (readonly string[])[]> {
  const receipt = await runSession(
    context,
    id,
    roster.map((member) => String(member.namespacePid)),
    context.deadline - 20000,
    'observe',
    roster,
  );
  if (receipt.session === null) throw new Error('source observer creation or session unproved');
  try {
    await verifySessionCleared(context, id, receipt.session);
  } catch {
    throw new Error('source observer cleanup unproved');
  }
  // Proof: source-transport-failure group; bad DONE error after valid passes. source original context dispatches the complete fixed Node command failed with this group omitted and passed after exact restoration.
  if (receipt.failure !== null) throw new Error('source observer receipt refused');
  return receipt.frames;
}
