import { createHash } from 'node:crypto';

import { type RunDocker, runDockerBefore } from './docker-deadline';
import { EDGE_CONTAINER } from './env';

type Fields = Record<string, unknown>;
interface Process {
  pid: number;
  command: string;
}
interface Container {
  id: string;
  name: string;
  image: string;
  running: boolean;
  inspectionSha256: string;
  networkIds: string[];
  processes: Process[];
}
interface Network {
  id: string;
  name: string;
  inspectionSha256: string;
}
/** Docker-only census, never a host-process census or an exclusion grant. */
export interface DependencyTopology {
  containers: Container[];
  networks: Network[];
  caddy: { containerId: string; configurationSha256: string; upstreams: string[] };
}

function readFields(value: unknown): Fields {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('dependency topology malformed object');
  // JSON object boundary excludes null and arrays; each property remains unknown.
  return value as Fields;
}
function readString(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error('dependency topology missing string');
  return value;
}
function readIdentity(value: unknown): string {
  const text = readString(value);
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error('dependency topology invalid identity');
  return text;
}
function hashInspection(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Docker inspect and Caddy admin responses can contain credentials; never echo parse excerpts.
    throw new Error('dependency topology malformed JSON');
  }
}
function parseIdentities(text: string): string[] {
  const listed = text.trim() === '' ? [] : text.trim().split('\n').map(readIdentity);
  if (new Set(listed).size !== listed.length)
    throw new Error('dependency topology duplicate inventory identity');
  return listed.sort();
}
function parseInventory(value: unknown, expected: string[]): Fields[] {
  if (!Array.isArray(value) || value.length !== expected.length)
    throw new Error('dependency topology incomplete inventory');
  const records = value.map(readFields);
  const observed = records.map((record) => readIdentity(record['Id'])).sort();
  if (JSON.stringify(observed) !== JSON.stringify(expected))
    throw new Error('dependency topology inventory identity mismatch');
  return records.sort((left, right) =>
    readString(left['Id']).localeCompare(readString(right['Id'])),
  );
}
function parseProcesses(text: string): Process[] {
  const rows = text.trim().split('\n');
  if (rows.shift()?.trim().replace(/\s+/g, ' ') !== 'PID COMMAND' || rows.length === 0)
    throw new Error('dependency topology missing process inventory');
  const parsed = rows.map((row) => {
    const matched = /^\s*([1-9][0-9]*)\s+(\S+)\s*$/.exec(row);
    if (matched === null) throw new Error('dependency topology malformed process inventory');
    const pid = Number(matched[1]);
    if (!Number.isSafeInteger(pid))
      throw new Error('dependency topology malformed process identity');
    return { pid, command: readString(matched[2]) };
  });
  if (new Set(parsed.map((process) => process.pid)).size !== parsed.length)
    throw new Error('dependency topology duplicate process identity');
  return parsed.sort((left, right) => left.pid - right.pid);
}
function parseUpstreams(value: unknown): string[] {
  const targets = new Set<string>();
  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
    } else if (node !== null && typeof node === 'object') {
      const record = readFields(node);
      const handler = record['handler'];
      if (
        handler !== undefined &&
        ![
          'reverse_proxy',
          'subroute',
          'headers',
          'authentication',
          'vars',
          'file_server',
          'encode',
          'static_response',
          'rewrite',
          'map',
          'error',
          'tracing',
          'metrics',
          'push',
          'invoke',
          'request_body',
          'intercept',
        ].includes(readString(handler))
      )
        throw new Error('dependency topology unresolved Caddy handler');
      if (handler === 'reverse_proxy') {
        const transport = record['transport'];
        // Proof: omitting transport admission accepted an unrecognized forwarding module.
        if (
          transport !== undefined &&
          (Object.keys(readFields(transport)).length !== 1 ||
            readFields(transport)['protocol'] !== 'http')
        )
          throw new Error('dependency topology unresolved proxy transport');
        if (
          Object.hasOwn(record, 'dynamic_upstreams') ||
          !Array.isArray(record['upstreams']) ||
          record['upstreams'].length === 0
        )
          throw new Error('dependency topology unresolved dynamic upstream');
        for (const entry of record['upstreams']) {
          const dial = readString(readFields(entry)['dial']);
          if (
            !/^[A-Za-z0-9][A-Za-z0-9_.-]*:[1-9][0-9]{0,4}$/.test(dial) ||
            Number(dial.slice(dial.lastIndexOf(':') + 1)) > 65535
          )
            throw new Error('dependency topology unresolved upstream address');
          targets.add(dial);
        }
      }
      for (const child of Object.values(record)) visit(child);
    }
  }
  const root = readFields(value);
  const apps = readFields(root['apps']);
  if (Object.keys(apps).some((name) => !['http', 'tls', 'pki', 'events'].includes(name)))
    throw new Error('dependency topology unresolved Caddy application');
  readFields(readFields(apps['http'])['servers']);
  visit(root);
  if (targets.size === 0) throw new Error('dependency topology missing upstream census');
  return [...targets].sort();
}

/**
 * Read-only full Docker/network/process and live Caddy census. Caller owns the deploy lock.
 * Hashes bind complete sensitive inspections without returning their environments or Caddy credentials.
 * Unknown upstream resolution, source-run dev and incomplete inventory throw; this establishes no exclusion.
 */
