import { readFile } from 'node:fs/promises';

import { type } from 'arktype';

/** One observed k3s server: Ready and EtcdIsVoter come from its Node conditions. */
export interface ServerHealth {
  readonly nodeName: string;
  readonly ready: boolean;
  readonly etcdVoter: boolean;
}

export interface MaintenancePlan {
  readonly operation: string;
  readonly preconditions: readonly string[];
  readonly steps: readonly string[];
}

function requireHealthyServers(servers: readonly ServerHealth[], operation: string): void {
  if (servers.length === 0) throw new Error(`${operation} refused: no server was observed`);
  const unhealthy = servers.filter(({ ready, etcdVoter }) => !ready || !etcdVoter);
  if (unhealthy.length > 0) {
    // Proof: with this guard removed, the unhealthy-member maintenance.test.ts negatives planned
    // expansion and rotation while quorum was already reduced.
    throw new Error(
      `${operation} refused: servers not Ready or not etcd voters: ${unhealthy.map(({ nodeName }) => nodeName).join(', ')}`,
    );
  }
}

function requireReceipt(receipt: string, operation: string): void {
  if (receipt.trim().length === 0) {
    throw new Error(`${operation} refused: take and record an etcd snapshot first`);
  }
}

/**
 * Add exactly one server to embedded etcd. The target size must be odd, and every current
 * member must be a healthy voter; a two-member cluster is only a transition, because it has
 * no more fault tolerance than one.
 */
export function planControlPlaneExpansion(request: {
  readonly servers: readonly ServerHealth[];
  readonly candidate: string;
  readonly targetServers: number;
  readonly snapshotReceipt: string;
}): MaintenancePlan {
  requireHealthyServers(request.servers, 'Control-plane expansion');
  requireReceipt(request.snapshotReceipt, 'Control-plane expansion');
  if (request.servers.some(({ nodeName }) => nodeName === request.candidate)) {
    throw new Error(`Control-plane expansion refused: ${request.candidate} is already a server`);
  }
  if (request.targetServers % 2 === 0 || request.targetServers <= request.servers.length) {
    // Proof: with this guard removed, the even-target negative planned a four-member cluster.
    throw new Error(
      'Control-plane expansion refused: the target server count must be odd and larger',
    );
  }
  const after = request.servers.length + 1;
  return {
    operation: 'control-plane-expansion',
    preconditions: [
      `${String(request.servers.length)} healthy voters`,
      `snapshot ${request.snapshotReceipt}`,
      ...(after % 2 === 0
        ? [
            `${String(after)} members tolerate no more failures than ${String(after - 1)}; continue to ${String(request.targetServers)} promptly`,
          ]
        : []),
    ],
    steps: [
      `enroll ${request.candidate} with join.yml in k3s_join_servers`,
      `wait for ${request.candidate} Ready and EtcdIsVoter=True`,
      `require ${String(after)} voters in /v3/cluster/member/list`,
      'refresh the fleet observation before the next server',
    ],
  };
}

/**
 * Rotate k3s serving and client certificates one server at a time. With a single server the
 * API is down while k3s is stopped, which the operator must accept explicitly.
 */
export function planCertificateRotation(request: {
  readonly servers: readonly ServerHealth[];
  readonly snapshotReceipt: string;
  readonly acceptApiOutage: boolean;
}): MaintenancePlan {
  requireHealthyServers(request.servers, 'Certificate rotation');
  requireReceipt(request.snapshotReceipt, 'Certificate rotation');
  if (request.servers.length === 1 && !request.acceptApiOutage) {
    throw new Error(
      'Certificate rotation refused: a single server means an API outage; accept it explicitly',
    );
  }
  return {
    operation: 'certificate-rotation',
    preconditions: [`snapshot ${request.snapshotReceipt}`],
    steps: [
      ...request.servers.flatMap(({ nodeName }) => [
        `${nodeName}: systemctl stop k3s`,
        `${nodeName}: k3s certificate rotate`,
        `${nodeName}: systemctl start k3s, wait Ready and EtcdIsVoter=True`,
      ]),
      'restart every agent serially so kubelets trust the new serving certificates',
      'refresh kubeconfig copies (Flux <cluster>-kubeconfig Secret, operator kubeconfig)',
    ],
  };
}

/**
 * Rotate the k3s server token. Snapshots taken before the rotation still need the old token,
 * so the old one stays escrowed until the last such snapshot has expired.
 */
