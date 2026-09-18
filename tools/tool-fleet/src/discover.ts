import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { parse } from 'yaml';

import {
  type Capability,
  type Cluster,
  decodeFleet,
  type Fleet,
  type FleetNode,
  readToolchain,
} from './contracts';
import {
  type LabProviderInventory,
  type LabProviderSource,
  labSshDiscoveryArguments,
  observeLabProvider,
  readLabDiscoveryHosts,
  requireLabFleet,
  requireLabNodes,
} from './lab-provider';
import {
  digestObservation,
  type DiscoverySource,
  type FleetObservation,
  type ObservedNode,
  type ObservedNodeState,
} from './observation';

export interface DiscoveryCommand {
  readonly source: DiscoverySource;
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly timeoutMs: number;
}

export interface DiscoveryResponse {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly observedAt: string;
}

export type RunDiscoveryCommand = (command: DiscoveryCommand) => Promise<DiscoveryResponse>;

class DiscoveryCommandFailure extends Error {
  public constructor(
    message: string,
    public readonly stderr: string,
  ) {
    super(message);
  }
}

class ControllerCommandFailure extends Error {}

interface ProviderHost {
  readonly clusterId: string;
  readonly displayName: string;
  readonly instanceId: string;
  readonly privateAddress: string;
}

interface SshHost {
  readonly displayName: string;
  readonly machineId: string;
  readonly address: string;
  readonly source: DiscoverySource;
}

interface KubernetesNode {
  readonly displayName: string;
  readonly uid: string;
  readonly providerId?: string;
  readonly machineId?: string;
  readonly ready: boolean;
  readonly capabilities: readonly Capability[];
  readonly capabilitiesObserved: boolean;
}

interface PersistentVolumeClaim {
  readonly key: string;
  readonly volumeName?: string;
}

interface PersistentVolume {
  readonly name: string;
  readonly claimKey?: string;
}

interface ObserveOptions {
  readonly root: string;
  readonly run?: RunDiscoveryCommand;
  readonly now?: () => Date;
  readonly maxSourceAgeMs?: number;
  readonly timeoutMs?: number;
  /** Selects the local {@link LabProviderSource}; never valid for a production fleet. */
  readonly labProvider?: LabProviderSource;
  /** Reads the lab provider inventory; tests replace the process observation. */
  readonly observeLab?: (source: LabProviderSource) => Promise<LabProviderInventory>;
}

function buildControllerCommand(
  command: DiscoveryCommand,
  root: string,
  image: string,
  digest: string,
): DiscoveryCommand {
  // Proof: invoking the logical executable directly made the production CLI fixture bypass the
  // digest-locked controller; its Docker invocation assertion failed under that mutation.
  const controllerArguments: string[] = [
    'run',
    '--rm',
    '--network',
    'host',
    '--volume',
    `${root}:${root}:ro`,
    '--workdir',
    root,
  ];
  for (const name of ['HCLOUD_TOKEN', 'KUBECONFIG', 'SSH_AUTH_SOCK'] as const) {
    const value = process.env[name];
    if (value === undefined || value.length === 0) continue;
    controllerArguments.push('--env', name);
    if (name === 'KUBECONFIG') {
      for (const path of value.split(':'))
        controllerArguments.push('--volume', `${path}:${path}:ro`);
    }
    if (name === 'SSH_AUTH_SOCK') controllerArguments.push('--volume', `${value}:${value}`);
  }
  // Proof: omitting the in-container timeout made the production Docker invocation assertion fail;
  // it bounds the workload even if killing a disconnected Docker client cannot stop the container.
  controllerArguments.push(
    `${image}@${digest}`,
    'timeout',
    '--signal=TERM',
    '--kill-after=0.1s',
    `${String(command.timeoutMs / 1000)}s`,
    command.executable,
    ...command.arguments,
  );
  return { ...command, executable: 'docker', arguments: controllerArguments };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function requireRecord(
  input: unknown,
  source: DiscoverySource,
  field: string,
): Record<string, unknown> {
  // Proof: bypassing this boundary made the provider-shape negative advance from `_meta: []` to
  // an unrelated missing-hostvars diagnostic instead of rejecting the malformed source object.
  if (!isRecord(input)) throw new Error(`${source} is missing object field ${field}`);
  return input;
}

function requireString(input: unknown, source: DiscoverySource, field: string): string {
  // Proof: accepting an absent string made the missing-node-UID and attachment-identity negatives
  // build observations with undefined external identities.
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error(`${source} is missing required field ${field}`);
  }
  return input;
}

function requireItems(input: unknown, source: DiscoverySource): readonly unknown[] {
  const document = requireRecord(input, source, 'document');
  // Proof: accepting a missing items list made the storage-list negative look like an empty API
  // success; restored decoding distinguishes malformed from valid empty output.
  if (!Array.isArray(document['items'])) throw new Error(`${source} is missing array field items`);
  return document['items'];
}

function parseJson(response: DiscoveryResponse, source: DiscoverySource): unknown {
  try {
    return JSON.parse(response.stdout);
  } catch (cause) {
    // Proof: replacing this contextual parse with raw JSON.parse made the malformed provider
    // production negative lose the source whose bytes could not be trusted.
    throw new Error(`${source} returned malformed JSON`, { cause });
  }
}

