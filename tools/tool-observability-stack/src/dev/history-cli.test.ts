import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { captureHistory, readHistoryReceipt, verifyHistory } from './history-provider';
import type { ProbeObservation } from './probe';
import type { VerifiedEndpoint } from './transport';

const roots: string[] = [];
const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) void server.stop(true);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const cli = new URL('./runtime-cli.ts', import.meta.url).pathname;
const secret = 'SECRET_BODY_LABEL_MARKER';
function fixture(authenticated = false, ageMs = 30000, mtls = false) {
  const root = mkdtempSync(join(tmpdir(), 'history-'));
  roots.push(root);
  const observedAt = Date.now() - ageMs;
  const scrape = Math.floor((observedAt + 5000) / 1000);
  const observation = {
    source: { kind: 'ssh-dev-container', containerValidated: true, containerId: 'd'.repeat(64) },
    observationId: 'retained-observation',
    traceId: '1'.repeat(32),
    parentSpanId: '2'.repeat(16),
    childSpanId: '3'.repeat(16),
    environment: 'dev',
    service: 'be-01',
    producerVersion: 'fixture',
    revision: 'a'.repeat(40),
    success: true,
    reason: null,
    startedAt: observedAt - 20,
    finishedAt: observedAt,
    observedAt,
    requestStartedAt: observedAt - 10,
    requestFinishedAt: observedAt,
    requestDurationMs: 10,
    transportDurationMs: 20,
    publication: { state: 'acknowledged' },
  };
  function document(kind: 'log' | 'root' | 'child') {
    return {
      '@timestamp': String(observedAt - (kind === 'log' ? 0 : 10)),
      resource: {
        attributes: {
          'deployment.environment.name': 'dev',
          'service.name': 'puni-dev-probe',
          secret,
        },
      },
      attributes: {
        'puni.target.environment': 'dev',
        'puni.target.service': 'be-01',
        'puni.target.revision': observation.revision,
        'puni.observation.id': observation.observationId,
        'puni.observation.timestamp_ms': observedAt,
        'puni.source.kind': 'ssh-dev-container',
        'puni.target.container': 'wbs-dev-src',
        'puni.target.container.id': observation.source.containerId,
        'puni.target.mount.source': '/home/puni1/wbs-dev/src',
        'puni.probe.success': true,
        secret,
        ...(kind === 'root' ? { 'transaction.root': true } : {}),
      },
      trace_id: observation.traceId,
      span_id: kind === 'child' ? observation.childSpanId : observation.parentSpanId,
      ...(kind === 'log'
        ? { body: { text: 'dev health observation', secret } }
        : {
            name: kind === 'root' ? 'dev health observation' : 'GET be-01 /health',
            kind: kind === 'root' ? 'Internal' : 'Client',
            status: { code: 'Ok' },
            ...(kind === 'child' ? { parent_span_id: observation.parentSpanId } : {}),
          }),
    };
  }
  const logs = [
    {
      _index: '.ds-logs-generic.otel-dev-2026.10.31-000001',
      _id: 'log-1',
      _source: document('log'),
    },
  ];
  const traces = ['root', 'child'].map((kind) => ({
    _index: '.ds-traces-generic.otel-dev-2026.10.31-000001',
    _id: kind,
    _source: document(kind as 'root' | 'child'),
  }));
  const metrics = [
    {
      metric: {
        __name__: 'puni_dev_probe_observed_timestamp_seconds',
        environment: 'dev',
        service: 'be-01',
        secret,
      },
      values: [[scrape, String(observedAt / 1000)]],
    },
    {
      metric: {
        __name__: 'puni_dev_revision_info',
        environment: 'dev',
        service: 'be-01',
        revision: observation.revision,
        secret,
      },
      values: [[scrape, '1']],
    },
    {
      metric: { __name__: 'puni_dev_probe_success', environment: 'dev', service: 'be-01', secret },
      values: [[scrape, '1']],
    },
  ];
  const faults = { kind: '', status: 200, delay: 0, password: secret, authority: true };
  let metricReads = 0;
  let clockPath: string | undefined;
  let tls:
    | {
        cert: string;
        key: string;
        ca?: string;
        requestCert?: boolean;
        rejectUnauthorized?: boolean;
      }
    | undefined;
  const clients: { cert: string; key: string }[] = [];
  if (authenticated) {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-keyout',
        join(root, 'server.key'),
        '-out',
        join(root, 'server.crt'),
        '-subj',
        '/CN=history.test',
        '-addext',
        'subjectAltName=DNS:history.test',
        '-addext',
        'basicConstraints=critical,CA:TRUE',
        '-days',
        '1',
      ],
      { stdio: 'pipe' },
    );
    tls = {
      cert: readFileSync(join(root, 'server.crt'), 'utf8'),
      key: readFileSync(join(root, 'server.key'), 'utf8'),
    };
  }
  if (mtls && tls !== undefined) {
    for (const ordinal of [0, 1]) {
      execFileSync(
        'openssl',
        [
          'req',
          '-new',
          '-newkey',
          'ec',
          '-pkeyopt',
          'ec_paramgen_curve:prime256v1',
          '-nodes',
          '-keyout',
          join(root, `client${String(ordinal)}.key`),
          '-out',
          join(root, `client${String(ordinal)}.csr`),
          '-subj',
          '/CN=reader',
        ],
        { stdio: 'pipe' },
      );
      execFileSync(
        'openssl',
        [
          'x509',
          '-req',
          '-in',
          join(root, `client${String(ordinal)}.csr`),
          '-CA',
          join(root, 'server.crt'),
          '-CAkey',
          join(root, 'server.key'),
          '-CAcreateserial',
          '-out',
          join(root, `client${String(ordinal)}.crt`),
          '-days',
          '1',
        ],
        { stdio: 'pipe' },
      );
      clients.push({
        cert: readFileSync(join(root, `client${String(ordinal)}.crt`), 'utf8'),
        key: readFileSync(join(root, `client${String(ordinal)}.key`), 'utf8'),
      });
    }
    Object.assign(tls, { ca: tls.cert, requestCert: true, rejectUnauthorized: true });
  }
  const queries: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    ...(tls === undefined ? {} : { tls }),
    async fetch(request) {
      const url = new URL(request.url);
      queries.push(url.pathname + url.search);
      if (faults.delay) await Bun.sleep(faults.delay);
      if (
        authenticated &&
        !mtls &&
        request.headers.get('Authorization') !==
          `Basic ${Buffer.from(`reader:${faults.password}`).toString('base64')}`
      )
        return new Response(secret, { status: 401 });
      if (url.pathname === '/_security/user/_privileges')
        return Response.json({
          cluster: faults.authority ? [] : ['all'],
          global: [],
          applications: [],
          run_as: [],
          indices: [
            {
              names: ['logs-*.otel-dev', 'traces-*.otel-dev'],
              privileges: ['read'],
              allow_restricted_indices: false,
            },
          ],
        });
      if (faults.kind === 'malformed') return new Response(secret);
      if (url.pathname === '/api/v1/query') {
        metricReads++;
        if (faults.kind === 'second-revision' && metricReads > 1)
          metrics[1].metric.revision = 'f'.repeat(40);
        if (faults.kind === 'second-identity' && metricReads > 1)
          metrics[0].metric.service = 'foreign';
        if (faults.kind === 'second-samples' && metricReads > 1)
          for (let ordinal = 1; ordinal <= 510; ordinal++)
            metrics[0].values.push([scrape - ordinal / 1000, '0']);
        if (faults.kind === 'second-wrong-gauge' && metricReads > 1) metrics[0].values[0][1] = '0';
        const cutoff = Number(url.searchParams.get('time'));
        if (faults.kind === 'query-cutoff' && metricReads === 1)
          for (const series of metrics) series.values[0][0] = cutoff;
        const returned =
          faults.kind === 'query-cutoff'
            ? metrics.map((series) => ({
                ...series,
                values: series.values.filter(([time]) => Number(time) <= cutoff),
              }))
            : metrics;
        return Response.json(
          {
            status: 'success',
            ...(faults.kind === 'warning' ? { warnings: [secret] } : {}),
            ...(faults.kind === 'oversize' ? { padding: ' '.repeat(1048577) } : {}),
            data: { resultType: 'matrix', result: returned },
          },
          { status: faults.status },
        );
      }
      const hits = url.pathname.includes('logs-') ? logs : traces;
      // Actual exact-document queries must name the original physical index and ID.
      const body = (await request.json()) as {
        query?: {
          ids?: { values: string[] };
          bool?: { filter: { term: Record<string, string> }[] };
        };
      };
      const requestedReplacement =
        body.query?.bool?.filter.some(
          (filter) => filter.term['attributes.puni.observation.id'] === 'replacement-observation',
        ) === true;
      const scopedHits = requestedReplacement
        ? hits.map((hit) => ({
            ...hit,
            _id: `${hit._id}-replacement`,
            _source: {
              ...hit._source,
              attributes: {
                ...hit._source.attributes,
                'puni.observation.id': 'replacement-observation',
              },
            },
          }))
        : hits;
      const selected =
        body.query?.ids === undefined
          ? scopedHits
          : scopedHits.filter((hit) => body.query?.ids?.values.includes(hit._id));
      return Response.json(
        {
          timed_out: faults.kind === 'partial',
          _shards: { failed: 0 },
          hits: { total: { value: selected.length, relation: 'eq' }, hits: selected },
        },
        { status: faults.status },
      );
    },
  });
  servers.push(server);
  const endpoint = `${authenticated ? 'https' : 'http'}://127.0.0.1:${String(server.port)}`;
  const requestPath = join(root, 'request.json'),
    receiptPath = join(root, 'receipt.json'),
    checkpointPath = join(root, 'checkpoint.json'),
    verificationPath = join(root, 'verification.json');
  const request = {
    version: 1,
    checkpointPath,
    elastic: { kind: 'loopback', url: endpoint },
    prometheus: { kind: 'loopback', url: endpoint },
  };
  const save = (path: string, value: unknown) => {
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  };
  const bindingPath = join(root, 'binding.json');
  const binding: VerifiedEndpoint = {
    url: endpoint,
    serverName: 'history.test',
    ca: tls?.cert ?? '',
    authentication: mtls
      ? { kind: 'mtls', ...clients[0] }
      : { kind: 'basic', username: 'reader', password: faults.password },
  };
  if (authenticated) {
    save(bindingPath, binding);
    Object.assign(request, {
      elastic: { kind: 'binding-file', path: bindingPath },
      prometheus: { kind: 'binding-file', path: bindingPath },
    });
  }
  save(requestPath, request);
  save(checkpointPath, observation);
  async function run(...args: string[]) {
    const process_ = Bun.spawn(
      [
        process.execPath,
        ...(clockPath === undefined ? [] : ['--preload', clockPath]),
        cli,
        ...args,
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(process_.stdout).text(),
      new Response(process_.stderr).text(),
      process_.exited,
    ]);
    expect(stdout + stderr).not.toContain(secret);
    return { stdout, stderr, exit };
  }
  const capture = () => run('history-capture', requestPath, receiptPath);
  const digest = () => createHash('sha256').update(readFileSync(receiptPath)).digest('hex');
  const verify = (hash = digest()) =>
    run('history-verify', requestPath, receiptPath, hash, verificationPath);
  return {
    preload(text: string) {
      clockPath = join(root, 'preload.ts');
      writeFileSync(clockPath, text);
    },
    age() {
      clockPath = join(root, 'clock.ts');
      writeFileSync(
        clockPath,
        'const original = Date.now; Date.now = () => original() + 86400000;',
      );
    },
    binding,
    clients,
    bindingPath,
    root,
    observedAt,
    scrape,
    observation,
    logs,
    traces,
    metrics,
    faults,
    queries,
    request,
    requestPath,
    receiptPath,
    checkpointPath,
    verificationPath,
    save,
    run,
    capture,
    digest,
    verify,
  };
}

