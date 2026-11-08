import { createHash } from 'node:crypto';

import { type } from 'arktype';

import { readBounded } from './source';

const sourceUid = 'puni-dev-prometheus';
const dashboardUid = 'puni-dev-observability';
const ObjectShape = type({ '[string]': 'unknown' });
const SourceList = type({
  uid: 'string',
  isDefault: 'boolean',
  'type?': 'string',
  'url?': 'string',
}).array();
const DashboardList = type({ uid: 'string', title: 'string' }).array();
const DashboardReply = type({
  dashboard: { uid: 'string', version: 'number' },
  meta: { provisioned: 'boolean' },
});
const JournalShape = type({
  '+': 'reject',
  schema: '1',
  owner: "'puni-dev-observability'",
  baseline: 'string',
  phase: "'captured' | 'datasource-created' | 'applied' | 'dashboard-removed' | 'removed'",
  datasourceHash: 'string | null',
  dashboardHash: 'string | null',
});
export type GrafanaJournal = typeof JournalShape.infer;
export type GrafanaApi = (
  path: string,
  method?: 'GET' | 'POST' | 'DELETE',
  body?: unknown,
) => Promise<unknown>;
type SaveJournal = (journal: GrafanaJournal) => Promise<void>;

function serializeCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = ObjectShape.assert(value);
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serializeCanonical(record[key])}`)
      .join(',')}}`;
  }
  // Proof: removing this guard fails undefined external inventory fields negative.
  if (value === undefined) throw new Error('Grafana JSON value is undefined');
  return JSON.stringify(value);
}
const hashValue = (value: unknown) =>
  createHash('sha256').update(serializeCanonical(value)).digest('hex');

/** Validates the durable rollback receipt at the file boundary; no credential is part of this format. */
export function parseGrafanaJournal(value: unknown): GrafanaJournal {
  // Proof: malformed-journal negative fails when this assertion is bypassed.
  return JournalShape.assert(value);
}

/**
 * Existing authenticated host-local Grafana only. Each API call is bounded to five seconds/1MiB,
 * refuses redirects and prints neither credentials nor response bodies. Null means GET 404 only.
 * A failed mutation can have committed remotely: retain the journal and inspect before retrying.
 */