export function planTokenRotation(request: {
  readonly servers: readonly ServerHealth[];
  readonly snapshotReceipt: string;
  readonly newTokenEscrowSha256: string;
  readonly oldTokenSha256: string;
}): MaintenancePlan {
  requireHealthyServers(request.servers, 'Token rotation');
  requireReceipt(request.snapshotReceipt, 'Token rotation');
  if (!/^[0-9a-f]{64}$/.test(request.newTokenEscrowSha256)) {
    // Proof: with this guard removed, the unescrowed-token negative planned a rotation whose
    // new token existed only inside the cluster.
    throw new Error('Token rotation refused: escrow the new token and record its SHA-256 first');
  }
  if (request.newTokenEscrowSha256 === request.oldTokenSha256) {
    throw new Error('Token rotation refused: the new token equals the old one');
  }
  return {
    operation: 'token-rotation',
    preconditions: [`new token ${request.newTokenEscrowSha256} escrowed in both places`],
    steps: [
      `${request.servers[0]?.nodeName ?? ''}: k3s token rotate --token <old> --new-token <escrowed new>`,
      'restart every server serially, then every agent, with the new token in its token file',
      'set puni_k3s_token_sha256 to the new fingerprint and run backup.yml',
      'record a new recovery manifest from a snapshot taken after rotation',
      `keep token ${request.oldTokenSha256} escrowed until every older snapshot has expired`,
    ],
  };
}

/**
 * Replace a cluster's SOPS age recipient. The new identity is escrowed before anything is
 * re-encrypted, and both identities stay in `sops-age` until Flux decrypts with the new one.
 */
export function planSopsKeyRotation(request: {
  readonly cluster: string;
  readonly currentRecipients: readonly string[];
  readonly oldRecipient: string;
  readonly newRecipient: string;
  readonly newIdentityEscrowSha256: string;
}): MaintenancePlan {
  if (request.newRecipient === request.oldRecipient) {
    throw new Error('SOPS key rotation refused: the new recipient equals the old one');
  }
  if (!request.currentRecipients.includes(request.oldRecipient)) {
    throw new Error(
      `SOPS key rotation refused: ${request.oldRecipient} does not encrypt ${request.cluster}`,
    );
  }
  if (!/^[0-9a-f]{64}$/.test(request.newIdentityEscrowSha256)) {
    // Proof: with this guard removed, the unescrowed-identity negative planned re-encryption
    // to a key that only one machine held.
    throw new Error('SOPS key rotation refused: escrow the new identity before re-encrypting');
  }
  const directory = `infra/platform/secrets/${request.cluster}`;
  return {
    operation: 'sops-key-rotation',
    preconditions: [`new identity ${request.newIdentityEscrowSha256} escrowed in both places`],
    steps: [
      'replace flux-system/sops-age with a file holding both identities',
      `sops updatekeys every ${directory}/*.sops.yaml to both recipients; commit; reconcile secrets`,
      `sops updatekeys to ${request.newRecipient} only; commit; reconcile secrets`,
      'replace flux-system/sops-age with the new identity alone; reconcile secrets again',
      'record the new sopsRecipient in the next recovery manifest; keep the old identity until older manifests expire',
    ],
  };
}

/**
 * Recover the registry from a Velero file-system backup into a mapped namespace, prove each
 * recorded digest there, then copy into the live registry with digest checks.
 */
export function planRegistryRecovery(request: {
  readonly backup: string;
  readonly images: readonly string[];
}): MaintenancePlan {
  const inexact = request.images.filter((image) => !/@sha256:[0-9a-f]{64}$/.test(image));
  if (request.images.length === 0 || inexact.length > 0) {
    // Proof: with this guard removed, the tag-only negative planned recovery that could not
    // prove it recovered the released bytes.
    throw new Error(
      `Registry recovery refused: record digest references, not ${inexact.join(', ') || 'nothing'}`,
    );
  }
  return {
    operation: 'registry-recovery',
    preconditions: [`Velero backup ${request.backup} Completed`],
    steps: [
      `velero Restore ${request.backup} with namespaceMapping puni-registry: registry-restore`,
      ...request.images.map((image) => `HEAD ${image} in registry-restore; compare the digest`),
      'platform-registry.ts copy <registry-restore> <live registry> each image (blob and manifest digests)',
      'pull each digest through the live registry from a node; delete registry-restore',
    ],
  };
}

/**
 * Replace the forge host. The old forge must be fenced, and every worktree's head must be
 * pushed, because worktrees live on the host and are not in any backup.
 */