test('runtime CLI captures actual records and verifies aged history without reading a newer checkpoint', async () => {
  const f = fixture();
  const captured = await f.capture();
  expect(captured.exit).toBe(0);
  expect(JSON.parse(captured.stdout) as unknown).toEqual({
    state: 'complete',
    authority: 'evidence-only',
  });
  const bytes = readFileSync(f.receiptPath, 'utf8');
  expect(bytes).not.toContain(secret);
  expect(statSync(f.receiptPath).mode & 0o777).toBe(0o600);
  // A newer corrupt checkpoint cannot replace the frozen observation.
  writeFileSync(f.checkpointPath, secret);
  const receipt = JSON.parse(bytes) as { observation: { capturedAt: number }; provider: unknown };
  expect(receipt.observation.capturedAt).toBeGreaterThan(f.observedAt);
  f.age();
  const verified = await f.verify();
  expect(verified.exit).toBe(0);
  expect(readFileSync(f.receiptPath, 'utf8')).toBe(bytes);
  const outcome = JSON.parse(readFileSync(f.verificationPath, 'utf8')) as {
    state: string;
    receiptSha256: string;
    authority: string;
  };
  expect(outcome).toMatchObject({
    state: 'complete',
    receiptSha256: f.digest(),
    authority: 'evidence-only',
  });
  const evidenceDirectory = process.env['TASK77_EVIDENCE_DIRECTORY'];
  if (evidenceDirectory !== undefined) {
    for (const [name, path] of [
      ['request.json', f.requestPath],
      ['receipt.json', f.receiptPath],
      ['verification.json', f.verificationPath],
    ])
      writeFileSync(join(evidenceDirectory, name), readFileSync(path), { mode: 0o600 });
    writeFileSync(
      join(evidenceDirectory, 'operation-stdout.json'),
      JSON.stringify({
        capture: captured,
        verify: verified,
        digest: f.digest(),
        historicalClockOffsetMs: 86400000,
        queries: f.queries,
      }) + '\n',
      { mode: 0o600 },
    );
  }
  expect(
    f.queries
      .filter((query) => query.includes('/api/v1/query'))
      .every((query) => !query.includes('query_range')),
  ).toBe(true);
});