export async function inspectDependencyTopology(
  runDocker: RunDocker,
  deadline: number = performance.now() + 60000,
): Promise<DependencyTopology> {
  const run = async (args: string[]): Promise<string> =>
    await runDockerBefore(args, runDocker, deadline);
  const listed = parseIdentities(await run(['ps', '-a', '--no-trunc', '--format', '{{.ID}}']));
  const records =
    listed.length === 0 ? [] : parseInventory(parseJson(await run(['inspect', ...listed])), listed);
  const listedNetworks = parseIdentities(await run(['network', 'ls', '--no-trunc', '--quiet']));
  const networkRecords =
    listedNetworks.length === 0
      ? []
      : parseInventory(
          parseJson(await run(['network', 'inspect', ...listedNetworks])),
          listedNetworks,
        );
  const containers: Container[] = [];
  const addresses = new Map<string, Map<string, Set<string>>>();
  function addAddress(address: string, id: string, networkId: string): void {
    let owners = addresses.get(address);
    if (owners === undefined) {
      owners = new Map();
      addresses.set(address, owners);
    }
    let networks = owners.get(id);
    if (networks === undefined) {
      networks = new Set();
      owners.set(id, networks);
    }
    networks.add(networkId);
  }
  for (const record of records) {
    const id = readIdentity(record['Id']);
    const name = readString(record['Name']);
    if (!/^\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name))
      throw new Error('dependency topology malformed container name');
    // Proof: removing this guard admitted source-run dev in the production census negative.
    if (name === '/wbs-dev-src')
      throw new Error(
        'dependency topology source-run dev includes unresolved MCP and process participants',
      );
    const image = readString(record['Image']);
    if (!/^sha256:[a-f0-9]{64}$/.test(image))
      throw new Error('dependency topology malformed image identity');
    const state = readFields(record['State']);
    if (typeof state['Running'] !== 'boolean')
      throw new Error('dependency topology malformed process state');
    readFields(readFields(record['HostConfig'])['RestartPolicy']);
    readFields(record['Config']);
    const networks = readFields(readFields(record['NetworkSettings'])['Networks']);
    for (const network of Object.values(networks)) {
      const endpoint = readFields(network);
      const networkId = readIdentity(endpoint['NetworkID']);
      addAddress(name.slice(1), id, networkId);
      if (!listedNetworks.includes(networkId))
        throw new Error('dependency topology missing attached network');
      for (const key of ['IPAddress', 'GlobalIPv6Address']) {
        const address = endpoint[key];
        if (typeof address === 'string' && address !== '') addAddress(address, id, networkId);
      }
      const aliases = endpoint['Aliases'];
      if (aliases !== null && aliases !== undefined) {
        if (!Array.isArray(aliases))
          throw new Error('dependency topology malformed network aliases');
        for (const alias of aliases) addAddress(readString(alias), id, networkId);
      }
    }
    const processTable = state['Running']
      ? parseProcesses(await run(['top', id, '-eo', 'pid,comm']))
      : [];
    const pid = state['Pid'];
    // Proof: removing this association admitted a census omitting the inspected init PID.
    if (
      typeof pid !== 'number' ||
      !Number.isSafeInteger(pid) ||
      (state['Running'] ? !processTable.some((process) => process.pid === pid) : pid !== 0)
    )
      throw new Error('dependency topology process identity mismatch');
    containers.push({
      id,
      name,
      image,
      running: state['Running'],
      inspectionSha256: hashInspection(record),
      networkIds: Object.values(networks)
        .map((network) => readIdentity(readFields(network)['NetworkID']))
        .sort(),
      processes: processTable,
    });
  }
  for (const network of networkRecords) {
    readString(network['Name']);
    const endpoints = readFields(network['Containers']);
    for (const id of Object.keys(endpoints)) {
      // Proof: removing membership admitted an unknown network member in the production census negative.
      if (!listed.includes(readIdentity(id)))
        throw new Error('dependency topology foreign network participant');
    }
  }
  const edge = containers.filter((container) => container.name === `/${EDGE_CONTAINER}`);
  if (edge.length !== 1 || !edge[0]?.running)
    throw new Error('dependency topology missing live edge');
  const edgeId = readString(edge[0]?.id);
  const edgeRecord = records.find((record) => record['Id'] === edgeId);
  const edgeHost = readFields(readFields(edgeRecord)['HostConfig']);
  // Proof: omitting override admission accepted ExtraHosts, Dns, DnsOptions and DnsSearch faults.
  for (const key of ['ExtraHosts', 'Dns', 'DnsOptions', 'DnsSearch']) {
    const overrides = edgeHost[key];
    if (overrides !== null && (!Array.isArray(overrides) || overrides.length !== 0))
      throw new Error('dependency topology unresolved edge DNS or hosts override');
  }
  const config = parseJson(
    await run(['exec', edgeId, 'wget', '-qO-', 'http://127.0.0.1:2019/config/']),
  );
  const targets = parseUpstreams(config);
  // Proof: skipping this loop admitted an unresolved alternate upstream in the production census negative.
  for (const dial of targets) {
    const owners = addresses.get(dial.slice(0, dial.lastIndexOf(':')));
    const edgeNetworks = edge[0]?.networkIds;
    // Proof: dropping network scope accepted an alias advertised only on an edge-inaccessible network.
    const reachable =
      owners === undefined
        ? []
        : [...owners].filter(([, networks]) => edgeNetworks.some((id) => networks.has(id)));
    if (reachable.length !== 1)
      throw new Error('dependency topology unresolved or ambiguous upstream participant');
  }
  return {
    containers,
    networks: networkRecords.map((network) => ({
      id: readIdentity(network['Id']),
      name: readString(network['Name']),
      inspectionSha256: hashInspection(network),
    })),
    caddy: { containerId: edgeId, configurationSha256: hashInspection(config), upstreams: targets },
  };
}
