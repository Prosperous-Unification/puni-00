import { afterEach, beforeEach, expect, test } from 'bun:test';

import { JournalRemoteError } from './remote';
import { readS3JournalConfig, S3JournalRemote } from './s3-remote';
import { S3StandIn } from './s3-stand-in';

const bucket = 'retention-journal-test';
const prefix = 'retention-journal/website-dev/';
const dummySecret = 'dummy-secret-not-a-credential';
const bytesOf = (value: string): Uint8Array => new TextEncoder().encode(value);

let standIn: S3StandIn;
let remote: S3JournalRemote;

function environment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    S3_ENDPOINT: standIn.endpoint,
    S3_REGION: 'eu-central',
    S3_ACCESS_KEY_ID: 'DUMMYACCESSKEY',
    S3_SECRET_ACCESS_KEY: dummySecret,
    RETENTION_JOURNAL_BUCKET: bucket,
    RETENTION_JOURNAL_PREFIX: prefix,
    ...overrides,
  };
}

beforeEach(() => {
  standIn = new S3StandIn(bucket);
  remote = new S3JournalRemote(readS3JournalConfig(environment()));
});

afterEach(async () => {
  await standIn.stop();
});

async function remoteFault(run: () => Promise<unknown>): Promise<JournalRemoteError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(JournalRemoteError);
    return error as JournalRemoteError;
  }
  throw new Error('expected a JournalRemoteError');
}

test('put returns the bucket version id and get reads it back', async () => {
  const versionId = await remote.put('events/000000000001.json', bytesOf('event\n'), {
    ifNoneMatch: true,
  });
  expect(versionId).toMatch(/^stand-in-version-/u);
  expect(standIn.stored(`${prefix}events/000000000001.json`)).toEqual(bytesOf('event\n'));
  expect(await remote.get('events/000000000001.json')).toEqual({
    bytes: bytesOf('event\n'),
    versionId,
  });
  expect(await remote.get('head.json')).toBeNull();
  expect(standIn.requests.every((line) => !line.includes(dummySecret))).toBe(true);
});

test('an existing key refuses an if-none-match put', async () => {
  await remote.put('events/000000000001.json', bytesOf('a\n'), { ifNoneMatch: true });
  const error = await remoteFault(() =>
    remote.put('events/000000000001.json', bytesOf('b\n'), { ifNoneMatch: true }),
  );
  expect(error.reason).toBe('precondition_failed');
  expect(error.message).toContain('events/000000000001.json');
  expect(await remote.put('head.json', bytesOf('1\n'))).toBeString();
  expect(await remote.put('head.json', bytesOf('2\n'))).toBeString();
});

test('an unversioned bucket is refused', async () => {
  standIn.versioned = false;
  const putError = await remoteFault(() => remote.put('head.json', bytesOf('head\n')));
  expect(putError.reason).toBe('unversioned');
  expect(putError.message).toContain('head.json');
  const getError = await remoteFault(() => remote.get('head.json'));
  expect(getError.reason).toBe('unversioned');
});

test('a 5xx is a JournalRemoteError naming the key', async () => {
  await remote.put('head.json', bytesOf('head\n'));
  standIn.failingKeys.add(`${prefix}head.json`);
  const getError = await remoteFault(() => remote.get('head.json'));
  expect(getError.reason).toBe('unreadable');
  expect(getError.key).toBe('head.json');
  expect(getError.message).toContain('head.json');
  expect(getError.message).toContain('500');
  const putError = await remoteFault(() => remote.put('head.json', bytesOf('next\n')));
  expect(putError.reason).toBe('unreadable');
  expect(putError.message).toContain('head.json');
});

test('a network failure is a JournalRemoteError naming the key', async () => {
  await standIn.stop();
  const error = await remoteFault(() => remote.get('genesis.json'));
  expect(error.reason).toBe('unreadable');
  expect(error.message).toContain('genesis.json');
  expect(error.cause).toBeDefined();
});