test.each([
  'record-missing',
  'record-changed',
  'trace-time',
  'sample-missing',
  'sample-changed',
  'trace',
  'identity',
  'namespace',
  'duplicate',
  'partial',
  'warning',
  'malformed',
  'oversize',
  'status',
])('historical %s refuses complete and keeps original receipt', async (fault) => {
  const f = fixture();
  expect((await f.capture()).exit).toBe(0);
  const before = readFileSync(f.receiptPath, 'utf8');
  if (fault === 'record-missing') f.logs.length = 0;
  else if (fault === 'record-changed') f.logs[0]._source['@timestamp'] = String(f.observedAt - 1);
  else if (fault === 'trace-time') f.traces[0]._source['@timestamp'] = String(f.observedAt - 9);
  else if (fault === 'sample-missing') f.metrics[0].values.length = 0;
  else if (fault === 'sample-changed') f.metrics[0].values[0][1] = '0';
  else if (fault === 'trace') f.traces[1]._source.trace_id = 'f'.repeat(32);
  else if (fault === 'identity')
    f.logs[0]._source.attributes['puni.target.revision'] = 'b'.repeat(40);
  else if (fault === 'namespace') f.logs[0]._index = '.ds-logs-generic.otel-prod-2026.10.31-000001';
  else if (fault === 'duplicate') f.logs.push(f.logs[0]);
  else if (fault === 'status') f.faults.status = 503;
  else f.faults.kind = fault;
  expect((await f.verify()).exit).not.toBe(0);
  expect(readFileSync(f.receiptPath, 'utf8')).toBe(before);
  expect(JSON.parse(readFileSync(f.verificationPath, 'utf8')) as unknown).toMatchObject({
    state: 'unavailable',
    authority: 'evidence-only',
  });
});