export function planForgeReplacement(request: {
  readonly oldForge: string;
  readonly fence: {
    readonly state: 'powered-off' | 'deleted' | 'running';
    readonly fenceId: string;
  };
  readonly newForge: string;
  readonly worktrees: readonly {
    readonly slug: string;
    readonly head: string;
    readonly pushed: string;
  }[];
}): MaintenancePlan {
  if (request.fence.state === 'running' || request.fence.fenceId.length === 0) {
    throw new Error(`Forge replacement refused: ${request.oldForge} is not fenced`);
  }
  const unpushed = request.worktrees.filter(({ head, pushed }) => head !== pushed);
  if (unpushed.length > 0) {
    // Proof: with this guard removed, the unpushed-worktree negative planned discarding a
    // worktree whose head existed only on the old host.
    throw new Error(
      `Forge replacement refused: unpushed worktrees ${unpushed.map(({ slug }) => slug).join(', ')}`,
    );
  }
  return {
    operation: 'forge-replacement',
    preconditions: [
      `fence ${request.fence.fenceId}`,
      `${String(request.worktrees.length)} worktrees pushed`,
    ],
    steps: [
      `enroll ${request.newForge} with capability forge (join.yml)`,
      `set the trusted worktree roots in puni-trusted-workload for ${request.newForge}`,
      ...request.worktrees.map(
        ({ slug, pushed }) => `tool-devsync:dev-env up --slug ${slug} at ${pushed}`,
      ),
      'server-side dry-run forge-allowed.yaml and forge-nested-path.yaml against the new roots',
      `retire ${request.oldForge} with retire.yml`,
    ],
  };
}

const ServerHealthSchema = type({
  nodeName: 'string>0',
  ready: 'boolean',
  etcdVoter: 'boolean',
  '+': 'reject',
});
const PlanInput = type({ operation: 'string', '+': 'ignore' });

/** Read one JSON evidence file and dispatch to the named planner. */
export async function planMaintenance(path: string): Promise<MaintenancePlan> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    // Proof: without this context `planMaintenance > names an absent or malformed evidence file`
    // received a bare ENOENT/EISDIR that named no maintenance input (2026-09-18).
    throw new Error(`Cannot read required maintenance input at ${path}`, { cause });
  }
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch (cause) {
    // Proof: without this context the same test received a JSON SyntaxError with no path.
    throw new Error(`Required maintenance input at ${path} is malformed JSON`, { cause });
  }
  const header = PlanInput(input);
  if (header instanceof type.errors)
    throw new Error(`Maintenance input is invalid: ${header.summary}`);
  const decode = <Shape>(schema: type.Any<Shape>): Shape => {
    const decoded = schema(input);
    if (decoded instanceof type.errors)
      throw new Error(`${header.operation} input is invalid: ${decoded.summary}`);
    // Boundary: ArkType validated `decoded` against `schema`.
    return decoded as Shape;
  };
  const servers = ServerHealthSchema.array();
  switch (header.operation) {
    case 'control-plane-expansion':
      return planControlPlaneExpansion(
        decode(
          type({
            operation: 'string',
            servers,
            candidate: 'string>0',
            targetServers: 'number.integer',
            snapshotReceipt: 'string',
          }),
        ),
      );
    case 'certificate-rotation':
      return planCertificateRotation(
        decode(
          type({
            operation: 'string',
            servers,
            snapshotReceipt: 'string',
            acceptApiOutage: 'boolean',
          }),
        ),
      );
    case 'token-rotation':
      return planTokenRotation(
        decode(
          type({
            operation: 'string',
            servers,
            snapshotReceipt: 'string',
            newTokenEscrowSha256: 'string',
            oldTokenSha256: 'string',
          }),
        ),
      );
    case 'sops-key-rotation':
      return planSopsKeyRotation(
        decode(
          type({
            operation: 'string',
            cluster: 'string>0',
            currentRecipients: 'string[]',
            oldRecipient: 'string',
            newRecipient: 'string',
            newIdentityEscrowSha256: 'string',
          }),
        ),
      );
    case 'registry-recovery':
      return planRegistryRecovery(
        decode(type({ operation: 'string', backup: 'string>0', images: 'string[]' })),
      );
    case 'forge-replacement':
      return planForgeReplacement(
        decode(
          type({
            operation: 'string',
            oldForge: 'string>0',
            newForge: 'string>0',
            fence: { state: "'powered-off' | 'deleted' | 'running'", fenceId: 'string' },
            worktrees: type({ slug: 'string>0', head: 'string>0', pushed: 'string' }).array(),
          }),
        ),
      );
    default:
      throw new Error(`Unknown maintenance operation ${header.operation}`);
  }
}

if (import.meta.main) {
  const [command, flag, path] = process.argv.slice(2);
  if (process.argv.length !== 5 || command !== 'plan' || flag !== '--input') {
    throw new Error('Usage: maintenance.ts plan --input <evidence.json>');
  }
  console.log(JSON.stringify(await planMaintenance(path), null, 2));
}
