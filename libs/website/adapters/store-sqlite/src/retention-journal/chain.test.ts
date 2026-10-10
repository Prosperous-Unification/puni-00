import { expect, test } from 'bun:test';

import { type JournalPosition, readJournalTip, RetentionJournalError, verifyChain } from './chain';
import { MemoryJournalRemote } from './memory-remote';
import {
  encodeCanonical,
  encodeEvent,
  encodeGenesis,
  encodeHead,
  eventKey,
  genesisKey,
  headKey,
  type JournalEvent,
  type JournalHead,
  journalSchema,
  sealEvent,
  zeroHash,
} from './record';

const journalId = '0b6f6f0e-8f9a-4c3b-9d2e-1a2b3c4d5e6f';
const foreignJournalId = '5c1d2e3f-4a5b-4c6d-8e7f-901a2b3c4d5e';
const writer = {
  release: 'website-api-2026.10.11',
  privateRevision: 'a1b2c3d',
  process: 'cli',
} as const;
const start = 1760140800000;

function buildEvent(
  sequence: number,
  previousHash: string,
  owner = journalId,
  delay = 0,
): JournalEvent {
  return sealEvent({
    schema: journalSchema,
    journalId: owner,
    sequence,
    previousHash,
    recordedAt: start + sequence + delay,
    subject: { kind: 'software_request', id: `request-${String(sequence)}` },
    event: {
      type: 'place_hold',
      evidenceReference: `legal#hold-${String(sequence)}`,
      actor: 'dany',
    },
    writer,
  });
}

function headAt(sequence: number, hash: string, versionId = 'event-version'): JournalHead {
  const base: JournalHead = {
    schema: journalSchema,
    journalId,
    sequence,
    hash,
    writtenAt: start,
    writer,
  };
  return sequence === 0
    ? base
    : { ...base, eventKey: eventKey(sequence), eventVersionId: versionId };
}

/** A journal with events 1..length and a head on the last one. */
function journalOf(length: number): { remote: MemoryJournalRemote; events: JournalEvent[] } {
  const remote = new MemoryJournalRemote();
  remote.overwrite(
    genesisKey,
    encodeGenesis({
      schema: journalSchema,
      journalId,
      environment: 'website-dev',
      createdAt: start,
      createdBy: { release: writer.release, privateRevision: writer.privateRevision },
    }),
  );
  const events: JournalEvent[] = [];
  let previousHash = zeroHash;
  for (let sequence = 1; sequence <= length; sequence += 1) {
    const event = buildEvent(sequence, previousHash);
    remote.overwrite(eventKey(sequence), encodeEvent(event));
    events.push(event);
    previousHash = event.hash;
  }
  remote.overwrite(headKey, encodeHead(headAt(length, previousHash)));
  return { remote, events };
}

function positionAt(events: JournalEvent[], sequence: number, seen = sequence): JournalPosition {
  return {
    journalId,
    appliedSequence: sequence,
    appliedHash: sequence === 0 ? zeroHash : (events[sequence - 1]?.hash ?? zeroHash),
    headSequenceSeen: seen,
  };
}

async function refusal(run: () => Promise<unknown>): Promise<RetentionJournalError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(RetentionJournalError);
    return error as RetentionJournalError;
  }
  throw new Error('expected a RetentionJournalError');
}

async function verifyFromTip(
  remote: MemoryJournalRemote,
  position: JournalPosition,
): Promise<JournalEvent[]> {
  const tip = await readJournalTip(remote, journalId);
  return verifyChain(position, tip.head, remote);
}

test('a valid tail verifies and returns events in order', async () => {
  const { remote, events } = journalOf(4);
  const tip = await readJournalTip(remote, journalId);
  expect(tip.head.sequence).toBe(4);
  expect(tip.genesis.environment).toBe('website-dev');
  expect(tip.headVersionId).toMatch(/^memory-version-/u);
  expect(await verifyChain(positionAt(events, 1), tip.head, remote)).toEqual(events.slice(1));
  expect(await verifyChain(positionAt(events, 0), tip.head, remote)).toEqual(events);
  expect(await verifyChain(positionAt(events, 4), tip.head, remote)).toEqual([]);
});

test('a missing head is refused', async () => {
  const { remote, events } = journalOf(2);
  remote.remove(headKey);
  const error = await refusal(() => verifyFromTip(remote, positionAt(events, 0)));
  expect(error.reason).toBe('missing');
  expect(error.message).toContain(headKey);
});

test('an uninitialised journal is refused naming journal-init', async () => {
  const { remote, events } = journalOf(2);
  remote.remove(genesisKey);
  const error = await refusal(() => verifyFromTip(remote, positionAt(events, 0)));
  expect(error.reason).toBe('uninitialised');
  expect(error.message).toContain(genesisKey);
  expect(error.message).toContain('journal-init');
});

test('an unreadable remote is refused naming the key', async () => {
  const { remote, events } = journalOf(3);
  remote.failGetOnce(headKey);
  const headError = await refusal(() => verifyFromTip(remote, positionAt(events, 0)));
  expect(headError.reason).toBe('unreadable');
  expect(headError.message).toContain(headKey);
  expect(headError.cause).toBeInstanceOf(Error);

  remote.failGetOnce(eventKey(2));
  const eventError = await refusal(() => verifyFromTip(remote, positionAt(events, 0)));
  expect(eventError.reason).toBe('unreadable');
  expect(eventError.message).toContain(eventKey(2));
});