test.each([
  'version',
  'inner-version',
  'extra',
  'empty',
  'duplicate-ref',
  'closure',
  'unknown-provider',
  'fingerprint',
  'time',
  'snapshot',
  'route',
])('forged %s receipt refuses even with its recomputed digest', async (fault) => {
  const f = fixture();
  expect((await f.capture()).exit).toBe(0);
  const receipt = JSON.parse(readFileSync(f.receiptPath, 'utf8')) as {
    version: number;
    observation: {
      version: number;
      capturedAt: number;
      signals: { log: { id: string; fingerprint: string }[] };
    };
    provider: {
      version: number;
      observation: { revision: string };
      elastic: unknown[];
      routes: { elastic: unknown };
    };
    extra?: string;
  };
  if (fault === 'version') receipt.version = 2;
  if (fault === 'inner-version') receipt.observation.version = 2;
  if (fault === 'extra') receipt.extra = secret;
  if (fault === 'empty') receipt.observation.signals.log = [];
  if (fault === 'duplicate-ref')
    receipt.observation.signals.log.push(receipt.observation.signals.log[0]);
  if (fault === 'closure') receipt.provider.elastic.pop();
  if (fault === 'unknown-provider') receipt.provider.version = 2;
  if (fault === 'fingerprint') receipt.observation.signals.log[0].fingerprint = 'wrong';
  if (fault === 'time') receipt.observation.capturedAt = -1;
  if (fault === 'snapshot') receipt.provider.observation.revision = 'c'.repeat(40);
  if (fault === 'route') receipt.provider.routes.elastic = 'f'.repeat(64);
  f.save(f.receiptPath, receipt);
  expect((await f.verify()).exit).not.toBe(0);
  expect(() => readFileSync(f.verificationPath)).toThrow();
});