function requireFresh(
  response: DiscoveryResponse,
  source: DiscoverySource,
  now: Date,
  maxSourceAgeMs: number,
): void {
  const observedMilliseconds = Date.parse(response.observedAt);
  if (
    Number.isNaN(observedMilliseconds) ||
    observedMilliseconds > now.getTime() ||
    now.getTime() - observedMilliseconds > maxSourceAgeMs
  ) {
    // Proof: disabling this refusal made a two-minute-old provider snapshot authorize a complete
    // production observation under a thirty-second freshness budget.
    throw new Error(`${source} observation is stale: ${response.observedAt}`);
  }
}

async function readSource(
  command: DiscoveryCommand,
  run: RunDiscoveryCommand,
  now: () => Date,
  maxSourceAgeMs: number,
): Promise<DiscoveryResponse> {
  const response = await run(command);
  if (response.exitCode !== 0) {
    // Proof: disabling this status refusal made provider exit 42 decode as an empty fleet in the
    // production observer negative; restored handling names the source and stderr.
    throw new DiscoveryCommandFailure(
      `${command.source} failed with exit ${String(response.exitCode)}: ${response.stderr}`,
      response.stderr,
    );
  }
  if (
    command.executable === 'ansible-inventory' &&
    /(?:Failed to parse|Unable to parse|No inventory was parsed)/i.test(response.stderr)
  ) {
    // Proof: removing this diagnostic refusal made an ansible-inventory exit-0 plugin failure
    // decode as an empty provider fleet in the production observer negative on 2026-09-17.
    throw new Error(`${command.source} failed despite exit 0: ${response.stderr}`);
  }
  requireFresh(response, command.source, now(), maxSourceAgeMs);
  return response;
}

async function readJsonSource(
  command: DiscoveryCommand,
  run: RunDiscoveryCommand,
  now: () => Date,
  maxSourceAgeMs: number,
): Promise<{ readonly input: unknown; readonly observedAt: string }> {
  const response = await readSource(command, run, now, maxSourceAgeMs);
  return { input: parseJson(response, command.source), observedAt: response.observedAt };
}

function parseProviderHosts(input: unknown, source: DiscoverySource): readonly ProviderHost[] {
  const document = requireRecord(input, source, 'document');
  const meta = requireRecord(document['_meta'], source, '_meta');
  const hostvars = requireRecord(meta['hostvars'], source, '_meta.hostvars');
  return Object.entries(hostvars).map(([displayName, hostInput]) => {
    const host = requireRecord(hostInput, source, `_meta.hostvars.${displayName}`);
    return {
      displayName,
      clusterId: requireString(host['puni_cluster'], source, `${displayName}.puni_cluster`),
      instanceId: requireString(
        host['puni_instance_id'],
        source,
        `${displayName}.puni_instance_id`,
      ),
      privateAddress: requireString(
        host['puni_private_ipv4'],
        source,
        `${displayName}.puni_private_ipv4`,
      ),
    };
  });
}

function parseSshHosts(input: unknown, source: DiscoverySource): readonly SshHost[] {
  const document = requireRecord(input, source, 'document');
  // Proof: treating a missing hosts list as empty made the SSH-facts negative mark the desired
  // machine missing instead of reporting partial identity observation.
  if (!Array.isArray(document['hosts'])) throw new Error(`${source} is missing array field hosts`);
  return document['hosts'].map((hostInput, position) => {
    const host = requireRecord(hostInput, source, `hosts[${String(position)}]`);
    return {
      displayName: requireString(host['name'], source, `hosts[${String(position)}].name`),
      machineId: requireString(host['machineId'], source, `hosts[${String(position)}].machineId`),
      address: requireString(host['address'], source, `hosts[${String(position)}].address`),
      source,
    };
  });
}

function parseSshOutput(stdout: string, source: DiscoverySource): readonly SshHost[] {
  try {
    const input: unknown = JSON.parse(stdout);
    return parseSshHosts(input, source);
  } catch (cause) {
    const marker = /PUNI_MACHINE_FACT=(\{(?:\\.|[^}\r\n])+\})/.exec(stdout);
    if (marker?.[1] !== undefined) {
      let markerInput: unknown;
      try {
        markerInput = JSON.parse(marker[1].replaceAll('\\"', '"')) as unknown;
      } catch (parseCause) {
        throw new Error(`${source} emitted a malformed machine identity fact`, {
          cause: parseCause,
        });
      }
      const markerFact = requireRecord(markerInput, source, 'machine identity fact');
      return [
        {
          displayName: requireString(markerFact['name'], source, 'machine identity fact.name'),
          machineId: requireString(
            markerFact['machineId'],
            source,
            'machine identity fact.machineId',
          ),
          address: requireString(markerFact['address'], source, 'machine identity fact.address'),
          source,
        },
      ];
    }
    const match =
      /TASK \[Emit fleet machine fact\][\s\S]*?ok: \[[^\]]+\] => \{\s*"msg": (\{[\s\S]*?\})\s*\}\s*PLAY RECAP/.exec(
        stdout,
      );
    const encoded = match?.[1];
    if (encoded === undefined) {
      // Proof: removing this refusal made the missing-hosts production negative report a desired
      // machine as absent after Ansible returned no controlled identity fact.
      throw new Error(`${source} did not emit the controlled machine identity fact`, { cause });
    }
    let factInput: unknown;
    try {
      factInput = JSON.parse(encoded);
    } catch (parseCause) {
      // Proof: bypassing this contextual refusal made a malformed controlled Ansible fact surface
      // as raw JSON syntax instead of naming the SSH discovery source.
      throw new Error(`${source} emitted a malformed machine identity fact`, {
        cause: parseCause,
      });
    }
    const fact = requireRecord(factInput, source, 'machine identity fact');
    return [
      {
        displayName: requireString(fact['name'], source, 'machine identity fact.name'),
        machineId: requireString(fact['machineId'], source, 'machine identity fact.machineId'),
        address: requireString(fact['address'], source, 'machine identity fact.address'),
        source,
      },
    ];
  }
}

