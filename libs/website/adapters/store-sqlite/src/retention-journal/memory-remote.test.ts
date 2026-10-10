import { expect, test } from 'bun:test';

import { MemoryJournalRemote } from './memory-remote';
import { JournalRemoteError } from './remote';

const bytesOf = (value: string): Uint8Array => new TextEncoder().encode(value);

async function remoteFault(run: () => Promise<unknown>): Promise<JournalRemoteError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(JournalRemoteError);
    return error as JournalRemoteError;
  }
  throw new Error('expected a JournalRemoteError');
}

test('puts append versions and get reads the current one', async () => {
  const remote = new MemoryJournalRemote();
  const first = await remote.put('head.json', bytesOf('1\n'));
  const second = await remote.put('head.json', bytesOf('2\n'));
  expect(second).not.toBe(first);
  expect(await remote.get('head.json')).toEqual({ bytes: bytesOf('2\n'), versionId: second });
  expect(remote.versionCount('head.json')).toBe(2);
  expect(await remote.get('events/000000000001.json')).toBeNull();
  await remote.put('events/000000000002.json', bytesOf('b\n'));
  await remote.put('events/000000000001.json', bytesOf('a\n'));
  expect(await remote.list('events/')).toEqual([
    'events/000000000001.json',
    'events/000000000002.json',
  ]);
  expect(remote.keys()).toEqual([
    'events/000000000001.json',
    'events/000000000002.json',
    'head.json',
  ]);
});

test('fault controls fire once and name the key', async () => {
  const remote = new MemoryJournalRemote();
  await remote.put('head.json', bytesOf('1\n'));
  remote.failGetOnce('head.json');
  expect((await remoteFault(() => remote.get('head.json'))).message).toContain('head.json');
  expect(await remote.get('head.json')).not.toBeNull();

  remote.failPutOnce('head.json');
  expect((await remoteFault(() => remote.put('head.json', bytesOf('2\n')))).reason).toBe(
    'unreadable',
  );
  expect(remote.versionCount('head.json')).toBe(1);

  remote.throwAfterPut('head.json');
  await remoteFault(() => remote.put('head.json', bytesOf('3\n')));
  expect(remote.current('head.json')).toEqual(bytesOf('3\n'));
  await remote.put('head.json', bytesOf('4\n'));

  remote.dropVersionId(true);
  const unversioned = await remoteFault(() => remote.put('head.json', bytesOf('5\n')));
  expect(unversioned.reason).toBe('unversioned');
  remote.dropVersionId(false);

  remote.swapBytesAfterPut('head.json', bytesOf('other\n'));
  const written = await remote.put('head.json', bytesOf('6\n'));
  const current = await remote.get('head.json');
  expect(current?.bytes).toEqual(bytesOf('other\n'));
  expect(current?.versionId).not.toBe(written);
});

test('if-none-match is honoured only when configured', async () => {
  const honouring = new MemoryJournalRemote({ honourIfNoneMatch: true });
  await honouring.put('events/000000000001.json', bytesOf('a\n'), { ifNoneMatch: true });
  const refused = await remoteFault(() =>
    honouring.put('events/000000000001.json', bytesOf('b\n'), { ifNoneMatch: true }),
  );
  expect(refused.reason).toBe('precondition_failed');

  const ignoring = new MemoryJournalRemote();
  await ignoring.put('events/000000000001.json', bytesOf('a\n'), { ifNoneMatch: true });
  await ignoring.put('events/000000000001.json', bytesOf('b\n'), { ifNoneMatch: true });
  expect(ignoring.versionCount('events/000000000001.json')).toBe(2);
});