test.each([
  'digest',
  'request-missing',
  'request-unreadable',
  'request-malformed',
  'request-big',
  'request-public',
  'checkpoint-missing',
  'checkpoint-unreadable',
  'checkpoint-malformed',
  'occupied',
  'directory',
  'extra-arguments',
])('trusted %s boundary refuses without replacing an earlier output', async (fault) => {
  const f = fixture();
  if (fault === 'digest') {
    expect((await f.capture()).exit).toBe(0);
    expect((await f.verify('0'.repeat(64))).exit).not.toBe(0);
    return;
  }
  if (fault === 'request-missing') rmSync(f.requestPath);
  if (fault === 'request-unreadable') chmodSync(f.requestPath, 0);
  if (fault === 'request-malformed') writeFileSync(f.requestPath, secret);
  if (fault === 'request-big') {
    const prefix = JSON.stringify(f.request);
    writeFileSync(f.requestPath, prefix + ' '.repeat(262145 - prefix.length));
  }
  if (fault === 'request-public') chmodSync(f.requestPath, 0o644);
  if (fault === 'checkpoint-missing') rmSync(f.checkpointPath);
  if (fault === 'checkpoint-unreadable') chmodSync(f.checkpointPath, 0);
  if (fault === 'checkpoint-malformed') writeFileSync(f.checkpointPath, secret);
  if (fault === 'occupied') writeFileSync(f.receiptPath, 'original', { mode: 0o600 });
  const execution =
    fault === 'extra-arguments'
      ? await f.run('history-capture', f.requestPath, f.receiptPath, 'extra')
      : fault === 'directory'
        ? await f.run('history-capture', f.requestPath, f.root)
        : await f.capture();
  expect(execution.exit).not.toBe(0);
  if (fault === 'request-missing' || fault === 'checkpoint-missing')
    expect(execution.stderr.trim()).toBe('history-file-absent');
  if (
    fault === 'request-unreadable' ||
    fault === 'checkpoint-unreadable' ||
    fault === 'request-public'
  )
    expect(execution.stderr.trim()).toBe('history-file-unreadable');
  if (fault === 'request-malformed') expect(execution.stderr.trim()).toBe('history-file-malformed');
  if (fault === 'request-big') expect(execution.stderr.trim()).toBe('history-file-size');
  if (fault === 'occupied') expect(execution.stderr.trim()).toBe('history-output-occupied');
  if (fault === 'occupied') expect(readFileSync(f.receiptPath, 'utf8')).toBe('original');
  else expect(() => readFileSync(f.receiptPath)).toThrow();
});