function parseCapabilities(
  labelsInput: unknown,
  source: DiscoverySource,
): { readonly values: readonly Capability[]; readonly observed: boolean } {
  if (labelsInput === undefined) return { values: [], observed: false };
  const labels = requireRecord(labelsInput, source, 'metadata.labels');
  const prefix = 'puni.dev/capability-';
  const capabilityLabels = Object.entries(labels).filter(([key]) => key.startsWith(prefix));
  if (capabilityLabels.length === 0) return { values: [], observed: false };
  const decoded = new Set<Capability>();
  for (const [key, enabled] of capabilityLabels) {
    const value = key.slice(prefix.length);
    if (enabled !== 'true') {
      // Proof: accepting a false-valued capability label made production discovery report a
      // capability that k3s had not enabled on the node.
      throw new Error(`${source} has non-true observed capability label: ${key}`);
    }
    switch (value) {
      case 'control-plane':
      case 'product':
      case 'ingress':
      case 'observability':
      case 'forge':
      case 'execution':
        decoded.add(value);
        break;
      default:
        // Proof: accepting this value made the observed-capability negative attach `database` to a
        // production observation outside the desired capability vocabulary.
        throw new Error(`${source} has unknown observed capability: ${value}`);
    }
  }
  const capabilityOrder: readonly Capability[] = [
    'control-plane',
    'product',
    'ingress',
    'observability',
    'forge',
    'execution',
  ];
  return {
    values: capabilityOrder.filter((capability) => decoded.has(capability)),
    observed: true,
  };
}

function parseKubernetesNodes(input: unknown, source: DiscoverySource): readonly KubernetesNode[] {
  return requireItems(input, source).map((nodeInput, position) => {
    const node = requireRecord(nodeInput, source, `items[${String(position)}]`);
    const metadata = requireRecord(node['metadata'], source, `items[${String(position)}].metadata`);
    const spec = requireRecord(node['spec'], source, `items[${String(position)}].spec`);
    const status = requireRecord(node['status'], source, `items[${String(position)}].status`);
    const conditions = status['conditions'];
    if (!Array.isArray(conditions)) {
      // Proof: treating missing conditions as not-ready made the node-conditions negative hide a
      // partial Kubernetes object as a modeled readiness result.
      throw new Error(
        `${source} is missing required field items[${String(position)}].status.conditions`,
      );
    }
    const ready = conditions.some(
      (conditionInput) =>
        isRecord(conditionInput) &&
        conditionInput['type'] === 'Ready' &&
        conditionInput['status'] === 'True',
    );
    const nodeInfo = requireRecord(
      status['nodeInfo'],
      source,
      `items[${String(position)}].status.nodeInfo`,
    );
    const providerId = spec['providerID'];
    const machineId = nodeInfo['machineID'];
    const capabilities = parseCapabilities(metadata['labels'], source);
    return {
      displayName: requireString(
        metadata['name'],
        source,
        `items[${String(position)}].metadata.name`,
      ),
      uid: requireString(metadata['uid'], source, `items[${String(position)}].metadata.uid`),
      ...(providerId === undefined
        ? {}
        : {
            providerId: requireString(
              providerId,
              source,
              `items[${String(position)}].spec.providerID`,
            ),
          }),
      ...(machineId === undefined
        ? {}
        : {
            machineId: requireString(
              machineId,
              source,
              `items[${String(position)}].status.nodeInfo.machineID`,
            ),
          }),
      ready,
      capabilities: capabilities.values,
      capabilitiesObserved: capabilities.observed,
    };
  });
}

