import { createHash } from 'node:crypto';
import { readdir, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { type RunDocker, runDockerBefore } from './docker-deadline';
import { orderMounts } from './docker-inventory';
import {
  assertDependencyOwner,
  captureOwnedSiteFile,
  type DependencyOwner,
  type OwnedSiteFile,
  ownerDockerHashed,
  publishOwnedSiteFile,
  retainIngressRecord,
} from './edge-ownership';
import { EDGE_CONTAINER, type EnvLayout } from './env';
import { readFields, readInteger, readRecord, readString } from './managed-cohort';

const BODY = 'WBS dependency maintenance';
interface EdgeIdentity {
  id: string;
  snapshot: unknown;
  directory: string;
}
interface IngressReceipt {
  edge: EdgeIdentity;
  layouts: readonly EnvLayout[];
  files: OwnedSiteFile[];
  expected: unknown;
  publication: string;
  contents: string;
}
const receipts = new WeakMap<DependencyOwner, IngressReceipt>();
/**
 * Raw parser excerpts can disclose credentials; retained private hashes identify malformed observations.
 * Proof: bypassing this scrub exposed the sentinel in malformed-inspect production output (exit 1).
 */
function parsePrivateJson(contents: string): unknown {
  try {
    const parsed: unknown = JSON.parse(contents);
    return parsed;
  } catch {
    throw new Error('dependency ingress private JSON is malformed; evidence retained');
  }
}
function parseConfiguration(contents: string): unknown {
  try {
    const configuration: unknown = JSON.parse(contents);
    readFields(configuration);
    return configuration;
  } catch {
    throw new Error('dependency ingress configuration is malformed; private evidence retained');
  }
}
async function snapshotDirectory(directory: string): Promise<OwnedSiteFile[]> {
  if ((await realpath(directory)) !== directory)
    throw new Error('dependency ingress directory is not canonical');
  const names = (await readdir(directory)).sort();
  return Promise.all(names.map((name) => captureOwnedSiteFile(join(directory, name))));
}
function requiredFile(files: OwnedSiteFile[], path: string): OwnedSiteFile {
  const file = files.find((file) => file.path === path);
  if (file === undefined)
    throw new Error('dependency ingress required configuration file is absent');
  return file;
}
async function inspectEdge(call: RunDocker, expectedId?: string): Promise<EdgeIdentity> {
  const inspected = parsePrivateJson(await call(['inspect', expectedId ?? EDGE_CONTAINER]));
  if (!Array.isArray(inspected) || inspected.length !== 1)
    throw new Error('dependency ingress requires one exact shared edge');
  const container = readFields(inspected[0]);
  const id = readString(container['Id']);
  const state = readFields(container['State']);
  const image = readString(container['Image']);
  const config = readFields(container['Config']);
  const environment = config['Env'];
  const startedAt = readString(state['StartedAt']);
  // Proof: omitted immutable config validation; missing-Env production negative returned success (exit 1).
  if (
    !/^sha256:[a-f0-9]{64}$/.test(image) ||
    !Array.isArray(environment) ||
    environment.some((entry: unknown) => typeof entry !== 'string') ||
    !Number.isFinite(Date.parse(startedAt))
  )
    throw new Error('dependency ingress edge immutable image/process/config identity is malformed');
  const mounts = container['Mounts'];
  // Proof: omitting full-ID/startup guards admitted partial-ID and resume-startup production negatives (exit 1 each).
  if (
    !/^[a-f0-9]{64}$/.test(id) ||
    (expectedId !== undefined && id !== expectedId) ||
    container['Name'] !== `/${EDGE_CONTAINER}` ||
    container['Path'] !== 'caddy' ||
    !isDeepStrictEqual(container['Args'], [
      'run',
      '--config',
      '/etc/caddy/Caddyfile',
      '--adapter',
      'caddyfile',
    ]) ||
    state['Running'] !== true ||
    state['Paused'] !== false ||
    state['Restarting'] !== false ||
    readInteger(state['Pid']) <= 0 ||
    !Array.isArray(mounts)
  )
    throw new Error('dependency ingress edge identity/startup is unsupported');
  const orderedMounts = orderMounts(mounts);
  const caddyMounts = orderedMounts
    .map(readFields)
    .filter(
      (mount) =>
        mount['Destination'] === '/etc/caddy' ||
        (typeof mount['Destination'] === 'string' &&
          mount['Destination'].startsWith('/etc/caddy/')),
    );
  const mount = caddyMounts.at(0);
  // Proof: removing read-only bind validation admitted writable /etc/caddy in foreign-bind negative (exit 1).
  if (
    caddyMounts.length !== 1 ||
    mount?.['Destination'] !== '/etc/caddy' ||
    mount['Type'] !== 'bind' ||
    mount['RW'] !== false
  )
    throw new Error('dependency ingress requires one fixed read-only /etc/caddy bind');
  const directory = readString(mount['Source']);
  if ((await realpath(directory)) !== directory)
    throw new Error('dependency ingress edge bind is not canonical');
  return {
    id,
    directory,
    snapshot: {
      Id: id,
      Image: image,
      Path: container['Path'],
      Args: container['Args'],
      // Proof: restoring raw Config leaked the Caddy environment sentinel; combined owner composition failed.
      configSha256: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
      // Proof: native-ingress-order omission refused the Caddy native permutation positive.
      Mounts: orderedMounts,
      State: state,
    },
  };
}
function readMatches(route: Record<string, unknown>): string[] {
  const matches = route['match'];
  if (!Array.isArray(matches)) return [];
  return matches.flatMap((matcher: unknown) => {
    const hosts = readFields(matcher)['host'];
    return Array.isArray(hosts) ? hosts.map(readString) : [];
  });
}
function selectRoutes(
  configuration: unknown,
  hosts: readonly string[],
): { projection: unknown; selected: Map<string, Record<string, unknown>> } {
  const selected = new Map<string, Record<string, unknown>>();
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (value === null || typeof value !== 'object') return value;
    const record = readFields(value);
    const matched = readMatches(record);
    const host = matched.find((host) => hosts.includes(host));
    if (host !== undefined) {
      const matches = record['match'];
      if (
        matched.length !== 1 ||
        !Array.isArray(matches) ||
        matches.length !== 1 ||
        Object.keys(readFields(matches[0])).join() !== 'host' ||
        selected.has(host)
      )
        throw new Error('dependency ingress selected host match is ambiguous');
      selected.set(host, record);
      return { selectedMaintenanceHost: host };
    }
    return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, visit(child)]));
  }
  const projection = visit(configuration);
  if (selected.size !== hosts.length)
    throw new Error('dependency ingress selected host routes are absent');
  return { projection, selected };
}
function assertMaintenance(route: Record<string, unknown>): void {
  const handlers: Record<string, unknown>[] = [];
  function visit(value: unknown, outer = false): void {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = readFields(value);
    if (!outer && record['match'] !== undefined)
      throw new Error('dependency ingress maintenance has conditional routes');
    if (typeof record['handler'] === 'string' && record['handler'] !== 'subroute')
      handlers.push(record);
    for (const [key, child] of Object.entries(record)) if (key !== 'match') visit(child);
  }
  visit(route, true);
  const response = handlers.at(0);
  if (
    handlers.length !== 1 ||
    response?.['handler'] !== 'static_response' ||
    response['status_code'] !== 503 ||
    response['body'] !== BODY
  )
    throw new Error('dependency ingress actual selected host is not whole-site maintenance');
}
function createCall(
  owner: DependencyOwner,
  layout: EnvLayout,
  runDocker: RunDocker,
  deadline: number,
): RunDocker {
  // Proof: restoring raw Docker readbacks leaked Caddy environment bytes; combined owner composition failed.
  const guarded = ownerDockerHashed(owner, layout, async (args, signal) => {
    try {
      return await runDocker(args, signal);
    } catch {
      // Docker/Caddy error bodies can contain configuration credentials; private owner intent identifies the failed operation.
      throw new Error('dependency ingress Docker boundary failed; retain private owner evidence');
    }
  });
  return (args) => runDockerBefore(args, guarded, deadline);
}
function adapt(call: RunDocker, id: string): Promise<string> {
  return call([
    'exec',
    id,
    'caddy',
    'adapt',
    '--config',
    '/etc/caddy/Caddyfile',
    '--adapter',
    'caddyfile',
  ]);
}
function admin(call: RunDocker, id: string): Promise<string> {
  return call(['exec', id, 'wget', '-qO-', 'http://127.0.0.1:2019/config/']);
}
async function assertFiles(files: OwnedSiteFile[], directory: string): Promise<void> {
  // Proof: omitted file equality; pre-publication and fresh-disk drift negatives reached success/mutated selected file (exit 1).
  if (!isDeepStrictEqual(await snapshotDirectory(directory), files))
    throw new Error('dependency ingress persistent configuration changed');
}
/**
 * Persist only selected whole-site WBS maintenance and reload the captured full edge ID.
 * Private original/config evidence and owner intent precede all publication. Full adapted/live
 * equality and unrelated configuration preservation are mandatory. Every failure retains current
 * files and uncertainty; no shared Caddy stop/recreate, automatic restore or activation occurs.
 */