test('fresh capture refuses a stale or failed source and incomplete original acceptance', async () => {
  for (const fault of ['stale', 'failed', 'trace', 'metrics']) {
    const f = fixture();
    if (fault === 'stale') {
      f.observation.observedAt = Date.now() - 181000;
      f.observation.requestFinishedAt = f.observation.observedAt;
      f.observation.startedAt = f.observation.observedAt - 20;
      f.observation.requestStartedAt = f.observation.observedAt - 10;
      f.observation.finishedAt = f.observation.observedAt;
    }
    if (fault === 'failed') f.observation.success = false;
    if (fault === 'trace') f.traces.pop();
    if (fault === 'metrics') f.metrics[1].metric.revision = 'f'.repeat(40);
    f.save(f.checkpointPath, f.observation);
    expect((await f.capture()).exit).not.toBe(0);
    expect(() => readFileSync(f.receiptPath)).toThrow();
  }
});

test('authenticated history checks actual query rights, commits safe binding identity and survives password rotation', async () => {
  const f = fixture(true);
  expect((await f.capture()).exit).toBe(0);
  const bytes = readFileSync(f.receiptPath, 'utf8');
  const passwordHash = createHash('sha256').update(secret).digest('hex');
  expect(bytes).not.toContain(secret);
  expect(bytes).not.toContain(passwordHash);
  f.faults.password = 'ROTATED_PASSWORD_MARKER';
  f.binding.authentication = { kind: 'basic', username: 'reader', password: f.faults.password };
  f.save(f.bindingPath, f.binding);
  expect((await f.verify()).exit).toBe(0);
  expect(readFileSync(f.receiptPath, 'utf8')).toBe(bytes);
  rmSync(f.verificationPath);
  f.faults.authority = false;
  expect((await f.verify()).exit).not.toBe(0);
  expect(() => readFileSync(f.verificationPath)).toThrow();
});

test.each(['second-revision', 'second-wrong-gauge', 'second-identity', 'second-samples'])(
  'capture %s cannot reuse a changed backend after acceptance',
  async (fault) => {
    const f = fixture();
    f.faults.kind = fault;
    expect((await f.capture()).exit).not.toBe(0);
    expect(() => readFileSync(f.receiptPath)).toThrow();
  },
);

test('capture total deadline bounds several individually timely queries', async () => {
  const f = fixture();
  f.faults.delay = 3000;
  const started = performance.now();
  expect((await f.capture()).exit).not.toBe(0);
  expect(performance.now() - started).toBeLessThan(11500);
  expect(() => readFileSync(f.receiptPath)).toThrow();
}, 20000);

test('verification total deadline publishes a noncomplete outcome', async () => {
  const f = fixture();
  expect((await f.capture()).exit).toBe(0);
  f.faults.delay = 4000;
  const started = performance.now();
  expect((await f.verify()).exit).not.toBe(0);
  expect(performance.now() - started).toBeLessThan(11500);
  expect(JSON.parse(readFileSync(f.verificationPath, 'utf8')) as unknown).toMatchObject({
    state: 'unavailable',
  });
}, 20000);

test.each(['absent', 'unreadable', 'malformed', 'oversized', 'occupied-verification'])(
  'receipt %s refuses with no overwrite',
  async (fault) => {
    const f = fixture();
    expect((await f.capture()).exit).toBe(0);
    const digest = f.digest();
    if (fault === 'absent') rmSync(f.receiptPath);
    if (fault === 'unreadable') chmodSync(f.receiptPath, 0);
    if (fault === 'malformed') writeFileSync(f.receiptPath, secret);
    if (fault === 'oversized') writeFileSync(f.receiptPath, ' '.repeat(262145));
    if (fault === 'occupied-verification') writeFileSync(f.verificationPath, 'original');
    expect(
      (await f.verify(fault === 'malformed' || fault === 'oversized' ? f.digest() : digest)).exit,
    ).not.toBe(0);
    if (fault === 'occupied-verification')
      expect(readFileSync(f.verificationPath, 'utf8')).toBe('original');
    else expect(() => readFileSync(f.verificationPath)).toThrow();
  },
);