function parseAttachments(
  input: unknown,
  source: DiscoverySource,
  volumes: ReadonlyMap<string, PersistentVolume>,
  claims: ReadonlyMap<string, PersistentVolumeClaim>,
): ReadonlyMap<string, readonly string[]> {
  const attachments = new Map<string, string[]>();
  const names = new Set<string>();
  for (const [position, attachmentInput] of requireItems(input, source).entries()) {
    const attachment = requireRecord(attachmentInput, source, `items[${String(position)}]`);
    const metadata = requireRecord(
      attachment['metadata'],
      source,
      `items[${String(position)}].metadata`,
    );
    const spec = requireRecord(attachment['spec'], source, `items[${String(position)}].spec`);
    const attachmentSource = requireRecord(
      spec['source'],
      source,
      `items[${String(position)}].spec.source`,
    );
    const nodeName = requireString(
      spec['nodeName'],
      source,
      `items[${String(position)}].spec.nodeName`,
    );
    const name = requireString(
      metadata['name'],
      source,
      `items[${String(position)}].metadata.name`,
    );
    // Proof: allowing a duplicate attachment name made two source rows masquerade as distinct
    // storage evidence in the production observer negative.
    if (names.has(name)) throw new Error(`${source} duplicates volume attachment ${name}`);
    names.add(name);
    const volumeName = requireString(
      attachmentSource['persistentVolumeName'],
      source,
      `items[${String(position)}].spec.source.persistentVolumeName`,
    );
    const volume = volumes.get(volumeName);
    if (volume === undefined) {
      // Proof: accepting an unobserved PV let a partial storage response become a complete node
      // attachment in the production observer negative.
      throw new Error(`${source} references unobserved persistent volume ${volumeName}`);
    }
    const claim = volume.claimKey === undefined ? undefined : claims.get(volume.claimKey);
    if (volume.claimKey !== undefined && claim?.volumeName !== volumeName) {
      // Proof: accepting a missing or mismatched PVC let an attachment discard its claim owner in
      // the production observer negative.
      throw new Error(`${source} cannot verify bound claim ${volume.claimKey} for ${volumeName}`);
    }
    const held = attachments.get(nodeName) ?? [];
    held.push(
      volume.claimKey === undefined
        ? `pv:${volume.name}#volumeattachment:${name}`
        : `pvc:${volume.claimKey}@pv:${volume.name}#volumeattachment:${name}`,
    );
    attachments.set(nodeName, held);
  }
  return attachments;
}

function parseClaims(
  input: unknown,
  source: DiscoverySource,
): ReadonlyMap<string, PersistentVolumeClaim> {
  const claims = new Map<string, PersistentVolumeClaim>();
  for (const [position, claimInput] of requireItems(input, source).entries()) {
    const claim = requireRecord(claimInput, source, `items[${String(position)}]`);
    const metadata = requireRecord(
      claim['metadata'],
      source,
      `items[${String(position)}].metadata`,
    );
    const spec = requireRecord(claim['spec'], source, `items[${String(position)}].spec`);
    const key = `${requireString(metadata['namespace'], source, `items[${String(position)}].metadata.namespace`)}/${requireString(metadata['name'], source, `items[${String(position)}].metadata.name`)}`;
    if (claims.has(key)) {
      // Proof: allowing map overwrite made a duplicate PVC identity hide one storage observation.
      throw new Error(`${source} duplicates persistent volume claim ${key}`);
    }
    const volumeName = spec['volumeName'];
    claims.set(key, {
      key,
      ...(volumeName === undefined
        ? {}
        : {
            volumeName: requireString(
              volumeName,
              source,
              `items[${String(position)}].spec.volumeName`,
            ),
          }),
    });
  }
  return claims;
}

function parseVolumes(
  input: unknown,
  source: DiscoverySource,
): ReadonlyMap<string, PersistentVolume> {
  const volumes = new Map<string, PersistentVolume>();
  for (const [position, volumeInput] of requireItems(input, source).entries()) {
    const volume = requireRecord(volumeInput, source, `items[${String(position)}]`);
    const metadata = requireRecord(
      volume['metadata'],
      source,
      `items[${String(position)}].metadata`,
    );
    const spec = requireRecord(volume['spec'], source, `items[${String(position)}].spec`);
    const name = requireString(
      metadata['name'],
      source,
      `items[${String(position)}].metadata.name`,
    );
    if (volumes.has(name)) {
      // Proof: allowing map overwrite made a duplicate PV identity hide one storage observation.
      throw new Error(`${source} duplicates persistent volume ${name}`);
    }
    const claimInput = spec['claimRef'];
    let claimKey: string | undefined;
    if (claimInput !== undefined) {
      const claim = requireRecord(claimInput, source, `items[${String(position)}].spec.claimRef`);
      claimKey = `${requireString(claim['namespace'], source, `items[${String(position)}].spec.claimRef.namespace`)}/${requireString(claim['name'], source, `items[${String(position)}].spec.claimRef.name`)}`;
    }
    volumes.set(name, { name, ...(claimKey === undefined ? {} : { claimKey }) });
  }
  return volumes;
}

function identifyProvider(node: FleetNode): string {
  return node.provider.kind === 'hcloud'
    ? `hcloud:${node.provider.instanceId}`
    : `ssh:${node.provider.machineId}`;
}

function identifyKubernetesProvider(node: KubernetesNode): string | undefined {
  if (node.providerId?.startsWith('hcloud://')) return `hcloud:${node.providerId.slice(9)}`;
  return node.machineId === undefined ? undefined : `ssh:${node.machineId}`;
}

