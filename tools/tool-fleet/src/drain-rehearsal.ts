import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { readToolchain } from './contracts';
import { readOperationJournal } from './journal';
import { readOrCreateClusterToken } from './lab';
import { planQemuMachine, qemuSshArguments } from './lab-qemu';
import { decodeOperationPlan } from './plan';
import { type CommandResponse, controllerRequest, runBoundedCommand } from './production-apply';

export interface DrainIdentity {
  readonly labId: string;
  readonly target: string;
  readonly targetUid: string;
  readonly namespace: string;
  readonly kubeconfigSha256: string;
  readonly toolchainSha256: string;
}
type DrainKind = 'local-pv' | 'forge-worktree' | 'singleton-sqlite' | 'pdb' | 'stateless';
const protectedKinds = ['local-pv', 'forge-worktree', 'singleton-sqlite', 'pdb'] as const;
const preflight = 'verify replacement capacity, storage topology, and backup status';
const eviction = 'evict workloads respecting disruption budgets';

function record(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('Rehearsal evidence must be an object');
  return Object.fromEntries(Object.entries(input));
}
function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing rehearsal ${key}`);
  return value;
}

function requireOwnedLab(identity: DrainIdentity): void {
  if (
    !/^f5-[a-f0-9]{6,24}$/.test(identity.labId) ||
    identity.target !== `puni-vm-${identity.labId}-workers-agent-1` ||
    identity.namespace !== `puni-f5-${identity.labId}` ||
    identity.targetUid.length === 0
  ) {
    // Proof: foreign namespace, target and lab-ID fixture negatives failed before this ownership boundary existed.
    throw new Error('Rehearsal identity is outside its generated owned lab');
  }
}

/** Reject incomplete, stale, or foreign evidence; success requires every protected case and idempotent retirement. */
export function requireDrainEvidence(input: unknown, identity: DrainIdentity, now: Date): void {
  requireOwnedLab(identity);
  const document = record(input);
  if (
    document['schemaVersion'] !== 1 ||
    Object.entries(identity).some(([key, value]) => document[key] !== value)
  ) {
    // Proof: removing the identity comparison accepted a foreign target UID in the evidence negative.
    throw new Error('Rehearsal evidence names another owned lab or target identity');
  }
  const instant = Date.parse(stringField(document, 'observedAt'));
  if (!Number.isFinite(instant) || instant > now.getTime() || now.getTime() - instant > 300_000) {
    // Proof: removing the age bound accepted yesterday's evidence in the freshness negative.
    throw new Error('Rehearsal evidence is stale or malformed');
  }
  const cases = document['cases'];
  if (!Array.isArray(cases) || cases.length !== protectedKinds.length)
    throw new Error('Rehearsal evidence lacks protected cases');
  for (const [position, kind] of protectedKinds.entries())
    requireProtectedCase(cases[position], kind, identity);
  const success = record(document['success']);
  if (
    success['state'] !== 'complete' ||
    success['receiptState'] !== 'retired' ||
    success['serviceActive'] !== false ||
    success['nodeAbsent'] !== true ||
    success['secondApplyUnchanged'] !== true
  ) {
    // Proof: removing second-apply equality accepted changed durable state in the idempotence negative.
    throw new Error('Rehearsal lacks successful idempotent stateless retirement');
  }
}

function requireProtectedCase(
  input: unknown,
  kind: (typeof protectedKinds)[number],
  identity: DrainIdentity,
): void {
  const phase = record(input);
  const before = record(phase['before']);
  const after = record(phase['after']);
  for (const key of [
    'podUid',
    'workloadUid',
    'serviceUid',
    'marker',
    'pvUid',
    'claimUid',
    'workloadSha256',
    'pvSha256',
  ]) {
    if (stringField(before, key) !== stringField(after, key)) {
      // Proof: removing this comparison accepted a changed marker and replacement Pod UID in the preservation negative.
      throw new Error(`${kind} lost preserved ${key}`);
    }
  }
  requireObservedRefusal(record(phase['refusal']), kind, identity, before);
  const completed = phase['completedEffects'];
  const expected = kind === 'pdb' ? [preflight, 'cordon node'] : [];
  if (!Array.isArray(completed) || JSON.stringify(completed) !== JSON.stringify(expected)) {
    // Proof: the injected completed cordon on a preflight refusal passed until this journal boundary was added.
    throw new Error(`${kind} journal completed unexpected effects`);
  }
  if (
    phase['kind'] !== kind ||
    typeof phase['exitCode'] !== 'number' ||
    phase['exitCode'] === 0 ||
    (kind === 'pdb' && phase['exitCode'] !== 1) ||
    phase['cordoned'] !== (kind === 'pdb') ||
    phase['serviceActive'] !== true ||
    phase['receiptAbsent'] !== true ||
    phase['journalState'] !== (kind === 'pdb' ? 'recoverable' : 'running') ||
    phase['failedEffect'] !== (kind === 'pdb' ? eviction : null) ||
    typeof phase['elapsedMs'] !== 'number' ||
    phase['elapsedMs'] <= 0 ||
    (kind === 'pdb' && phase['elapsedMs'] < 90_000) ||
    phase['elapsedMs'] > 180_000
  ) {
    // Proof: individually removing exit, cordon, service, receipt, journal-state, phase and deadline predicates made the corresponding injected evidence negative fail.
    throw new Error(`${kind} lacks the expected protected retirement refusal`);
  }
}

/** Decode the pinned default callback capture and preserve only the owned drain command streams. */
function readCapturedDrain(source: string, identity: DrainIdentity): string {
  const captures = [...source.matchAll(/FAILED! => (\{[^\r\n]*\})/g)];
  if (source.includes('FAILED! =>') && captures.length === 0)
    throw new Error('PDB refusal has malformed Ansible capture');
  let remainder = source;
  const streams: string[] = [];
  for (const capture of captures) {
    const encoded = capture[1];
    let command: Record<string, unknown>;
    try {
      command = record(JSON.parse(encoded));
    } catch (cause) {
      throw new Error('PDB refusal has malformed Ansible capture', { cause });
    }
    if (
      JSON.stringify(command['cmd']) !==
        JSON.stringify([
          'kubectl',
          '--context',
          'workers',
          'drain',
          identity.target,
          '--ignore-daemonsets',
          '--timeout=90s',
        ]) ||
      typeof command['stdout'] !== 'string' ||
      typeof command['stderr'] !== 'string'
    ) {
      // Proof: removing the comparator accepted the captured foreign node and 10m command in the complete-diagnostic collector negative.
      throw new Error('PDB refusal is not the owned drain command completion');
    }
    streams.push(command['stdout'], command['stderr']);
    remainder = remainder.replace(capture[0], '');
  }
  return [remainder.replaceAll('\\n', '\n').replaceAll('\\"', '"'), ...streams].join('\n');
}

function requireObservedRefusal(
  refusal: Record<string, unknown>,
  kind: (typeof protectedKinds)[number],
  identity: DrainIdentity,
  before: Record<string, unknown>,
): string {
  const raw = stringField(refusal, 'output');
  const output =
    kind === 'pdb'
      ? readCapturedDrain(raw, identity)
      : raw.replaceAll('\\n', '\n').replaceAll('\\"', '"');
  const podName = stringField(before, 'podName');
  const ownsDenial = (line: string) =>
    line.includes(`pods/"${podName}"`) &&
    line.includes(`-n "${identity.namespace}"`) &&
    line.includes("Cannot evict pod as it would violate the pod's disruption budget.");
  const timeout = `error when evicting pods/"${podName}" -n "${identity.namespace}": global timeout reached: 1m30s`;
  // Proof: removing this exact summary exception rejected the complete pinned kubectl diagnostic fixture.
  const summaries = new Set([
    timeout,
    `error: ${timeout}`,
    `error: unable to drain node "${identity.target}" due to error: ${timeout}, continuing command...`,
    `There are pending pods in node "${identity.target}" when an error occurred: ${timeout}`,
  ]);
  const lines = output.split('\n').map((line) => line.trim());
  let listsPendingNodes = false;
  let hasForeignPendingResource = false;
  for (const line of lines) {
    if (line === 'There are pending nodes to be drained:') listsPendingNodes = true;
    else if (listsPendingNodes && line !== '' && !line.startsWith('error:')) {
      // Proof: disabling this comparison accepted a foreign node appended to the pending-node list.
      if (line !== identity.target) hasForeignPendingResource = true;
    } else listsPendingNodes = false;
    if (
      (line.startsWith('pod/') && line !== `pod/${podName}`) ||
      (line.startsWith('There are pending pods in node ') && !summaries.has(line))
    )
      hasForeignPendingResource = true;
  }
  const hasControllerTimeout =
    /failed with exit 124|timed out after|Cannot terminate timed-out/.test(output);
  const hasTransportFailure = output
    .split('\n')
    .some(
      (line) =>
        /error when evicting|Unable to connect|connection.*(?:refused|failed)|TLS handshake|Unauthorized|Forbidden|Error from server|API.*(?:error|unavailable|failed)|error: (?:unable|failed|couldn't|connection|context deadline|the server)|Release operation lease.*failed/i.test(
          line,
        ) &&
        !ownsDenial(line) &&
        !summaries.has(line.trim()),
    );
  const expected =
    kind === 'local-pv'
      ? output.includes(`refused: ${identity.namespace} is local or pinned to ${identity.target}`)
      : kind === 'pdb'
        ? !hasForeignPendingResource &&
          !hasControllerTimeout &&
          !hasTransportFailure &&
          output.includes(`Retirement drain for ${identity.target} failed with exit 2`) &&
          /"rc"\s*:\s*1\b/.test(raw) &&
          output.includes(`evicting pod ${identity.namespace}/${podName}`) &&
          output
            .split('\n')
            .some(
              (line) =>
                line.includes(`pods/"${podName}"`) &&
                line.includes(`-n "${identity.namespace}"`) &&
                line.includes("Cannot evict pod as it would violate the pod's disruption budget."),
            )
        : output.includes(
            `refused: ${identity.namespace}/${podName} needs a maintenance transaction`,
          );
  if (!expected) {
    // Proof: removing this boundary made unrelated preflight/API failures and a timeout without owned PDB denial count as protection.
    throw new Error(`${kind} lacks an observed owned fixture refusal`);
  }
  return kind === 'local-pv'
    ? `refused: ${identity.namespace} is local or pinned to ${identity.target}`
    : kind === 'pdb'
      ? `Retirement drain for ${identity.target} failed with exit 2\n"rc": 1\nevicting pod ${identity.namespace}/${podName}\nerror when evicting pods/"${podName}" -n "${identity.namespace}": Cannot evict pod as it would violate the pod's disruption budget.`
      : `refused: ${identity.namespace}/${podName} needs a maintenance transaction`;
}

