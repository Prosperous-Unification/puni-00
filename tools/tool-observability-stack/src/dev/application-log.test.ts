import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  createApplicationLogCollector,
  encodeApplicationLogs,
  parseApplicationLogs,
} from './application-log';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});
const now = Date.now();
const containerId = 'd'.repeat(64);
const source = { containerId, since: now - 1000, until: now };
const record = {
  service: 'mcp-01',
  time: now - 100,
  level: 'info',
  msg: 'token=not-a-real-credential',
  event: 'request',
  method: 'GET',
  path: '/health',
  status: 200,
  grant_type: 'refresh_token',
  authorization: 'Bearer should-never-export',
};

test('supported real producer identity and absent revision stay explicit; arbitrary attributes stay out of OTLP attributes', () => {
  const parsed = parseApplicationLogs(JSON.stringify(record), source);
  expect(parsed.state).toBe('complete');
  expect(parsed.records.length).toBe(1);
  const encoded = encodeApplicationLogs(parsed.records, containerId);
  expect(JSON.stringify(encoded)).not.toContain('Bearer should-never-export');
  expect(JSON.stringify(encoded)).not.toContain('puni.target.revision');
  expect(encoded.resourceLogs[0].resource.attributes).toContainEqual({
    key: 'service.name',
    value: { stringValue: 'mcp-01' },
  });
  const log = encoded.resourceLogs[0].scopeLogs[0].logRecords[0];
  expect(log.body.stringValue).toContain('token=not-a-real-credential');
  expect(JSON.stringify(log.attributes)).not.toContain('not-a-real-credential');
  expect(JSON.stringify(log.attributes)).toContain('not-emitted');
});

test('plain text, malformed supported records and wrong producer remain bounded visible outcomes', () => {
  const parsed = parseApplicationLogs(
    [
      'plain startup',
      '{broken',
      JSON.stringify({ ...record, time: 'bad' }),
      JSON.stringify({ ...record, service: 'production' }),
      JSON.stringify(record),
    ].join('\n'),
    source,
  );
  expect(parsed.state).toBe('incomplete');
  expect(parsed.unsupported).toBe(1);
  expect(parsed.invalid).toBe(3);
  expect(parsed.records.length).toBe(1);
});

test.each([{ time: now + 1 }, { time: now - 1001 }, { level: 'foreign' }, { service: 'be-01' }])(
  'invalid supported record is not published %j',
  (fault) => {
    expect(
      parseApplicationLogs(JSON.stringify({ ...record, ...fault }), source).records.length,
    ).toBe(0);
  },
);

test('tail and byte caps are explicit incomplete evidence', () => {
  expect(
    parseApplicationLogs(Array.from({ length: 1000 }, () => 'x').join('\n'), source).truncated,
  ).toBe(true);
  expect(parseApplicationLogs('x'.repeat(32769), source).truncated).toBe(true);
});

function executable(fault: 'none' | 'identity' | 'exit' | 'recreate') {
  const directory = mkdtempSync(join(tmpdir(), 'puni-log-source-'));
  directories.push(directory);
  const path = join(directory, 'ssh');
  const inspected = [
    {
      Id: containerId,
      Name: '/wbs-dev-src',
      State: { Running: true },
      Mounts: [{ Type: 'bind', Source: '/home/puni1/wbs-dev/src', Destination: '/src' }],
      NetworkSettings: { Networks: { 'wbs-dev-net': {} } },
      Config: { WorkingDir: '/src', Cmd: ['bun', 'run', 'dev'] },
    },
  ];
  if (fault === 'identity') inspected[0].Name = '/production';
  writeFileSync(
    path,
    `#!/usr/bin/env bun\nconst args=Bun.argv.slice(2);\nif(args.includes('inspect')) console.log(${JSON.stringify(JSON.stringify(inspected))});\nelse { if(${JSON.stringify(fault)}==='exit')process.exit(1); if(!args.includes(${JSON.stringify(containerId)}))throw new Error('not pinned'); if(args.includes('wbs-dev-src'))throw new Error('read by name'); console.log(${JSON.stringify(JSON.stringify(record))}); }\n`,
  );
  chmodSync(path, 0o700);
  return path;
}

test('actual fixed SSH fixture reads only inspected Docker ID even after named-container recreation', async () => {
  const batches: unknown[] = [];
  const collector = createApplicationLogCollector({
    sshExecutable: executable('recreate'),
    publish: (records, id) => {
      batches.push(encodeApplicationLogs(records, id));
      return Promise.resolve({ state: 'acknowledged' });
    },
  });
  const collected = await collector.collect(new AbortController().signal);
  expect(collected.state).toBe('complete');
  expect(collected.containerId).toBe(containerId);
  expect(collected.accepted).toBe(1);
  expect(batches.length).toBe(1);
});

test('actual source refuses foreign identity before publishing and distinguishes source failure', async () => {
  let published = false;
  for (const fault of ['identity', 'exit'] as const) {
    const collector = createApplicationLogCollector({
      sshExecutable: executable(fault),
      publish: () => {
        published = true;
        return Promise.resolve({ state: 'acknowledged' });
      },
    });
    expect((await collector.collect(new AbortController().signal)).state).toBe('unavailable');
  }
  expect(published).toBe(false);
});

test('publication failure is independent and does not advance the log checkpoint', async () => {
  let attempts = 0;
  const collector = createApplicationLogCollector({
    sshExecutable: executable('none'),
    publish: () =>
      Promise.resolve(
        ++attempts === 1
          ? { state: 'failed', reason: 'fixture-outage' }
          : { state: 'acknowledged' },
      ),
  });
  expect((await collector.collect(new AbortController().signal)).reason).toBe('publication-failed');
  expect((await collector.collect(new AbortController().signal)).accepted).toBe(1);
});

test.each([{ containerId: 'bad' }, { since: now + 1 }, { since: now - 120001 }])(
  'invalid trusted log window throws %j',
  (fault) => {
    expect(() => parseApplicationLogs(JSON.stringify(record), { ...source, ...fault })).toThrow();
  },
);

test('invalid source container ID cannot be encoded', () => {
  expect(() => encodeApplicationLogs([], 'wbs-dev-src')).toThrow();
});