test('a malformed event is refused', async () => {
  const { remote, events } = journalOf(3);
  remote.overwrite(eventKey(2), new TextEncoder().encode('{"schema":"other"}\n'));
  const error = await refusal(() => verifyFromTip(remote, positionAt(events, 0)));
  expect(error.reason).toBe('malformed');
  expect(error.message).toContain(eventKey(2));

  const misplaced = journalOf(3);
  misplaced.remote.overwrite(eventKey(2), encodeEvent(misplaced.events[2]));
  const misplacedError = await refusal(() =>
    verifyFromTip(misplaced.remote, positionAt(misplaced.events, 0)),
  );
  expect(misplacedError.reason).toBe('malformed');
  expect(misplacedError.message).toContain(eventKey(2));
  expect(misplacedError.message).toContain('sequence 3');
});

test('a malformed head is refused', async () => {
  const { remote, events } = journalOf(1);
  remote.overwrite(headKey, encodeCanonical({ schema: journalSchema }));
  const error = await refusal(() => verifyFromTip(remote, positionAt(events, 0)));
  expect(error.reason).toBe('malformed');
  expect(error.message).toContain(headKey);
});

test('a truncated event is refused', async () => {
  const { remote, events } = journalOf(3);
  const bytes = encodeEvent(events[1]);
  remote.overwrite(eventKey(2), bytes.slice(0, bytes.length - 30));
  const error = await refusal(() => verifyFromTip(remote, positionAt(events, 0)));
  expect(error.reason).toBe('truncated');
  expect(error.message).toContain(eventKey(2));
});

test('a gapped chain is refused', async () => {
  const { remote, events } = journalOf(3);
  remote.remove(eventKey(2));
  const error = await refusal(() => verifyFromTip(remote, positionAt(events, 1)));
  expect(error.reason).toBe('gapped');
  expect(error.message).toContain(eventKey(2));
});

test('a rolled-back head is refused as stale naming both sequences', async () => {
  const { remote, events } = journalOf(3);
  remote.overwrite(headKey, encodeHead(headAt(2, events[1].hash)));
  const behindApplied = await refusal(() => verifyFromTip(remote, positionAt(events, 3)));
  expect(behindApplied.reason).toBe('stale');
  expect(behindApplied.message).toContain('head sequence 2');
  expect(behindApplied.message).toContain('applied sequence 3');

  const behindSeen = await refusal(() => verifyFromTip(remote, positionAt(events, 1, 3)));
  expect(behindSeen.reason).toBe('stale');
  expect(behindSeen.message).toContain('head sequence 2');
  expect(behindSeen.message).toContain('seen sequence 3');
});

test('a forked journal is refused', async () => {
  const rewritten = journalOf(3);
  const replacement = buildEvent(2, rewritten.events[0].hash, journalId, 99);
  rewritten.remote.overwrite(eventKey(2), encodeEvent(replacement));
  const chainError = await refusal(() =>
    verifyFromTip(rewritten.remote, positionAt(rewritten.events, 0)),
  );
  expect(chainError.reason).toBe('forked');
  expect(chainError.message).toContain(eventKey(3));

  const sameSequence = journalOf(2);
  const local = { ...positionAt(sameSequence.events, 2), appliedHash: 'b'.repeat(64) };
  const tipError = await refusal(() => verifyFromTip(sameSequence.remote, local));
  expect(tipError.reason).toBe('forked');
  expect(tipError.message).toContain('head and database disagree at sequence 2');

  const diverged = journalOf(2);
  const divergedLocal = { ...positionAt(diverged.events, 1), appliedHash: 'c'.repeat(64) };
  const previousError = await refusal(() => verifyFromTip(diverged.remote, divergedLocal));
  expect(previousError.reason).toBe('forked');
  expect(previousError.message).toContain(eventKey(2));

  const unclosed = journalOf(2);
  unclosed.remote.overwrite(headKey, encodeHead(headAt(2, 'd'.repeat(64))));
  const headError = await refusal(() =>
    verifyFromTip(unclosed.remote, positionAt(unclosed.events, 0)),
  );
  expect(headError.reason).toBe('forked');
  expect(headError.message).toContain(headKey);
});

test('a foreign journal is refused', async () => {
  const { remote, events } = journalOf(2);
  const tipError = await refusal(() => readJournalTip(remote, foreignJournalId));
  expect(tipError.reason).toBe('foreign');
  expect(tipError.message).toContain(genesisKey);

  const tip = await readJournalTip(remote, journalId);
  const positionError = await refusal(() =>
    verifyChain({ ...positionAt(events, 0), journalId: foreignJournalId }, tip.head, remote),
  );
  expect(positionError.reason).toBe('foreign');
  expect(positionError.message).toContain(headKey);

  const foreignHead = journalOf(1);
  foreignHead.remote.overwrite(
    headKey,
    encodeHead({ ...headAt(0, zeroHash), journalId: foreignJournalId }),
  );
  const headError = await refusal(() => readJournalTip(foreignHead.remote, journalId));
  expect(headError.reason).toBe('foreign');
  expect(headError.message).toContain(headKey);

  const foreignEvent = journalOf(2);
  const stranger = buildEvent(2, foreignEvent.events[0].hash, foreignJournalId);
  foreignEvent.remote.overwrite(eventKey(2), encodeEvent(stranger));
  const eventError = await refusal(() =>
    verifyFromTip(foreignEvent.remote, positionAt(foreignEvent.events, 0)),
  );
  expect(eventError.reason).toBe('foreign');
  expect(eventError.message).toContain(eventKey(2));
});