test('simultaneous captures exclusively publish one operation without overwriting', async () => {
  const f = fixture();
  f.faults.delay = 200;
  const executions = await Promise.all([f.capture(), f.capture()]);
  expect(executions.map((execution) => execution.exit).sort()).toEqual([0, 1]);
  expect(statSync(f.receiptPath).mode & 0o777).toBe(0o600);
});

test('request unknown fields and empty checkpoint refuse before publication', async () => {
  const f = fixture();
  f.save(f.requestPath, { ...f.request, ignored: secret });
  expect((await f.capture()).exit).not.toBe(0);
  expect(() => readFileSync(f.receiptPath)).toThrow();
  f.save(f.requestPath, f.request);
  f.save(f.checkpointPath, { state: 'empty' });
  const empty = await f.capture();
  expect(empty.exit).not.toBe(0);
  expect(empty.stderr.trim()).toBe('history-checkpoint-empty');
  expect(() => readFileSync(f.receiptPath)).toThrow();
});

test('fresh acceptance rejects a coherent stale observation even when its original scrape remains in range', async () => {
  const f = fixture(false, 180001);
  expect((await f.capture()).exit).not.toBe(0);
  expect(() => readFileSync(f.receiptPath)).toThrow();
});

test('unselected attributes do not enter canonical fingerprints', async () => {
  const f = fixture();
  expect((await f.capture()).exit).toBe(0);
  f.logs[0]._source.attributes.secret = 'CHANGED_UNSELECTED_MARKER';
  expect((await f.verify()).exit).toBe(0);
});

test('capture snapshots caller-owned authenticated bindings before the acceptance await', async () => {
  const f = fixture(true);
  const operation = captureHistory(
    { elastic: f.binding, prometheus: f.binding },
    f.observation as ProbeObservation,
  );
  f.binding.authentication = { kind: 'basic', username: 'reader', password: 'CHANGED_PASSWORD' };
  expect((await operation).observation.authority).toBe('evidence-only');
});

test('verification snapshots caller-owned authenticated bindings before historical reads', async () => {
  const f = fixture(true);
  expect((await f.capture()).exit).toBe(0);
  const receipt = readHistoryReceipt(JSON.parse(readFileSync(f.receiptPath, 'utf8')));
  const operation = verifyHistory({ elastic: f.binding, prometheus: f.binding }, receipt);
  f.binding.authentication = { kind: 'basic', username: 'reader', password: 'CHANGED_PASSWORD' };
  await operation;
});

test('mTLS private-key rotation preserves principal commitment without credential hashes', async () => {
  const f = fixture(true, 30000, true);
  expect((await f.capture()).exit).toBe(0);
  const before = readFileSync(f.receiptPath, 'utf8');
  for (const client of f.clients) {
    expect(before).not.toContain(client.key);
    expect(before).not.toContain(createHash('sha256').update(client.key).digest('hex'));
  }
  f.binding.authentication = { kind: 'mtls', ...f.clients[1] };
  f.save(f.bindingPath, f.binding);
  expect((await f.verify()).exit).toBe(0);
  expect(readFileSync(f.receiptPath, 'utf8')).toBe(before);
});

test('trusted request symlink refuses rather than following another private file', async () => {
  const f = fixture();
  const target = join(f.root, 'actual-request.json');
  renameSync(f.requestPath, target);
  symlinkSync(target, f.requestPath);
  const execution = await f.capture();
  expect(execution.exit).not.toBe(0);
  expect(execution.stderr.trim()).toBe('history-file-unreadable');
  expect(() => readFileSync(f.receiptPath)).toThrow();
});

test('receipt encoding size fault refuses before publication', async () => {
  const f = fixture();
  f.preload(
    `const original = JSON.stringify; JSON.stringify = (value, ...args) => original(value, ...args) + (value?.provider?.kind === 'legacy-elastic-prometheus' ? ' '.repeat(262145) : '');`,
  );
  const execution = await f.capture();
  expect(execution.exit).not.toBe(0);
  expect(execution.stderr.trim()).toBe('history-output-size');
  expect(() => readFileSync(f.receiptPath)).toThrow();
});