function buildDiscoveryCommand(
  root: string,
  cluster: Cluster,
  kind: 'provider' | 'nodes' | 'pvcs' | 'pvs' | 'volumeattachments',
  timeoutMs: number,
): DiscoveryCommand {
  const inventory = join(root, `infra/ansible/inventory/${cluster.purpose}.hcloud.yml`);
  if (kind === 'provider') {
    return {
      source: `provider:${cluster.id}`,
      executable: 'ansible-inventory',
      arguments: ['--inventory', inventory, '--list'],
      timeoutMs,
    };
  }
  // Proof: the first live lab discovery passed the source kind `pvs` to kubectl, which exited
  // "the server doesn't have a resource type"; restoring `pvs` fails the resource-name assertion
  // in `lab-provider.test.ts`.
  const resource = {
    nodes: 'nodes',
    pvcs: 'persistentvolumeclaims',
    pvs: 'persistentvolumes',
    volumeattachments: 'volumeattachments',
  }[kind];
  return {
    source: `kubernetes-${kind}:${cluster.id}`,
    executable: 'kubectl',
    arguments: [
      '--context',
      cluster.id,
      'get',
      resource,
      ...(kind === 'pvcs' ? ['-A'] : []),
      '-o',
      'json',
    ],
    timeoutMs,
  };
}

function buildSshDiscoveryCommand(
  root: string,
  cluster: Cluster,
  nodeId: string,
  provider: { readonly kind: 'ssh'; readonly address: string; readonly machineId: string },
  timeoutMs: number,
): DiscoveryCommand {
  return {
    source: `ssh-facts:${cluster.id}/${nodeId}`,
    executable: 'ansible-playbook',
    arguments: [
      join(root, 'infra/ansible/playbooks/discover.yml'),
      '--inventory',
      `${provider.address},`,
      '--extra-vars',
      JSON.stringify({ puni_display_name: nodeId }),
    ],
    timeoutMs,
  };
}