/** Collect a protected phase from actual apply output, actual journal progress and live snapshots; unrelated failures never count as a refusal. */
export function collectProtectedCase(
  identity: DrainIdentity,
  kind: (typeof protectedKinds)[number],
  before: DrainSnapshot,
  after: DrainSnapshot,
  command: CommandResponse,
  journal: {
    readonly state: string;
    readonly activeStep?: { readonly effect: string };
    readonly completedSteps: readonly { readonly effect: string }[];
  },
  attributes: {
    readonly cordoned: boolean;
    readonly serviceActive: boolean;
    readonly receiptAbsent: boolean;
    readonly elapsedMs: number;
  },
) {
  const phase = {
    kind,
    before,
    after,
    exitCode: command.exitCode,
    refusal: {
      output: requireObservedRefusal(
        { output: `${command.stdout}\n${command.stderr}` },
        kind,
        identity,
        record(before),
      ),
    },
    journalState: journal.state,
    completedEffects: journal.completedSteps.map((step) => step.effect),
    failedEffect: journal.activeStep === undefined ? null : journal.activeStep.effect,
    ...attributes,
  };
  requireProtectedCase(phase, kind, identity);
  return phase;
}

/** Read required evidence without converting absence, unreadability, or malformed bytes into a skipped case. */
export async function readDrainEvidence(
  path: string,
  identity: DrainIdentity,
  now: Date,
): Promise<unknown> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    // Proof: replacing the required read with empty JSON failed absence, directory-read and chmod-000 negatives.
    throw new Error(`Cannot read required drain evidence at ${path}`, { cause });
  }
  let document: unknown;
  try {
    document = JSON.parse(source);
  } catch (cause) {
    // Proof: substituting parsed empty state failed the truncated-JSON negative's required malformed-evidence diagnostic.
    throw new Error(`Malformed drain evidence at ${path}`, { cause });
  }
  requireDrainEvidence(document, identity, now);
  return document;
}