export function createGrafanaClient(endpoint: string, authorization: string): GrafanaApi {
  const url = new URL(endpoint);
  // Proof: removing endpoint guard fails the nonprivate API boundary negatives.
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Grafana API must be a credential-free HTTP loopback root');
  }
  // Proof: removing credential guard fails missing-credential negative.
  if (authorization.trim() === '' || /[\r\n]/.test(authorization))
    throw new Error('missing or invalid Grafana credential');
  return async (path, method = 'GET', body) => {
    // Proof: removing path guard fails credential-forwarding negative before any connection.
    if (!path.startsWith('/api/') || path.includes('\\'))
      throw new Error('Grafana API path must remain host-local');
    // Proof: raising deadline to 7s fails the stalled-response deadline negative.
    const signal = AbortSignal.timeout(5000);
    const response = await fetch(new URL(path, url), {
      method,
      redirect: 'error',
      signal,
      headers: { authorization, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (method === 'GET' && response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    // Proof: bypassing status check fails dashboard-create HTTP500 and authentication negatives.
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Grafana ${method} ${path} returned HTTP ${String(response.status)}`);
    }
    // Proof: raising this limit to 4MiB fails the successful-response byte-bound negative.
    const text = await readBounded(response, 1024 * 1024);
    const parsed: unknown = JSON.parse(text);
    return parsed;
  };
}

/**
 * See [operator apply/rollback](../../../../docs/runbook-dev-observability-grafana.md)
 * and {@link captureGrafana} for ownership and receipt handling.
 * API-managed additions live in Grafana's existing persistent database, outside Claire's
 * file provisioning. No default or existing UID changes. Reapply after loss requires a fresh
 * absence capture; do not recreate over an existing object. Query errors remain Grafana errors.
 */
export function renderDevGrafana() {
  const target = '{environment="dev",service="be-01"}';
  const selectMetric = (name: string) => `${name}${target}`;
  const revisions = `${selectMetric('puni_dev_revision_info')} == 1`;
  const definitions: [string, string, string][] = [
    [
      'Backend health states (1 = active)',
      selectMetric('puni_dev_observation_health'),
      '{{state}}',
    ],
    [
      'Backend check age (seconds)',
      `time() - ${selectMetric('puni_dev_observation_checked_timestamp_seconds')}`,
      'age',
    ],
    [
      'Per-signal reasons (1 = active)',
      `${selectMetric('puni_dev_observation_signal_reason')} == 1`,
      '{{signal}} / {{reason}}',
    ],
    ['Measured health request success', selectMetric('puni_dev_probe_success'), 'success'],
    [
      'Measured HTTP duration (seconds)',
      selectMetric('puni_dev_probe_duration_seconds'),
      'HTTP request',
    ],
    [
      'Observation age (seconds)',
      `time() - ${selectMetric('puni_dev_probe_observed_timestamp_seconds')}`,
      'age',
    ],
    ['Active revision count', `count(${revisions})`, 'active revisions'],
    [
      'Observed revision (only when unique)',
      `(${revisions}) and on() (count(${revisions}) == 1)`,
      '{{revision}}',
    ],
    [
      'Application log collection (1 = active)',
      selectMetric('puni_dev_application_log_collection_state'),
      '{{state}}',
    ],
    [
      'Application log check age (seconds)',
      `time() - ${selectMetric('puni_dev_application_log_checked_timestamp_seconds')}`,
      'age',
    ],
    [
      'Storage collection (1 = active)',
      'puni_dev_storage_collection_state{environment="dev"}',
      '{{state}}',
    ],
    ['Storage available bytes', 'puni_dev_storage_available_bytes{environment="dev"}', 'bytes'],
    ['Storage capacity bytes', 'puni_dev_storage_capacity_bytes{environment="dev"}', 'bytes'],
    [
      'Storage reading age (seconds)',
      'time() - puni_dev_storage_observed_timestamp_seconds{environment="dev"}',
      'age',
    ],
  ];
  return {
    composeOverlay: {
      services: {
        prometheus: {
          networks: { dev: {}, 'grafana-query': { aliases: ['puni-dev-prometheus'] } },
        },
      },
      networks: { 'grafana-query': { external: true, name: 'h3mon-observability_query' } },
    },
    datasource: {
      uid: sourceUid,
      name: 'Puni dev Prometheus',
      type: 'prometheus',
      access: 'proxy',
      url: 'http://puni-dev-prometheus:9090',
      isDefault: false,
      editable: false,
      jsonData: { httpMethod: 'POST', timeInterval: '5s' },
    },
    dashboard: {
      uid: dashboardUid,
      title: 'Puni dev observation',
      tags: ['puni-owned', 'dev-observability'],
      description:
        'External measured dev health requests, not application internal spans. Missing / Unknown and query errors are not healthy. Backend check/observation/log/storage ages must be <=120s. Active revision count must be exactly 1; ambiguity hides the revision. Application logs retain mcp-01 identity and unknown revision. Storage gauges may retain the last reading: check its age and collection state.',
      schemaVersion: 39,
      version: 0,
      editable: false,
      refresh: '10s',
      timezone: 'utc',
      time: { from: 'now-30m', to: 'now' },
      panels: definitions.map(([title, expr, legendFormat], index) => ({
        id: index + 1,
        type: index === 7 ? 'table' : 'timeseries',
        title,
        datasource: { type: 'prometheus', uid: sourceUid },
        gridPos: { h: 8, w: 12, x: (index % 2) * 12, y: Math.floor(index / 2) * 8 },
        fieldConfig: { defaults: { noValue: 'Missing / Unknown' }, overrides: [] },
        options: {
          legend: { displayMode: 'table', placement: 'bottom', calcs: ['last'] },
          tooltip: { mode: 'multi' },
        },
        targets: [
          {
            refId: 'A',
            expr,
            legendFormat,
            range: index !== 7,
            instant: index === 7,
            ...(index === 7 ? { format: 'table' } : {}),
          },
        ],
      })),
    },
  };
}

async function captureInventory(api: GrafanaApi): Promise<string> {
  const sources = SourceList.assert(await api('/api/datasources'));
  const dashboards = DashboardList.assert(await api('/api/search?type=dash-db&limit=1000'));
  // Proof: removing discovery cap fails full-page discovery negative; do not assume a truncated baseline complete.
  if (dashboards.length >= 1000) throw new Error('Grafana dashboard discovery reached limit');
  const retainedSources = sources.filter((source) => source.uid !== sourceUid);
  const retainedDashboards = dashboards.filter((dashboard) => dashboard.uid !== dashboardUid);
  // Proof: removing default guard fails changed-default capture negative.
  if (
    !retainedSources.some((source) => source.uid === 'sdlc-metrics' && source.isDefault) ||
    retainedSources.filter((source) => source.isDefault).length !== 1 ||
    !['sdlc-logs', 'sdlc-traces'].every((uid) =>
      retainedSources.some((source) => source.uid === uid),
    )
  )
    throw new Error('existing Grafana datasource UIDs/default changed');
  // Proof: removing type/URL equality independently accepts each wrong-initial-Victoria HTTP negative.
  const victoria = retainedSources.find((source) => source.uid === 'sdlc-metrics');
  if (victoria?.type !== 'prometheus' || victoria.url !== 'http://victoriametrics:8428')
    throw new Error('existing Victoria datasource type/URL changed');
  return hashValue({
    sources: retainedSources.sort((left, right) => left.uid.localeCompare(right.uid)),
    dashboards: retainedDashboards.sort((left, right) => left.uid.localeCompare(right.uid)),
  });
}

/** Capture only proven absence of both new UIDs and the existing datasource/dashboard inventory. Persist before apply. */
export async function captureGrafana(api: GrafanaApi): Promise<GrafanaJournal> {
  const baseline = await captureInventory(api);
  // Proof: removing collision guard fails each preexisting owned UID negative.
  if (
    (await api(`/api/datasources/uid/${sourceUid}`)) !== null ||
    (await api(`/api/dashboards/uid/${dashboardUid}`)) !== null
  )
    throw new Error('Grafana owned UID collision');
  return {
    schema: 1,
    owner: 'puni-dev-observability',
    baseline,
    phase: 'captured',
    datasourceHash: null,
    dashboardHash: null,
  };
}
async function assertBaseline(api: GrafanaApi, journal: GrafanaJournal): Promise<void> {
  // Proof: removing baseline check admits changed baseline before apply and rollback.
  if ((await captureInventory(api)) !== journal.baseline)
    throw new Error('Grafana captured baseline changed');
}
async function readOwnedHash(api: GrafanaApi, kind: 'datasource' | 'dashboard'): Promise<string> {
  const reply = await api(
    kind === 'datasource'
      ? `/api/datasources/uid/${sourceUid}`
      : `/api/dashboards/uid/${dashboardUid}`,
  );
  if (kind === 'dashboard') {
    const parsed = DashboardReply.assert(reply);
    // Proof: provisioned-owned-object negative fails without this guard.
    if (parsed.meta.provisioned) throw new Error('Grafana owned dashboard became provisioned');
    return hashValue(parsed.dashboard);
  }
  return hashValue(ObjectShape.assert(reply));
}

/**
 * Add two objects with overwrite=false; save each observed receipt before the next mutation.
 * On error stop immediately. A save/read failure after creation requires manual reconciliation,
 * never blind retry/delete. Caller owns an exclusive durable journal and serializes operators.
 */
export async function applyGrafana(
  api: GrafanaApi,
  journal: GrafanaJournal,
  saveJournal: SaveJournal,
): Promise<GrafanaJournal> {
  // Proof: removing phase guard fails repeated-apply negative.
  if (
    journal.phase !== 'captured' ||
    journal.datasourceHash !== null ||
    journal.dashboardHash !== null
  )
    throw new Error('Grafana apply requires untouched captured journal');
  await assertBaseline(api, journal);
  await captureGrafana(api);
  const artifacts = renderDevGrafana();
  await api('/api/datasources', 'POST', artifacts.datasource);
  let saved: GrafanaJournal = {
    ...journal,
    phase: 'datasource-created',
    datasourceHash: await readOwnedHash(api, 'datasource'),
  };
  await saveJournal(saved);
  await api('/api/dashboards/db', 'POST', {
    dashboard: artifacts.dashboard,
    overwrite: false,
    message: 'Puni dev owned additive integration',
  });
  saved = { ...saved, phase: 'applied', dashboardHash: await readOwnedHash(api, 'dashboard') };
  await saveJournal(saved);
  await assertBaseline(api, saved);
  return saved;
}

/** Refuses edited or missing owned objects before any delete; partial apply can roll back its recorded datasource. */
export async function rollbackGrafana(
  api: GrafanaApi,
  journal: GrafanaJournal,
  saveJournal: SaveJournal,
): Promise<GrafanaJournal> {
  // Proof: removing rollback-phase guard fails captured-journal rollback negative.
  if (!['datasource-created', 'applied', 'dashboard-removed'].includes(journal.phase))
    throw new Error('Grafana rollback requires created-object receipts');
  await assertBaseline(api, journal);
  // Proof: removing receipt checks admits edited owned datasource/dashboard negatives.
  if (
    journal.datasourceHash === null ||
    (await readOwnedHash(api, 'datasource')) !== journal.datasourceHash ||
    (journal.phase === 'applied' &&
      (journal.dashboardHash === null ||
        (await readOwnedHash(api, 'dashboard')) !== journal.dashboardHash))
  )
    throw new Error('Grafana owned objects changed or receipt missing');
  // Proof: removing this guard lets partial rollback leave an unrecorded dashboard while claiming completion.
  if (journal.phase !== 'applied' && (await api(`/api/dashboards/uid/${dashboardUid}`)) !== null)
    throw new Error('Grafana unrecorded owned dashboard requires manual reconciliation');
  let saved = journal;
  if (journal.phase === 'applied') {
    await api(`/api/dashboards/uid/${dashboardUid}`, 'DELETE');
    // Proof: removing absence verification fails successful-delete-acknowledgement dashboard negative.
    if ((await api(`/api/dashboards/uid/${dashboardUid}`)) !== null)
      throw new Error('Grafana owned dashboard still exists after delete');
    saved = { ...journal, phase: 'dashboard-removed', dashboardHash: null };
    await saveJournal(saved);
  }
  await api(`/api/datasources/uid/${sourceUid}`, 'DELETE');
  // Proof: removing absence verification fails successful-delete-acknowledgement datasource negative.
  if ((await api(`/api/datasources/uid/${sourceUid}`)) !== null)
    throw new Error('Grafana owned datasource still exists after delete');
  saved = { ...saved, phase: 'removed', datasourceHash: null };
  await saveJournal(saved);
  await assertBaseline(api, saved);
  return saved;
}