/** Execute one bounded read-only discovery command. */
export async function runDiscoveryCommand(command: DiscoveryCommand): Promise<DiscoveryResponse> {
  const observedAt = new Date().toISOString();
  const child = Bun.spawn([command.executable, ...command.arguments], {
    detached: true,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const completed = Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).then(([exitCode, stdout, stderr]) => ({ exitCode, stdout, stderr, observedAt }));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      try {
        // Proof: killing only the direct shell let a signal-ignoring descendant retain the output
        // pipes for over one second after a 100ms production timeout.
        process.kill(-child.pid, 'SIGKILL');
      } catch (cause) {
        reject(
          new Error(`${command.source} timed out and its process group could not be killed`, {
            cause,
          }),
        );
        return;
      }
      reject(new Error(`${command.source} timed out after ${String(command.timeoutMs)}ms`));
    }, command.timeoutMs);
  });
  try {
    return await Promise.race([completed, expired]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** Observe every required provider, Kubernetes, storage, and machine-identity source. */
export async function observeFleet(
  fleet: Fleet,
  options: ObserveOptions,
): Promise<FleetObservation> {
  let run = options.run;
  if (run === undefined) {
    const toolchain = await readToolchain(join(options.root, 'infra/versions/toolchain.json'));
    run = async (command) => {
      const response = await runDiscoveryCommand(
        buildControllerCommand(
          command,
          options.root,
          toolchain.controller.image,
          toolchain.controller.digest,
        ),
      );
      if ([125, 126, 127].includes(response.exitCode)) {
        // Proof: treating Docker exit 125 with a registry i/o timeout as a Kubernetes API absence
        // made the production bootstrap command emit a complete not-bootstrapped observation.
        throw new ControllerCommandFailure(
          `Controller failed while reading ${command.source} with exit ${String(response.exitCode)}: ${response.stderr}`,
        );
      }
      return response;
    };
  }
  const now = options.now ?? (() => new Date());
  const maxSourceAgeMs = options.maxSourceAgeMs ?? 30_000;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const sources: { name: DiscoverySource; observedAt: string }[] = [];
  const observedNodes: ObservedNode[] = [];
  const observedClusters: { id: string; state: 'ready' | 'not-bootstrapped' }[] = [];
  const observedStorage: {
    clusterId: string;
    claims: string[];
    volumes: string[];
    attachments: string[];
  }[] = [];
  const providerOwners = new Map<string, string>();
  const kubernetesOwners = new Map<string, string>();

  for (const cluster of fleet.clusters) {
    const providerCommand = buildDiscoveryCommand(options.root, cluster, 'provider', timeoutMs);
    const labProvider = options.labProvider;
    let labRunning: ReadonlySet<string> | undefined;
    let providerHosts: readonly ProviderHost[] = [];
    if (labProvider === undefined) {
      const providerSource = await readJsonSource(providerCommand, run, now, maxSourceAgeMs);
      sources.push({ name: providerCommand.source, observedAt: providerSource.observedAt });
      providerHosts = parseProviderHosts(providerSource.input, providerCommand.source);
    } else {
      requireLabNodes(fleet, cluster, labProvider, await readLabDiscoveryHosts(labProvider));
      const observedAt = now().toISOString();
      const inventory = await (options.observeLab ?? observeLabProvider)(labProvider);
      // Proof: recording lab inventory as `provider:` let a lab observation plan like hcloud; the
      // lab-provider test now requires the distinct source name.
      sources.push({ name: `lab-provider:${cluster.id}`, observedAt });
      labRunning = new Set(inventory.running);
    }
    for (const host of providerHosts) {
      if (host.clusterId !== cluster.id) {
        // Proof: disabling this refusal made the provider-cluster negative merge a workers host
        // into the platform snapshot returned by the platform selector.
        throw new Error(
          `${providerCommand.source} returned host ${host.displayName} for ${host.clusterId}`,
        );
      }
      const identity = `hcloud:${host.instanceId}`;
      const owner = providerOwners.get(identity);
      if (owner !== undefined) {
        // Proof: allowing map overwrite made duplicate provider identities silently select the
        // last display name in a complete production observation.
        throw new Error(
          `${providerCommand.source} duplicates provider identity ${identity} from ${owner}`,
        );
      }
      providerOwners.set(identity, `${cluster.id}/${host.displayName}`);
    }

    const nodeCommand = buildDiscoveryCommand(options.root, cluster, 'nodes', timeoutMs);
    let kubernetesNodes: readonly KubernetesNode[];
    try {
      const nodeResponse = await readSource(nodeCommand, run, now, maxSourceAgeMs);
      const nodeSource = {
        input: parseJson(nodeResponse, nodeCommand.source),
        observedAt: nodeResponse.observedAt,
      };
      sources.push({ name: nodeCommand.source, observedAt: nodeSource.observedAt });
      kubernetesNodes = parseKubernetesNodes(nodeSource.input, nodeCommand.source);
    } catch (cause) {
      const desiredNodes = fleet.nodes.filter(({ cluster: clusterId }) => clusterId === cluster.id);
      if (
        cluster.bootstrap === 'required' &&
        desiredNodes.length === 0 &&
        providerHosts.length === 0 &&
        cause instanceof DiscoveryCommandFailure &&
        /(?:connection refused|no such host|i\/o timeout|context deadline exceeded)/i.test(
          cause.stderr,
        )
      ) {
        // Proof: widening this recovery to every nonzero command made Kubernetes Forbidden become
        // complete/not-bootstrapped; recovery requires an explicit reachability absence plus all
        // three empty-bootstrap facts.
        observedClusters.push({ id: cluster.id, state: 'not-bootstrapped' });
        observedStorage.push({ clusterId: cluster.id, claims: [], volumes: [], attachments: [] });
        continue;
      }
      throw cause;
    }

    const pvcCommand = buildDiscoveryCommand(options.root, cluster, 'pvcs', timeoutMs);
    const pvCommand = buildDiscoveryCommand(options.root, cluster, 'pvs', timeoutMs);
    const attachmentCommand = buildDiscoveryCommand(
      options.root,
      cluster,
      'volumeattachments',
      timeoutMs,
    );
    const [pvcSource, pvSource, attachmentSource] = await Promise.all([
      readJsonSource(pvcCommand, run, now, maxSourceAgeMs),
      readJsonSource(pvCommand, run, now, maxSourceAgeMs),
      readJsonSource(attachmentCommand, run, now, maxSourceAgeMs),
    ]);
    sources.push(
      { name: pvcCommand.source, observedAt: pvcSource.observedAt },
      { name: pvCommand.source, observedAt: pvSource.observedAt },
      { name: attachmentCommand.source, observedAt: attachmentSource.observedAt },
    );
    const claims = parseClaims(pvcSource.input, pvcCommand.source);
    const volumes = parseVolumes(pvSource.input, pvCommand.source);
    const attachments = parseAttachments(
      attachmentSource.input,
      attachmentCommand.source,
      volumes,
      claims,
    );
    observedStorage.push({
      clusterId: cluster.id,
      claims: [...claims.values()]
        .map(({ key, volumeName }) => `${key}->${volumeName ?? 'unbound'}`)
        .sort(),
      volumes: [...volumes.values()]
        .map(({ name, claimKey }) => `${name}->${claimKey ?? 'unclaimed'}`)
        .sort(),
      attachments: [...attachments.values()].flat().sort(),
    });
    const sshHosts: SshHost[] = [];
    for (const node of fleet.nodes) {
      if (node.cluster !== cluster.id || node.provider.kind !== 'ssh') continue;
      // The lab provider's observed absence is the modeled `missing`, as for a deleted server.
      // Proof: removing this skip made `reports a machine the lab provider saw stop as missing
      // without reading its SSH facts` issue the stopped machine's SSH-fact command.
      if (labRunning !== undefined && !labRunning.has(node.id)) continue;
      const sshCommand =
        labProvider === undefined
          ? buildSshDiscoveryCommand(options.root, cluster, node.id, node.provider, timeoutMs)
          : {
              source: `ssh-facts:${cluster.id}/${node.id}` as const,
              executable: 'ansible-playbook',
              arguments: labSshDiscoveryArguments(options.root, labProvider, node.id),
              timeoutMs,
            };
      const sshSource = await readSource(sshCommand, run, now, maxSourceAgeMs);
      sources.push({ name: sshCommand.source, observedAt: sshSource.observedAt });
      sshHosts.push(...parseSshOutput(sshSource.stdout, sshCommand.source));
    }

    const providers = new Map<string, ProviderHost | SshHost>();
    for (const host of providerHosts) providers.set(`hcloud:${host.instanceId}`, host);
    for (const host of sshHosts) {
      const identity = `ssh:${host.machineId}`;
      const owner = providerOwners.get(identity);
      if (owner !== undefined) {
        // Proof: disabling this SSH identity refusal made two controlled fact sources overwrite one
        // machine identity in the production observer negative.
        throw new Error(`${cluster.id} duplicates provider identity ${identity} from ${owner}`);
      }
      providerOwners.set(identity, `${cluster.id}/${host.displayName}`);
      providers.set(identity, host);
    }
    const nodesByProvider = new Map<string, KubernetesNode>();
    for (const node of kubernetesNodes) {
      const identity = identifyKubernetesProvider(node);
      if (identity === undefined) {
        // Proof: omitting this refusal made an identity-free Kubernetes node disappear from an
        // otherwise complete production observation.
        throw new Error(
          `${nodeCommand.source} node ${node.displayName} has no provider or machine identity`,
        );
      }
      const owner = kubernetesOwners.get(identity);
      if (owner !== undefined)
        // Proof: allowing map overwrite made duplicate Kubernetes identities silently select the
        // final node in the production observer negative.
        throw new Error(
          `${nodeCommand.source} duplicates Kubernetes identity ${identity} from ${owner}`,
        );
      kubernetesOwners.set(identity, `${cluster.id}/${node.displayName}`);
      nodesByProvider.set(identity, node);
    }

    const desiredNodes = fleet.nodes.filter(({ cluster: clusterId }) => clusterId === cluster.id);
    const reported = new Set<string>();
    for (const desiredNode of desiredNodes) {
      const identity = identifyProvider(desiredNode);
      reported.add(identity);
      const provider = providers.get(identity);
      const kubernetesNode = nodesByProvider.get(identity);
      if (provider === undefined) {
        const missingStates: ObservedNodeState[] =
          desiredNode.lifecycle === 'draining' ? ['retiring', 'missing'] : ['missing'];
        if (kubernetesNode !== undefined) {
          missingStates.push(kubernetesNode.ready ? 'ready' : 'not-ready');
        }
        observedNodes.push({
          clusterId: cluster.id,
          desiredNodeId: desiredNode.id,
          displayName: desiredNode.id,
          providerIdentity: identity,
          identitySource:
            kubernetesNode === undefined
              ? desiredNode.provider.kind === 'hcloud'
                ? providerCommand.source
                : `ssh-facts:${cluster.id}/${desiredNode.id}`
              : nodeCommand.source,
          ...(kubernetesNode === undefined
            ? {}
            : {
                kubernetesNodeUid: kubernetesNode.uid,
                ...(kubernetesNode.providerId === undefined
                  ? {}
                  : { kubernetesProviderId: kubernetesNode.providerId }),
              }),
          capabilities: kubernetesNode?.capabilities ?? [],
          capabilitiesObserved: kubernetesNode?.capabilitiesObserved ?? false,
          states: missingStates,
          storageAttachments:
            kubernetesNode === undefined ? [] : (attachments.get(kubernetesNode.displayName) ?? []),
        });
        continue;
      }
      const displayName = provider.displayName;
      const states: ObservedNodeState[] = desiredNode.lifecycle === 'draining' ? ['retiring'] : [];
      if (kubernetesNode === undefined) {
        states.push('discovered-unenrolled');
      } else {
        states.push('enrolled', kubernetesNode.ready ? 'ready' : 'not-ready');
      }
      observedNodes.push({
        clusterId: cluster.id,
        desiredNodeId: desiredNode.id,
        displayName,
        providerIdentity: identity,
        identitySource: 'privateAddress' in provider ? providerCommand.source : provider.source,
        ...('privateAddress' in provider
          ? { privateAddress: provider.privateAddress }
          : { privateAddress: provider.address, machineId: provider.machineId }),
        ...(kubernetesNode === undefined
          ? {}
          : {
              kubernetesNodeUid: kubernetesNode.uid,
              ...(kubernetesNode.providerId === undefined
                ? {}
                : { kubernetesProviderId: kubernetesNode.providerId }),
            }),
        capabilities: kubernetesNode?.capabilities ?? [],
        capabilitiesObserved: kubernetesNode?.capabilitiesObserved ?? false,
        states,
        storageAttachments:
          kubernetesNode === undefined ? [] : (attachments.get(kubernetesNode.displayName) ?? []),
      });
    }
    for (const identity of new Set([...providers.keys(), ...nodesByProvider.keys()])) {
      if (reported.has(identity)) continue;
      const provider = providers.get(identity);
      const kubernetesNode = nodesByProvider.get(identity);
      if (provider === undefined && kubernetesNode === undefined) continue;
      const states: ObservedNodeState[] = [];
      if (provider === undefined) states.push('missing');
      if (kubernetesNode === undefined) states.push('discovered-unenrolled');
      else states.push('enrolled', kubernetesNode.ready ? 'ready' : 'not-ready');
      observedNodes.push({
        clusterId: cluster.id,
        displayName: provider?.displayName ?? kubernetesNode?.displayName ?? identity,
        providerIdentity: identity,
        identitySource:
          provider === undefined
            ? nodeCommand.source
            : 'privateAddress' in provider
              ? providerCommand.source
              : provider.source,
        ...(provider === undefined
          ? {}
          : 'privateAddress' in provider
            ? { privateAddress: provider.privateAddress }
            : { privateAddress: provider.address, machineId: provider.machineId }),
        ...(kubernetesNode === undefined
          ? {}
          : {
              kubernetesNodeUid: kubernetesNode.uid,
              ...(kubernetesNode.providerId === undefined
                ? {}
                : { kubernetesProviderId: kubernetesNode.providerId }),
            }),
        capabilities: kubernetesNode?.capabilities ?? [],
        capabilitiesObserved: kubernetesNode?.capabilitiesObserved ?? false,
        states,
        storageAttachments:
          kubernetesNode === undefined ? [] : (attachments.get(kubernetesNode.displayName) ?? []),
      });
    }
    observedClusters.push({ id: cluster.id, state: 'ready' });
  }

  // Proof: omitting final revalidation let early provider evidence age past the source budget
  // while later sequential discovery still emitted a fresh complete snapshot.
  for (const source of sources)
    requireFresh(
      { exitCode: 0, stdout: '', stderr: '', observedAt: source.observedAt },
      source.name,
      now(),
      maxSourceAgeMs,
    );

  const body = {
    schemaVersion: 1 as const,
    desiredRevision: fleet.revision,
    observedAt: now().toISOString(),
    complete: true as const,
    sources: sources.sort((left, right) => left.name.localeCompare(right.name)),
    clusters: observedClusters,
    storage: observedStorage,
    nodes: observedNodes,
  };
  const digest = digestObservation(body);
  return { ...body, digest };
}

function readDiscoveryFlags(argv: readonly string[]): ReadonlyMap<string, string> {
  const flags = new Map<string, string>();
  if (argv.length % 2 !== 0) {
    // Proof: removing this refusal made the valueless-flag production CLI negative advance with an
    // undefined timeout value instead of naming the incomplete argument.
    throw new Error(`Fleet discover flag has no value: ${String(argv.at(-1))}`);
  }
  for (let position = 0; position < argv.length; position += 2) {
    const flag = argv[position];
    const value = argv[position + 1];
    if (!flag.startsWith('--')) {
      // Proof: disabling this refusal made the positional-argument production CLI negative reach
      // the allowlist and lose the malformed argument position.
      throw new Error(`Invalid fleet discover argument at position ${String(position + 1)}`);
    }
    if (flags.has(flag)) {
      // Proof: disabling this refusal made the duplicate-flag production CLI negative silently use
      // the last fleet path instead of preserving the reviewed input.
      throw new Error(`Duplicate fleet discover flag: ${flag}`);
    }
    flags.set(flag, value);
  }
  for (const flag of flags.keys()) {
    if (
      !['--fleet', '--output', '--max-source-age-ms', '--timeout-ms', '--lab-state'].includes(flag)
    ) {
      // Proof: disabling this refusal made the unknown-flag production CLI negative persist an
      // observation while ignoring unreviewed input.
      throw new Error(`Unexpected fleet discover flag: ${flag}`);
    }
  }
  return flags;
}

function requiredDiscoveryFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.length === 0) {
    // Proof: disabling this refusal made the missing-fleet production CLI negative reach a raw file
    // error without identifying the absent required flag.
    throw new Error(`Missing required ${name}`);
  }
  return value;
}