/** Build only controller-managed fixtures within the generated namespace; SQLite stores its marker in an actual database volume. */
export function buildDrainFixture(
  identity: DrainIdentity,
  kind: DrainKind,
  probeImage: string,
  sqliteImage: string,
  marker: string,
): unknown {
  requireOwnedLab(identity);
  if (!/^[a-f0-9]{32}$/.test(marker)) {
    // Proof: the shell-bearing marker fixture negative passed before this generated-marker boundary existed.
    throw new Error('Fixture marker is not a generated hexadecimal identity');
  }
  const labels = {
    app: 'protected-drain',
    'puni.dev/rehearsal': identity.labId,
    ...(kind === 'forge-worktree' || kind === 'singleton-sqlite'
      ? { [`puni.dev/${kind}`]: 'true' }
      : {}),
  };
  const metadata = { name: 'fixture', namespace: identity.namespace, labels };
  const sqlite = kind === 'singleton-sqlite';
  const local = kind === 'local-pv';
  const script = sqlite
    ? `import { Database } from 'bun:sqlite'; const db = new Database('/state/marker.sqlite', { create: true }); db.run('CREATE TABLE IF NOT EXISTS marker (value TEXT)'); db.run('INSERT INTO marker VALUES (?)', [${JSON.stringify(marker)}]); Bun.serve({ port: 8080, fetch() { return new Response(db.query('SELECT value FROM marker').get().value); } });`
    : `mkdir -p /state; printf '%s' '${marker}' > /state/marker; exec httpd -f -p 8080 -h /state`;
  return {
    apiVersion: 'v1',
    kind: 'List',
    items: [
      {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name: identity.namespace, labels: { 'puni.dev/rehearsal': identity.labId } },
      },
      ...(local
        ? [
            {
              apiVersion: 'v1',
              kind: 'PersistentVolume',
              metadata: { name: identity.namespace, labels },
              spec: {
                capacity: { storage: '16Mi' },
                accessModes: ['ReadWriteOnce'],
                persistentVolumeReclaimPolicy: 'Retain',
                storageClassName: '',
                local: { path: `/var/lib/puni-${identity.labId}` },
                nodeAffinity: {
                  required: {
                    nodeSelectorTerms: [
                      {
                        matchExpressions: [
                          {
                            key: 'kubernetes.io/hostname',
                            operator: 'In',
                            values: [identity.target],
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
            {
              apiVersion: 'v1',
              kind: 'PersistentVolumeClaim',
              metadata: { name: 'fixture', namespace: identity.namespace },
              spec: {
                accessModes: ['ReadWriteOnce'],
                resources: { requests: { storage: '16Mi' } },
                storageClassName: '',
                volumeName: identity.namespace,
              },
            },
          ]
        : []),
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata,
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: 'protected-drain' } },
          template: {
            metadata: { labels },
            spec: {
              nodeSelector: { 'puni.dev/capability-execution': 'true' },
              ...(sqlite ? { securityContext: { fsGroup: 1000 } } : {}),
              affinity: {
                nodeAffinity: {
                  ...(kind === 'stateless'
                    ? {}
                    : {
                        requiredDuringSchedulingIgnoredDuringExecution: {
                          nodeSelectorTerms: [
                            {
                              matchExpressions: [
                                {
                                  key: 'kubernetes.io/hostname',
                                  operator: 'In',
                                  values: [identity.target],
                                },
                              ],
                            },
                          ],
                        },
                      }),
                  preferredDuringSchedulingIgnoredDuringExecution: [
                    {
                      weight: 100,
                      preference: {
                        matchExpressions: [
                          {
                            key: 'kubernetes.io/hostname',
                            operator: 'In',
                            values: [identity.target],
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              containers: [
                {
                  name: 'fixture',
                  image: sqlite ? sqliteImage : probeImage,
                  command: sqlite ? ['bun', '-e', script] : ['sh', '-c', script],
                  ports: [{ containerPort: 8080 }],
                  readinessProbe: { httpGet: { path: sqlite ? '/' : '/marker', port: 8080 } },
                  ...(kind === 'stateless' || kind === 'pdb'
                    ? {}
                    : { volumeMounts: [{ name: 'state', mountPath: '/state' }] }),
                },
              ],
              ...(kind === 'stateless' || kind === 'pdb'
                ? {}
                : {
                    volumes: [
                      {
                        name: 'state',
                        ...(local
                          ? { persistentVolumeClaim: { claimName: 'fixture' } }
                          : { emptyDir: {} }),
                      },
                    ],
                  }),
            },
          },
        },
      },
      {
        apiVersion: 'v1',
        kind: 'Service',
        metadata,
        spec: { selector: { app: 'protected-drain' }, ports: [{ port: 8080, targetPort: 8080 }] },
      },
      ...(kind === 'pdb'
        ? [
            {
              apiVersion: 'policy/v1',
              kind: 'PodDisruptionBudget',
              metadata,
              spec: { minAvailable: 1, selector: { matchLabels: { app: 'protected-drain' } } },
            },
          ]
        : []),
    ],
  };
}

function sha256(source: string | Buffer): string {
  return createHash('sha256').update(source).digest('hex');
}
async function writeOwned(path: string, document: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}
async function isAbsent(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return true;
    throw new Error(`Cannot inspect required rehearsal artifact ${path}`, { cause });
  }
}

export interface DrainSnapshot {
  readonly podName: string;
  readonly podUid: string;
  readonly workloadUid: string;
  readonly serviceUid: string;
  readonly marker: string;
  readonly pvUid: string;
  readonly claimUid: string;
  readonly workloadSha256: string;
  readonly pvSha256: string;
}

/**
 * Collect the actual owned fixture state; the shared return type makes omitted preservation evidence a compile error.
 * Proof: removing claimUid failed the actual producer-to-collector test; the same omission fails the declared return type.
 */
export async function collectDrainSnapshot(
  identity: DrainIdentity,
  kind: DrainKind,
  expectsTarget: boolean,
  marker: string,
  k: (arguments_: readonly string[]) => Promise<string>,
): Promise<DrainSnapshot> {
  requireOwnedLab(identity);
  const { namespace, target } = identity;
  const pods = record(
    JSON.parse(
      await k(['-n', namespace, 'get', 'pods', '-l', 'app=protected-drain', '-o', 'json']),
    ),
  )['items'];
  if (!Array.isArray(pods) || pods.length !== 1)
    throw new Error('Fixture must have exactly one Pod');
  const pod = record(pods[0]);
  const metadata = record(pod['metadata']);
  if (!Array.isArray(metadata['ownerReferences']) || metadata['ownerReferences'].length === 0)
    throw new Error('Fixture Pod lacks a controller');
  if (metadata['namespace'] !== namespace)
    throw new Error('Fixture Pod belongs to another namespace');
  if (kind === 'forge-worktree' || kind === 'singleton-sqlite') {
    if (record(metadata['labels'])[`puni.dev/${kind}`] !== 'true')
      throw new Error('Fixture lacks its protected workload label');
  }
  const scheduled = stringField(record(pod['spec']), 'nodeName');
  if ((scheduled === target) !== expectsTarget)
    throw new Error(`Fixture Pod unexpectedly scheduled on ${scheduled}`);
  const workload = record(
    JSON.parse(await k(['-n', namespace, 'get', 'deployment', 'fixture', '-o', 'json'])),
  );
  const service = record(
    JSON.parse(await k(['-n', namespace, 'get', 'service', 'fixture', '-o', 'json'])),
  );
  const url = `http://fixture.${namespace}.svc:8080/${kind === 'singleton-sqlite' ? '' : 'marker'}`;
  const response = (
    await k([
      '-n',
      namespace,
      'exec',
      stringField(metadata, 'name'),
      '--',
      ...(kind === 'singleton-sqlite'
        ? ['bun', '-e', `console.log(await (await fetch(${JSON.stringify(url)})).text())`]
        : ['wget', '-qO-', url]),
    ])
  ).trim();
  if (response !== marker) throw new Error('Fixture service lost its persisted marker');
  const pv =
    kind === 'local-pv'
      ? record(JSON.parse(await k(['get', 'pv', namespace, '-o', 'json'])))
      : undefined;
  return {
    podName: stringField(metadata, 'name'),
    podUid: stringField(metadata, 'uid'),
    workloadUid: stringField(record(workload['metadata']), 'uid'),
    serviceUid: stringField(record(service['metadata']), 'uid'),
    marker: response,
    pvUid: pv === undefined ? 'not-applicable' : stringField(record(pv['metadata']), 'uid'),
    claimUid:
      kind === 'local-pv'
        ? stringField(
            record(
              record(JSON.parse(await k(['-n', namespace, 'get', 'pvc', 'fixture', '-o', 'json'])))[
                'metadata'
              ],
            ),
            'uid',
          )
        : 'not-applicable',
    workloadSha256: sha256(JSON.stringify(record(workload['spec']))),
    pvSha256: pv === undefined ? 'not-applicable' : sha256(JSON.stringify(record(pv['spec']))),
  };
}

/**
 * Exercise production plan/apply against an exclusively generated disposable workers lab.
 * Requires the locked rootless QEMU prefix, usable KVM and the locked Docker controller.
 * Failure retains the lab and numbered command diagnostics; the printed down command owns only this lab.
 */
export async function runDrainRehearsal(root: string, qemuPrefix: string): Promise<void> {
  await access('/dev/kvm', constants.R_OK | constants.W_OK);
  const labId = `f5-${randomBytes(6).toString('hex')}`;
  const state = join(root, '.puni/fleet-labs', `${labId}-workers`);
  const diagnostics = join(state, 'drain-rehearsal');
  await mkdir(diagnostics, { recursive: true, mode: 0o700 });
  const kubeconfig = join(state, 'kubeconfig');
  const environment = { ...process.env, KUBECONFIG: kubeconfig, HCLOUD_TOKEN: undefined };
  const originalKubeconfig = process.env['KUBECONFIG'];
  const originalToken = process.env['HCLOUD_TOKEN'];
  process.env['KUBECONFIG'] = kubeconfig;
  delete process.env['HCLOUD_TOKEN'];
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  let commandNumber = 0;
  const credentials: string[] = [];
  const redact = (source: string) =>
    credentials.reduce(
      (redacted, credential) => redacted.replaceAll(credential, '[lab-credential]'),
      source,
    );
  async function command(
    executable: string,
    arguments_: readonly string[],
    controller = false,
  ): Promise<CommandResponse> {
    const request = { executable, arguments: arguments_, environment };
    const invocation = controller
      ? controllerRequest(root, toolchain.controller.image, toolchain.controller.digest, request)
      : request;
    const outcome = await runBoundedCommand({ ...invocation, environment }, 30 * 60_000);
    const tokenPath = join(state, 'cluster-token');
    if (!(await isAbsent(tokenPath)))
      credentials.push(await readOrCreateClusterToken(state, false));
    commandNumber += 1;
    await writeOwned(join(diagnostics, `${String(commandNumber).padStart(4, '0')}.json`), {
      executable,
      arguments: arguments_,
      ...outcome,
      stdout: redact(outcome.stdout),
      stderr: redact(outcome.stderr),
    });
    return outcome;
  }
  async function must(
    executable: string,
    arguments_: readonly string[],
    controller = false,
  ): Promise<string> {
    const outcome = await command(executable, arguments_, controller);
    if (outcome.exitCode !== 0)
      throw new Error(
        `${executable} failed (${String(outcome.exitCode)}): ${outcome.stderr}\n${outcome.stdout}`,
      );
    return outcome.stdout;
  }
  const entrypoint = join(root, 'tools/tool-fleet/src/entrypoint.ts');
  const cli = (arguments_: readonly string[]) =>
    must(process.execPath, [entrypoint, ...arguments_]);
  const k = (arguments_: readonly string[]) =>
    must('kubectl', ['--kubeconfig', kubeconfig, '--context', 'workers', ...arguments_], true);
  const key = join(diagnostics, 'id_rehearsal');
  const prefix = `puni-vm-${labId}-workers-`;
  const target = `${prefix}agent-1`;
  const namespace = `puni-f5-${labId}`;
  const machine = planQemuMachine(state, prefix, target);
  const ssh = (arguments_: readonly string[]) =>
    must('ssh', [
      ...qemuSshArguments(machine, join(state, 'id_fleet_lab'), join(state, 'known_hosts')),
      ...arguments_,
    ]);
  let tunnel: ReturnType<typeof Bun.spawn> | undefined;
  try {
    await must('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', key]);
    await cli([
      'lab',
      'up',
      '--provider',
      'qemu',
      '--qemu-prefix',
      qemuPrefix,
      '--lab-id',
      labId,
      '--profile',
      'workers',
      '--ssh-public-key',
      `${key}.pub`,
      '--ssh-private-key',
      key,
    ]);
    const server = planQemuMachine(state, prefix, `${prefix}server-1`);
    tunnel = Bun.spawn(
      [
        'ssh',
        '-N',
        '-o',
        'ExitOnForwardFailure=yes',
        '-o',
        'ServerAliveInterval=15',
        '-L',
        `127.0.0.1:${String(server.apiPort)}:127.0.0.1:6443`,
        ...qemuSshArguments(server, join(state, 'id_fleet_lab'), join(state, 'known_hosts')),
      ],
      {
        stdin: 'ignore',
        stdout: Bun.file(join(diagnostics, 'tunnel.log')),
        stderr: Bun.file(join(diagnostics, 'tunnel-error.log')),
      },
    );
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const probe = await command(
        'kubectl',
        ['--kubeconfig', kubeconfig, '--context', 'workers', 'get', 'nodes', '-o', 'json'],
        true,
      );
      if (probe.exitCode === 0) break;
      if (Date.now() >= deadline || tunnel.exitCode !== null)
        throw new Error('Owned lab API tunnel did not become ready');
      await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
    }
    if (Date.now() >= deadline) throw new Error('Owned lab API tunnel readiness timed out');
    const node = record(JSON.parse(await k(['get', 'node', target, '-o', 'json'])));
    const identity = {
      labId,
      target,
      namespace,
      targetUid: stringField(record(node['metadata']), 'uid'),
      kubeconfigSha256: sha256(await readFile(kubeconfig)),
      toolchainSha256: sha256(await readFile(join(root, 'infra/versions/toolchain.json'))),
    };
    await writeOwned(join(diagnostics, 'identity.json'), identity);
    const inventory = record(JSON.parse(await readFile(join(state, 'inventory.json'), 'utf8')));
    const all = record(inventory['all']);
    const variables = record(all['vars']);
    for (const key of [
      'puni_k3s_server_credential',
      'puni_k3s_agent_credential',
      'puni_k3s_server_token',
      'puni_k3s_agent_token',
    ]) {
      const credential = variables[key];
      if (typeof credential === 'string' && credential.length > 0) credentials.push(credential);
    }
    const children = record(all['children']);
    const hosts: Record<string, unknown> = {};
    for (const group of ['k3s_agents', 'k3s_bootstrap_servers', 'k3s_join_servers']) {
      for (const [name, host] of Object.entries(record(record(children[group])['hosts']))) {
        if (name in hosts) throw new Error('Duplicate lab inventory host');
        hosts[name] = host;
      }
    }
    const names = [`${prefix}server-1`, `${prefix}agent-1`, `${prefix}agent-2`];
    if (Object.keys(hosts).length !== 3 || names.some((name) => hosts[name] === undefined))
      throw new Error('Rehearsal inventory is not the owned three-machine workers lab');
    const fleetPath = join(diagnostics, 'fleet.json');
    await writeOwned(fleetPath, {
      schemaVersion: 1,
      revision: labId,
      clusters: [
        {
          id: 'workers',
          purpose: 'workers',
          apiEndpoint: `https://127.0.0.1:${String(server.apiPort)}`,
          controlPlane: 'single',
          bootstrap: 'complete',
          requiredCapabilities: { execution: 1 },
        },
      ],
      nodes: names.map((name) => {
        const host = record(hosts[name]);
        return {
          id: name,
          cluster: 'workers',
          lifecycle: 'present',
          capabilities: name.endsWith('server-1') ? ['control-plane'] : ['execution'],
          provider: {
            kind: 'ssh',
            machineId: stringField(host, 'puni_machine_id'),
            address: stringField(host, 'ansible_host'),
          },
        };
      }),
    });
    const probe = toolchain.runtimeImages.networkProbe;
    const sqlite = toolchain.runtimeImages.sqliteBackup;
    const marker = randomBytes(16).toString('hex');
    const cases: unknown[] = [];
    async function requireTarget(): Promise<Record<string, unknown>> {
      const current = record(JSON.parse(await k(['get', 'node', target, '-o', 'json'])));
      if (record(current['metadata'])['uid'] !== identity.targetUid)
        throw new Error('Rehearsal target UID changed');
      return current;
    }
    async function serviceActive(): Promise<boolean> {
      const active = (
        await ssh(['sudo', 'systemctl', 'show', 'k3s-agent', '--property=ActiveState', '--value'])
      ).trim();
      if (active !== 'active' && active !== 'inactive')
        throw new Error(`Unexpected k3s-agent state ${active}`);
      return active === 'active';
    }
    const snapshot = (kind: DrainKind, expectsTarget: boolean) =>
      collectDrainSnapshot(identity, kind, expectsTarget, marker, k);
    async function preparePlan(kind: DrainKind) {
      await requireTarget();
      const planPath = join(diagnostics, `${kind}.plan.json`);
      const knownHostsPath = `${planPath}.known_hosts`;
      await copyFile(join(state, 'known_hosts'), knownHostsPath, constants.COPYFILE_EXCL);
      const host = record(hosts[target]);
      await writeOwned(`${planPath}.inventory.json`, {
        all: {
          children: {
            k3s_agents: {
              hosts: {
                [target]: {
                  ansible_ssh_private_key_file: stringField(
                    variables,
                    'ansible_ssh_private_key_file',
                  ),
                  ...host,
                  ansible_user: 'puni',
                  puni_provider_identity: stringField(host, 'puni_machine_id'),
                  ansible_ssh_common_args: `-o UserKnownHostsFile=${knownHostsPath} -o StrictHostKeyChecking=yes`,
                },
              },
            },
            k3s_bootstrap_servers: { hosts: {} },
            k3s_join_servers: { hosts: {} },
          },
        },
      });
      // This is a receipt for a disposable fixture-free VM, never a production backup authority.
      const backup = {
        schemaVersion: 1,
        receiptId: `${labId}-${kind}`,
        nodeId: target,
        providerIdentity: `ssh:${stringField(host, 'puni_machine_id')}`,
        state: 'complete',
        snapshotId: `disposable-${labId}`,
        verifiedAt: new Date().toISOString(),
      };
      await writeOwned(`${planPath}.backup-receipt.json`, backup);
      const observation = join(diagnostics, `${kind}.observation.json`);
      await cli([
        'discover',
        '--fleet',
        fleetPath,
        '--lab-state',
        state,
        '--output',
        observation,
        '--max-source-age-ms',
        '300000',
      ]);
      await cli([
        'plan',
        '--fleet',
        fleetPath,
        '--observation',
        observation,
        '--operation',
        'retire',
        '--node',
        target,
        '--output',
        planPath,
        '--backup-receipt',
        backup.receiptId,
        '--backup-receipt-sha256',
        sha256(await readFile(`${planPath}.backup-receipt.json`)),
        '--inventory-sha256',
        sha256(await readFile(`${planPath}.inventory.json`)),
        '--known-hosts-sha256',
        sha256(await readFile(knownHostsPath)),
      ]);
      const plan = decodeOperationPlan(JSON.parse(await readFile(planPath, 'utf8')));
      return {
        planPath,
        arguments: [entrypoint, 'apply', '--plan', planPath, '--expect-sha256', plan.planSha256],
      };
    }
    async function installFixture(kind: DrainKind) {
      await requireTarget();
      if (kind === 'local-pv') await ssh(['sudo', 'mkdir', '-p', `/var/lib/puni-${labId}`]);
      const path = join(diagnostics, `${kind}.fixture.json`);
      await writeOwned(
        path,
        buildDrainFixture(
          identity,
          kind,
          `${probe.name}@${probe.digest}`,
          `${sqlite.name}@${sqlite.digest}`,
          marker,
        ),
      );
      await k(['apply', '-f', path]);
      await k(['-n', namespace, 'rollout', 'status', 'deployment/fixture', '--timeout=180s']);
    }
    async function clearFixture(kind: DrainKind) {
      await requireTarget();
      const current = record(JSON.parse(await k(['get', 'namespace', namespace, '-o', 'json'])));
      if (record(record(current['metadata'])['labels'])['puni.dev/rehearsal'] !== labId)
        throw new Error('Fixture namespace ownership changed');
      await k(['uncordon', target]);
      await k(['delete', 'namespace', namespace, '--wait=true', '--timeout=180s']);
      if (kind === 'local-pv')
        await k(['delete', 'pv', namespace, '--wait=true', '--timeout=180s']);
      const currentNode = await requireTarget();
      if (record(currentNode['spec'])['unschedulable'] === true)
        throw new Error('Explicit recovery did not uncordon target');
    }
    for (const kind of protectedKinds) {
      const prepared = await preparePlan(kind);
      await installFixture(kind);
      const before = await snapshot(kind, true);
      const started = Date.now();
      const refused = await command(process.execPath, prepared.arguments);
      const elapsedMs = Date.now() - started;
      const journal = await readOperationJournal(`${prepared.planPath}.journal.json`);
      const current = await requireTarget();
      const phase = collectProtectedCase(
        identity,
        kind,
        before,
        await snapshot(kind, true),
        refused,
        journal,
        {
          cordoned: record(current['spec'])['unschedulable'] === true,
          serviceActive: await serviceActive(),
          receiptAbsent: await isAbsent(`${prepared.planPath}.retirement-receipt.json`),
          elapsedMs,
        },
      );
      cases.push(phase);
      await writeOwned(join(diagnostics, `${kind}.evidence.json`), phase);
      await clearFixture(kind);
    }
    const prepared = await preparePlan('stateless');
    await installFixture('stateless');
    await snapshot('stateless', true);
    await must(process.execPath, prepared.arguments);
    await k(['-n', namespace, 'rollout', 'status', 'deployment/fixture', '--timeout=180s']);
    await snapshot('stateless', false);
    const journalPath = `${prepared.planPath}.journal.json`;
    const receiptPath = `${prepared.planPath}.retirement-receipt.json`;
    const beforeJournal = await readFile(journalPath);
    const beforeReceipt = await readFile(receiptPath);
    await must(process.execPath, prepared.arguments);
    const nodes = record(JSON.parse(await k(['get', 'nodes', '-o', 'json'])))['items'];
    if (!Array.isArray(nodes)) throw new Error('Missing node list after retirement');
    const success = {
      state: (await readOperationJournal(journalPath)).state,
      receiptState: record(JSON.parse(beforeReceipt.toString()))['state'],
      serviceActive: await serviceActive(),
      nodeAbsent: nodes.every(
        (candidate) => record(record(candidate)['metadata'])['uid'] !== identity.targetUid,
      ),
      secondApplyUnchanged:
        beforeJournal.equals(await readFile(journalPath)) &&
        beforeReceipt.equals(await readFile(receiptPath)),
    };
    const evidence = {
      schemaVersion: 1,
      ...identity,
      observedAt: new Date().toISOString(),
      cases,
      success,
    };
    requireDrainEvidence(evidence, identity, new Date());
    await writeOwned(join(diagnostics, 'evidence.json'), evidence);
    await readDrainEvidence(join(diagnostics, 'evidence.json'), identity, new Date());
    await cli(['lab', 'down', '--provider', 'qemu', '--lab-id', labId, '--profile', 'workers']);
    console.log(`Protected drain evidence: ${join(diagnostics, 'evidence.json')}`);
  } catch (cause) {
    console.error(
      `Rehearsal diagnostics retained: ${diagnostics}\nCleanup: bun ${entrypoint} lab down --provider qemu --lab-id ${labId} --profile workers`,
    );
    throw cause;
  } finally {
    if (tunnel !== undefined) {
      tunnel.kill();
      await tunnel.exited;
    }
    if (originalKubeconfig === undefined) delete process.env['KUBECONFIG'];
    else process.env['KUBECONFIG'] = originalKubeconfig;
    if (originalToken === undefined) delete process.env['HCLOUD_TOKEN'];
    else process.env['HCLOUD_TOKEN'] = originalToken;
  }
}

if (import.meta.main) {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 2 || arguments_[0] !== '--qemu-prefix')
    throw new Error('Usage: drain-rehearsal.ts --qemu-prefix <locked-rootless-qemu-prefix>');
  await runDrainRehearsal(resolve(import.meta.dir, '../../..'), resolve(arguments_[1]));
}