test('list follows continuation tokens', async () => {
  standIn.pageSize = 2;
  for (const sequence of [3, 1, 5, 2, 4])
    await remote.put(
      `events/00000000000${String(sequence)}.json`,
      bytesOf(`${String(sequence)}\n`),
    );
  await remote.put('head.json', bytesOf('head\n'));
  expect(await remote.list('events/')).toEqual([
    'events/000000000001.json',
    'events/000000000002.json',
    'events/000000000003.json',
    'events/000000000004.json',
    'events/000000000005.json',
  ]);
  expect(standIn.requests.filter((line) => line.includes('continuation-token'))).toHaveLength(2);
});

test('a truncated list without a token throws', async () => {
  standIn.pageSize = 1;
  standIn.dropContinuationToken = true;
  await remote.put('events/000000000001.json', bytesOf('1\n'));
  await remote.put('events/000000000002.json', bytesOf('2\n'));
  const error = await remoteFault(() => remote.list('events/'));
  expect(error.reason).toBe('unreadable');
  expect(error.message).toContain('events/');
  expect(error.message).toContain('continuation token');
});

test('the stand-in refuses an unsigned object request', async () => {
  const response = await fetch(`${standIn.endpoint}/${bucket}/${prefix}head.json`);
  expect(response.status).toBe(403);
});

test('config parsing accepts loopback http and https', () => {
  const config = readS3JournalConfig(environment());
  expect(config).toEqual({
    endpoint: standIn.endpoint,
    region: 'eu-central',
    accessKeyId: 'DUMMYACCESSKEY',
    secretAccessKey: dummySecret,
    bucket,
    prefix,
  });
  expect(
    readS3JournalConfig(environment({ S3_ENDPOINT: 'https://hel1.your-objectstorage.com' }))
      .endpoint,
  ).toBe('https://hel1.your-objectstorage.com');
});

test('config parsing names each missing or malformed variable without echoing secrets', () => {
  const refusals: [Record<string, string | undefined>, string][] = [
    [{ S3_ENDPOINT: undefined }, 'S3_ENDPOINT'],
    [{ S3_ENDPOINT: 'http://storage.example.test' }, 'S3_ENDPOINT'],
    [{ S3_ENDPOINT: 'ftp://127.0.0.1' }, 'S3_ENDPOINT'],
    [{ S3_ENDPOINT: 'https://user:pass@storage.example.test' }, 'S3_ENDPOINT'],
    [{ S3_ENDPOINT: 'https://storage.example.test/path' }, 'S3_ENDPOINT'],
    [{ S3_REGION: '' }, 'S3_REGION'],
    [{ S3_ACCESS_KEY_ID: undefined }, 'S3_ACCESS_KEY_ID'],
    [{ S3_SECRET_ACCESS_KEY: undefined }, 'S3_SECRET_ACCESS_KEY'],
    [{ S3_SECRET_ACCESS_KEY: `${dummySecret} with space` }, 'S3_SECRET_ACCESS_KEY'],
    [{ RETENTION_JOURNAL_BUCKET: 'Upper_Case' }, 'RETENTION_JOURNAL_BUCKET'],
    [{ RETENTION_JOURNAL_PREFIX: undefined }, 'RETENTION_JOURNAL_PREFIX'],
    [{ RETENTION_JOURNAL_PREFIX: '/retention-journal/website-dev/' }, 'RETENTION_JOURNAL_PREFIX'],
    [{ RETENTION_JOURNAL_PREFIX: 'retention-journal/../website/' }, 'RETENTION_JOURNAL_PREFIX'],
    [{ RETENTION_JOURNAL_PREFIX: 'retention-journal/website-dev' }, 'RETENTION_JOURNAL_PREFIX'],
    [{ RETENTION_JOURNAL_PREFIX: 'retention-journal//website-dev/' }, 'RETENTION_JOURNAL_PREFIX'],
  ];
  for (const [overrides, variable] of refusals) {
    let message = '';
    try {
      readS3JournalConfig(environment(overrides));
    } catch (error) {
      message = (error as Error).message;
    }
    expect({ overrides, message: message.startsWith(variable) }).toEqual({
      overrides,
      message: true,
    });
    expect(message).not.toContain(dummySecret);
  }
});