test('capture preserves the live 120-second freshness gate for a coherent 150-second observation', async () => {
  const f = fixture(false, 150000);
  expect((await f.capture()).exit).not.toBe(0);
  expect(() => readFileSync(f.receiptPath)).toThrow();
});

function substituteAfterRead(target: string, replacement: string): string {
  return `import * as fs from 'node:fs'; import { mock } from 'bun:test';
    const target = ${JSON.stringify(target)}, replacement = ${JSON.stringify(replacement)};
    const inode = fs.statSync(target).ino, original = fs.readSync;
    let substituted = false;
    const readSync = (descriptor, ...args) => {
      const length = original(descriptor, ...args);
      if (!substituted && length > 0 && fs.fstatSync(descriptor).ino === inode) {
        fs.renameSync(replacement, target); substituted = true;
      }
      return length;
    };
    mock.module('node:fs', () => ({ ...fs, readSync }));`;
}

test('capture consumes the checked checkpoint bytes after deterministic pathname substitution', async () => {
  const f = fixture();
  const replacement = join(f.root, 'replacement-checkpoint.json');
  f.save(replacement, { ...f.observation, observationId: 'replacement-observation' });
  chmodSync(replacement, 0o644);
  f.preload(substituteAfterRead(f.checkpointPath, replacement));
  const execution = await f.capture();
  expect(statSync(f.checkpointPath).mode & 0o777).toBe(0o644);
  expect(execution.exit).toBe(0);
  const receipt = JSON.parse(readFileSync(f.receiptPath, 'utf8')) as {
    observation: { identity: { observationId: string } };
  };
  expect(receipt.observation.identity.observationId).toBe('retained-observation');
});

test('capture consumes the checked binding bytes after deterministic pathname substitution', async () => {
  const f = fixture(true);
  const replacement = join(f.root, 'replacement-binding.json'),
    stable = join(f.root, 'stable-prometheus.json');
  f.save(stable, f.binding);
  f.save(f.requestPath, { ...f.request, prometheus: { kind: 'binding-file', path: stable } });
  f.save(replacement, {
    ...f.binding,
    authentication: { kind: 'basic', username: 'reader', password: 'UNCHECKED_REPLACEMENT' },
  });
  chmodSync(replacement, 0o644);
  f.preload(substituteAfterRead(f.bindingPath, replacement));
  const execution = await f.capture();
  expect(statSync(f.bindingPath).mode & 0o777).toBe(0o644);
  expect(execution.exit).toBe(0);
  expect(JSON.parse(readFileSync(f.receiptPath, 'utf8')) as unknown).toMatchObject({
    observation: { identity: { observationId: 'retained-observation' } },
  });
});

test('capture rereads the scrape selected after its initial clock at the returned coordinate', async () => {
  const f = fixture();
  f.faults.kind = 'query-cutoff';
  f.preload('const epoch = Date.now(); let calls = 0; Date.now = () => epoch + ++calls * 10;');
  expect((await f.capture()).exit).toBe(0);
  const times = f.queries
    .filter((query) => query.startsWith('/api/v1/query'))
    .map((query) => Number(new URL(query, 'http://127.0.0.1').searchParams.get('time')));
  expect(times.length).toBe(2);
  expect(times[1]).toBe(times[0]);
});

test('FIFO trusted input refuses promptly within a controlled child deadline', async () => {
  const f = fixture();
  rmSync(f.requestPath);
  execFileSync('mkfifo', ['-m', '600', f.requestPath]);
  const child = Bun.spawn(
    [process.execPath, cli, 'history-capture', f.requestPath, f.receiptPath],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const completion = await Promise.race([
    child.exited.then((exit) => ({ state: 'exited' as const, exit })),
    Bun.sleep(2000).then(() => ({ state: 'child-deadline' as const })),
  ]);
  if (completion.state === 'child-deadline') child.kill('SIGKILL');
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(completion).toEqual({ state: 'exited', exit: 1 });
  expect(stdout + stderr).not.toContain(secret);
  expect(stderr.trim()).toBe('history-file-unreadable');
  expect(() => readFileSync(f.receiptPath)).toThrow();
});
