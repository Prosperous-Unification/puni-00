import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { setSystemTime } from 'bun:test';

import { captureHistory } from './history-provider';
import { encodeOtlp } from './otlp';
import type { ProbeObservation } from './probe';
import {
  type ObserverContext,
  observerRouteCommitment,
  renderRoutedObserverUnit,
  resolveObserverRoutes,
} from './route-provider';

export async function createRouteFixture() {
  const home = mkdtempSync(join(tmpdir(), 'puni-route79-'));
  const state = join(home, '.local/state/puni-dev-observability');
  const sourceRevision = 'a'.repeat(40),
    applicationRevision = 'b'.repeat(40),
    containerId = 'c'.repeat(64);
  const release = join(home, '.local/lib/puni-dev-observability', sourceRevision.slice(0, 9));
  for (const path of [
    state,
    release,
    join(home, '.config/systemd/user'),
    join(state, 'bindings/old'),
    join(state, 'bindings/new'),
  ])
    mkdirSync(path, { recursive: true, mode: 0o700 });
  const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
  const put = (path: string, wire: unknown) => {
    writeFileSync(path, JSON.stringify(wire), { mode: 0o600 });
    return { path, sha256: hash(readFileSync(path)) };
  };
  const clockPath = join(home, 'clock.json');
  put(clockPath, Date.now());
  const observation = (observedAt = Date.now() - 5000): ProbeObservation => ({
    source: { kind: 'ssh-dev-container', containerValidated: true, containerId },
    observationId: randomUUID(),
    traceId: '1'.repeat(32),
    parentSpanId: '2'.repeat(16),
    childSpanId: '3'.repeat(16),
    environment: 'dev',
    service: 'be-01',
    producerVersion: sourceRevision,
    revision: applicationRevision,
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
  });
  const initial = observation();
  put(join(state, 'probe.json'), initial);
  const certPath = join(home, 'cert.pem'),
    keyPath = join(home, 'key.pem');
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
      keyPath,
      '-out',
      certPath,
      '-subj',
      '/CN=route.test',
      '-addext',
      'subjectAltName=DNS:route.test',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-days',
      '1',
    ],
    { stdio: 'pipe' },
  );
  const cert = readFileSync(certPath, 'utf8'),
    key = readFileSync(keyPath, 'utf8');
  type Attributes = {
    key: string;
    value: { stringValue?: string; doubleValue?: number; boolValue?: boolean };
  }[];
  const attributes = (entries: Attributes) =>
    Object.fromEntries(
      entries.map((entry) => [
        entry.key,
        entry.value.stringValue ?? entry.value.doubleValue ?? entry.value.boolValue,
      ]),
    );
  const faults = {
    stored: false,
    candidateStored: false,
    history: false,
    process: false,
    override: false,
    reload: false,
    restart: false,
  };
  function backend(role: 'old' | 'candidate') {
    const documents: { _index: string; _id: string; _source: Record<string, unknown> }[] = [];
    const samples = new Map<
      string,
      { metric: Record<string, string>; values: [number, string][] }
    >();
    const ingest = (kind: string, wire: unknown) => {
      const encoded = wire as ReturnType<typeof encodeOtlp>['logs'] &
        ReturnType<typeof encodeOtlp>['traces'] &
        ReturnType<typeof encodeOtlp>['metrics'];
      if (kind === 'metrics')
        for (const metric of encoded.resourceMetrics[0].scopeMetrics[0].metrics) {
          if (
            ![
              'puni_dev_probe_observed_timestamp_seconds',
              'puni_dev_revision_info',
              'puni_dev_probe_success',
            ].includes(metric.name)
          )
            continue;
          for (const point of metric.gauge.dataPoints) {
            const labels = {
              __name__: metric.name,
              ...Object.fromEntries(
                point.attributes.map((entry) => [entry.key, String(entry.value.stringValue)]),
              ),
            };
            const identity = JSON.stringify(labels);
            const series: { metric: Record<string, string>; values: [number, string][] } =
              samples.get(identity) ?? { metric: labels, values: [] };
            series.values.push([
              Number(BigInt(point.timeUnixNano) / 1000000n) / 1000,
              String(point.asDouble),
            ]);
            samples.set(identity, series);
          }
        }
      else {
        const resource =
          kind === 'logs' ? encoded.resourceLogs[0].resource : encoded.resourceSpans[0].resource;
        const entries =
          kind === 'logs'
            ? encoded.resourceLogs[0].scopeLogs[0].logRecords
            : encoded.resourceSpans[0].scopeSpans[0].spans;
        for (const entry of entries) {
          const record =
            entry as (typeof encoded.resourceSpans)[0]['scopeSpans'][0]['spans'][number];
          const selected = attributes(entry.attributes),
            root = kind === 'traces' && record.parentSpanId === '';
          const document = {
            '@timestamp':
              kind === 'logs'
                ? String(selected['puni.observation.timestamp_ms'])
                : String(Number(BigInt(record.startTimeUnixNano) / 1000000n)),
            resource: { attributes: attributes(resource.attributes) },
            attributes: { ...selected, ...(root ? { 'transaction.root': true } : {}) },
            trace_id: entry.traceId,
            span_id: entry.spanId,
            ...(kind === 'logs'
              ? { body: { text: 'dev health observation' } }
              : {
                  name: record.name,
                  kind: root ? 'Internal' : 'Client',
                  status: { code: 'Ok' },
                  ...(root ? {} : { parent_span_id: record.parentSpanId }),
                }),
          };
          documents.push({
            _index: `.ds-${kind === 'logs' ? 'logs' : 'traces'}-generic.otel-dev-2026.10.31-000001`,
            _id: `${String(selected['puni.observation.id'])}-${kind}-${entry.spanId}`,
            _source: document,
          });
        }
      }
    };
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      tls: { cert, key },
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/v1/')) {
          ingest(url.pathname.slice(4), await request.json());
          return Response.json({});
        }
        if (
          request.headers.get('authorization') !==
          `Basic ${Buffer.from('reader:fixture-secret').toString('base64')}`
        )
          return new Response('', { status: 401 });
        if (url.pathname === '/_security/user/_privileges')
          return Response.json({
            cluster: [],
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
        if (faults.stored || (role === 'candidate' && faults.candidateStored))
          return new Response('', { status: 503 });
        if (url.pathname === '/api/v1/query') {
          const cutoff = Number(url.searchParams.get('time'));
          return Response.json({
            status: 'success',
            data: {
              resultType: 'matrix',
              result: [...samples.values()].map((series) => ({
                ...series,
                values: series.values.filter(([time]) => time <= cutoff && time >= cutoff - 180),
              })),
            },
          });
        }
        const body = (await request.json()) as {
          query: {
            ids?: { values: string[] };
            bool?: { filter: { term: Record<string, string> }[] };
          };
        };
        const wanted = body.query.bool?.filter.find(
          (filter) => 'attributes.puni.observation.id' in filter.term,
        )?.term['attributes.puni.observation.id'];
        const hits = documents.filter(
          (document) =>
            document._index.includes(url.pathname.includes('logs') ? '-logs-' : '-traces-') &&
            (body.query.ids === undefined
              ? (document._source['attributes'] as Record<string, unknown>)[
                  'puni.observation.id'
                ] === wanted
              : body.query.ids.values.includes(document._id)),
        );
        return Response.json({
          timed_out: false,
          _shards: { failed: 0 },
          hits: {
            total: { value: faults.history ? 0 : hits.length, relation: 'eq' },
            hits: faults.history ? [] : hits,
          },
        });
      },
    });
    const store = (previous: ProbeObservation) => {
      const encoded = encodeOtlp(previous);
      for (const kind of ['logs', 'metrics', 'traces'] as const) ingest(kind, encoded[kind]);
    };
    return { server, store };
  }
  const old = backend('old'),
    candidate = backend('candidate');
  old.store(initial);
  const before = { kind: 'authenticated' as const, directory: join(state, 'bindings/old') };
  const after = { kind: 'authenticated' as const, directory: join(state, 'bindings/new') };
  for (const [route, selected] of [
    [before, old],
    [after, candidate],
  ] as const)
    for (const name of ['otlp', 'elastic', 'prometheus'])
      put(join(route.directory, `${name}.json`), {
        url: `https://127.0.0.1:${String(selected.server.port)}`,
        serverName: 'route.test',
        ca: cert,
        authentication:
          name === 'otlp'
            ? { kind: 'mtls', cert, key }
            : { kind: 'basic', username: 'reader', password: 'fixture-secret' },
      });
  const binary = join(release, 'observer');
  writeFileSync(binary, 'component-executable', { mode: 0o700 });
  const manifest = put(join(release, 'manifest.json'), {
    sourceCommit: sourceRevision,
    binarySha256: hash(readFileSync(binary)),
    binaryBytes: readFileSync(binary).length,
    target: 'bun-linux-x64',
    builtOn: 'local',
    bunVersion: '1.4.4',
  });
  const unit = join(home, '.config/systemd/user/puni-dev-observability.service');
  writeFileSync(unit, renderRoutedObserverUnit(sourceRevision, before, home), { mode: 0o600 });
  const tunnel = join(dirname(unit), 'puni-dev-observability-tunnel.service');
  writeFileSync(tunnel, 'preserved-component-tunnel', { mode: 0o600 });
  const worker = Bun.spawn([process.execPath, '--eval', 'setInterval(()=>{},1000)'], {
    stdout: 'ignore',
    stderr: 'ignore',
  });
  let pid = worker.pid;
  const managerState = join(home, 'manager.json');
  put(managerState, {
    pid,
    inactive: false,
    reload: false,
    override: false,
    restart: false,
    loadedCommand: readFileSync(unit, 'utf8')
      .split('\n')
      .find((line) => line.startsWith('ExecStart='))!
      .slice(10),
  });
  const manager = join(home, 'systemctl');
  writeFileSync(
    manager,
    `#!/usr/bin/env bun
const fs=await import('node:fs');const state=${JSON.stringify(managerState)},unit=${JSON.stringify(unit)};const s=JSON.parse(fs.readFileSync(state));const args=process.argv.slice(2);
if(args.includes('show')){const current=fs.readFileSync(unit,'utf8').split('\\n').find(l=>l.startsWith('ExecStart=')).slice(10);const cmd=s.loadedCommand;console.log('FragmentPath='+unit+'\\nDropInPaths='+(s.override?'foreign.conf':'')+'\\nNeedDaemonReload='+(cmd!==current?'yes':'no')+'\\nExecStart={ path='+cmd.split(' ')[0]+' ; argv[]='+cmd+' ; }\\nActiveState='+(s.inactive?'failed':'active')+'\\nSubState='+(s.inactive?'failed':'running')+'\\nMainPID='+s.pid+'\\nControlGroup='+(s.inactive?'':'component'));}
else if(args.includes('daemon-reload')){if(s.reload)process.exit(7);s.loadedCommand=fs.readFileSync(unit,'utf8').split('\\n').find(l=>l.startsWith('ExecStart=')).slice(10);fs.writeFileSync(state,JSON.stringify(s));}
else if(args.includes('restart')){if(s.restart)process.exit(8);const child=Bun.spawn([process.execPath,'--eval','setInterval(()=>{},1000)'],{stdout:'ignore',stderr:'ignore'});child.unref();s.pid=child.pid;s.inactive=false;if(s.bindingDrift){const path=${JSON.stringify(join(after.directory, 'otlp.json'))};const binding=JSON.parse(fs.readFileSync(path));binding.ca+=binding.ca;fs.writeFileSync(path,JSON.stringify(binding));}fs.appendFileSync(${JSON.stringify(join(home, 'pids'))},String(child.pid)+'\\n');fs.writeFileSync(state,JSON.stringify(s));}else process.exit(9);
`,
    { mode: 0o700 },
  );
  const ssh = join(home, 'ssh');
  writeFileSync(
    ssh,
    `#!/usr/bin/env bun
const args=process.argv.slice(2);const now=JSON.parse(await Bun.file(${JSON.stringify(clockPath)}).text());
if(args.includes('inspect'))console.log(JSON.stringify([{Id:'${containerId}',Name:'/wbs-dev-src',State:{Running:true},Mounts:[{Type:'bind',Source:'/home/puni1/wbs-dev/src',Destination:'/src'}],NetworkSettings:{Networks:{'wbs-dev-net':{}}},Config:{WorkingDir:'/src',Cmd:['bun','run','dev']}}]));
else if(args.includes('exec'))console.log(JSON.stringify({success:true,revision:'${applicationRevision}',reason:null,startedAt:now,finishedAt:now,requestDurationMs:0,transportDurationMs:null}));else process.exit(6);
`,
    { mode: 0o700 },
  );
  const context: ObserverContext = {
    home,
    hostname: 'component-host',
    user: 'component-user',
    systemctl: manager,
    ssh,
    readProcess: (observedPID) => {
      pid = observedPID;
      const manager = JSON.parse(readFileSync(managerState, 'utf8')) as { loadedCommand: string };
      return {
        executable: faults.process ? '/foreign' : binary,
        arguments: manager.loadedCommand.split(' '),
      };
    },
  };
  const pin = {
    home,
    hostname: context.hostname,
    user: context.user,
    sourceRevision,
    binarySHA256: hash(readFileSync(binary)),
    manifestSHA256: manifest.sha256,
    tunnelSHA256: hash(readFileSync(tunnel)),
    containerId,
    applicationRevision,
  };
  const history = put(
    join(home, 'history.json'),
    await captureHistory(resolveObserverRoutes(before, context), initial),
  );
  const tick = (milliseconds: number) => {
    const now = Date.now() + milliseconds + 1;
    setSystemTime(now);
    put(clockPath, now);
    const previous = observation(now - 1);
    put(join(state, 'probe.json'), previous);
    (readFileSync(unit, 'utf8').includes(after.directory) ? candidate : old).store(previous);
    return Promise.resolve();
  };
  const now = Date.now();
  setSystemTime(now);
  put(clockPath, now);
  return {
    home,
    state,
    before,
    after,
    context,
    pin,
    history,
    faults,
    managerState,
    unit,
    observation,
    old,
    candidate,
    put,
    initial,
    tick,
    beforeSHA256: observerRouteCommitment(resolveObserverRoutes(before, context)),
    afterSHA256: observerRouteCommitment(resolveObserverRoutes(after, context)),
    close() {
      worker.kill();
      if (readFileSync(managerState, 'utf8')) {
        try {
          for (const value of readFileSync(join(home, 'pids'), 'utf8').trim().split('\n'))
            process.kill(Number(value));
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
      }
      void old.server.stop(true);
      void candidate.server.stop(true);
      setSystemTime();
      rmSync(home, { recursive: true, force: true });
    },
  };
}