export async function fenceDependencyIngress(
  owner: DependencyOwner,
  layouts: readonly EnvLayout[],
  runDocker: RunDocker,
  deadline: number,
): Promise<void> {
  const layout = layouts.at(0);
  if (
    layout === undefined ||
    new Set(layouts.map((layout) => layout.siteAddress)).size !== layouts.length
  )
    throw new Error('dependency ingress requires unique selected sites');
  for (const selected of layouts) {
    await assertDependencyOwner(owner, selected);
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(selected.siteAddress))
      throw new Error('dependency ingress host is unsupported');
  }
  const call = createCall(owner, layout, runDocker, deadline);
  const edge = await inspectEdge(call);
  if (layouts.some((selected) => dirname(selected.siteCaddyPath) !== edge.directory))
    throw new Error('dependency ingress site files are outside captured edge bind');
  const files = await snapshotDirectory(edge.directory);
  const root = requiredFile(files, join(edge.directory, 'Caddyfile'));
  requiredFile(files, join(edge.directory, 'log-redact.caddy'));
  for (const selected of layouts) {
    requiredFile(files, selected.siteCaddyPath);
    const imported = selected.env === 'prod' ? 'site.caddy' : 'site-dev.caddy';
    // Proof: omitted root import validation; missing-persistent-import negative replaced the selected file (exit 1).
    if (
      !root.contents.split('\n').some((line) => line.trim() === `import ${imported}`) ||
      !root.contents.split('\n').some((line) => line.trim() === 'import log-redact.caddy')
    )
      throw new Error(
        'dependency ingress persistent root does not import selected site and redaction',
      );
  }
  const adapted = parseConfiguration(await adapt(call, edge.id));
  const live = parseConfiguration(await admin(call, edge.id));
  // Proof: omitted disk/live equality; live-drift negative changed the selected file before refusing later (exit 1).
  if (!isDeepStrictEqual(adapted, live))
    throw new Error('dependency ingress persistent/live configuration differs before mutation');
  const hosts = layouts.map((selected) => selected.siteAddress);
  const original = selectRoutes(live, hosts);
  // Proof: restoring raw adapted/live configuration leaked the expanded credential sentinel; combined composition failed.
  await retainIngressRecord(owner, layout, 'original', {
    edge,
    files,
    adaptedSha256: createHash('sha256').update(JSON.stringify(adapted)).digest('hex'),
    liveSha256: createHash('sha256').update(JSON.stringify(live)).digest('hex'),
  });
  await retainIngressRecord(owner, layout, 'intent', {
    edge,
    sites: layouts.map((selected) => selected.siteCaddyPath),
    hosts,
  });
  if (!isDeepStrictEqual(await inspectEdge(call, edge.id), edge))
    throw new Error('dependency ingress edge changed before publication');
  await assertFiles(files, edge.directory);
  for (const selected of layouts) {
    const previous = requiredFile(files, selected.siteCaddyPath);
    const published = await publishOwnedSiteFile(
      owner,
      selected,
      previous,
      `${selected.siteAddress} {\n\trespond "${BODY}" 503\n\timport access-log\n}\n`,
    );
    files.splice(files.indexOf(previous), 1, published);
  }
  const expected = parseConfiguration(await adapt(call, edge.id));
  const closure = selectRoutes(expected, hosts);
  // Proof: omitted actual-route validation; adapted-route drift reached reload and failed the no-reload assertion (exit 1).
  for (const route of closure.selected.values()) assertMaintenance(route);
  // Proof: omitted unrelated projection equality; changed-registry adaptation reached reload (exit 1).
  if (!isDeepStrictEqual(original.projection, closure.projection))
    throw new Error('dependency ingress unrelated configuration would change');
  await assertFiles(files, edge.directory);
  if (!isDeepStrictEqual(await inspectEdge(call, edge.id), edge))
    throw new Error('dependency ingress edge changed before reload');
  await call([
    'exec',
    edge.id,
    'caddy',
    'reload',
    '--config',
    '/etc/caddy/Caddyfile',
    '--adapter',
    'caddyfile',
  ]);
  const current = parseConfiguration(await admin(call, edge.id));
  // Proof: omitted exact admin readback; unrelated live drift after reload returned success despite selected 503 (exit 1).
  if (!isDeepStrictEqual(current, expected))
    throw new Error('dependency ingress reload did not establish exact live maintenance');
  const closed = selectRoutes(current, hosts);
  for (const route of closed.selected.values()) assertMaintenance(route);
  if (!isDeepStrictEqual(await inspectEdge(call, edge.id), edge))
    throw new Error('dependency ingress edge changed after reload');
  await assertFiles(files, edge.directory);
  const record = { edge, layouts, files, expected };
  // Proof: restoring raw expected configuration leaked the expanded credential sentinel; combined composition failed.
  const publication = await retainIngressRecord(owner, layout, 'complete', {
    edge,
    layouts,
    files,
    expectedSha256: createHash('sha256').update(JSON.stringify(expected)).digest('hex'),
  });
  receipts.set(owner, { ...record, publication: publication.path, contents: publication.contents });
}
/** Fresh owner-bound inspection; retained JSON alone cannot recreate this live capability. */
export async function inspectDependencyIngress(
  owner: DependencyOwner,
  layouts: readonly EnvLayout[],
  runDocker: RunDocker,
  deadline: number,
): Promise<void> {
  const receipt = receipts.get(owner);
  const layout = layouts.at(0);
  if (receipt === undefined || layout === undefined || !isDeepStrictEqual(receipt.layouts, layouts))
    throw new Error('dependency ingress has no live owner receipt');
  for (const selected of layouts) await assertDependencyOwner(owner, selected);
  // Proof: omitted retained byte equality; fresh receipt-drift negative returned success (exit 1).
  if ((await readRecord(receipt.publication)) !== receipt.contents)
    throw new Error('dependency ingress retained receipt changed');
  const call = createCall(owner, layout, runDocker, deadline);
  if (!isDeepStrictEqual(await inspectEdge(call, receipt.edge.id), receipt.edge))
    throw new Error('dependency ingress current edge identity differs');
  await assertFiles(receipt.files, receipt.edge.directory);
  if (
    !isDeepStrictEqual(parseConfiguration(await adapt(call, receipt.edge.id)), receipt.expected) ||
    !isDeepStrictEqual(parseConfiguration(await admin(call, receipt.edge.id)), receipt.expected)
  )
    throw new Error('dependency ingress fresh configuration differs');
}