function positiveMilliseconds(
  flags: ReadonlyMap<string, string>,
  name: string,
  fallback: number,
): number {
  const value = flags.get(name);
  if (value === undefined) return fallback;
  const milliseconds = Number(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    // Proof: disabling this refusal made the zero-age production CLI negative accept a meaningless
    // freshness or timeout budget.
    throw new Error(`${name} must be a positive integer`);
  }
  return milliseconds;
}

/** Run read-only fleet discovery and exclusively persist its digest-bearing observation. */
export async function runDiscover(argv: readonly string[], root: string): Promise<void> {
  const flags = readDiscoveryFlags(argv);
  const fleetPath = requiredDiscoveryFlag(flags, '--fleet');
  const outputPath = requiredDiscoveryFlag(flags, '--output');
  let fleetSource: string;
  try {
    fleetSource = await readFile(fleetPath, 'utf8');
  } catch (cause) {
    // Proof: removing this context made the absent-fleet production CLI negative expose raw ENOENT
    // without naming the required state boundary.
    throw new Error(`Cannot read required fleet at ${fleetPath}`, { cause });
  }
  let fleetInput: unknown;
  try {
    fleetInput = parse(fleetSource);
  } catch (cause) {
    // Proof: removing this context made the malformed-fleet production CLI negative expose only the
    // YAML parser diagnostic without its required fleet path.
    throw new Error(`Required fleet at ${fleetPath} is malformed YAML`, { cause });
  }
  const fleet = decodeFleet(fleetInput);
  const labState = flags.get('--lab-state');
  if (labState !== undefined) requireLabFleet(fleet, fleetPath, root);
  const observation = await observeFleet(fleet, {
    root,
    maxSourceAgeMs: positiveMilliseconds(flags, '--max-source-age-ms', 30_000),
    timeoutMs: positiveMilliseconds(flags, '--timeout-ms', 30_000),
    ...(labState === undefined ? {} : { labProvider: { stateDirectory: resolve(labState) } }),
  });
  try {
    await writeFile(outputPath, `${JSON.stringify(observation, undefined, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (cause) {
    // Proof: replacing exclusive creation with ordinary write made the occupied-output production
    // CLI negative overwrite a reviewed observation; restored creation preserves its bytes.
    throw new Error(`Cannot create new fleet observation at ${outputPath}`, { cause });
  }
  process.stdout.write(
    `fleet observation: ${String(observation.nodes.length)} nodes, ${String(observation.sources.length)} complete sources\nobservation sha256: ${observation.digest}\n`,
  );
}
