import { type } from 'arktype';

/** Kubernetes IO used by namespace ownership, atomic creation and preconditioned teardown. */
export interface NamespaceClient {
  kubectl(arguments_: readonly string[], options?: { readonly input?: string }): Promise<string>;
  attempt(
    arguments_: readonly string[],
    options?: { readonly input?: string },
  ): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }>;
}

export interface NamespaceOwner {
  readonly slug: string;
  readonly labId: string;
  readonly worktree?: string;
}

export interface OwnedNamespace {
  readonly name: string;
  readonly uid: string;
  readonly worktree: string;
  readonly isTerminating: boolean;
}

const Namespace = type({
  metadata: {
    name: 'string>0',
    uid: 'string>0',
    labels: {
      'puni.dev/lab-id': 'string>0',
      'puni.dev/dev-slug': 'string>0',
      'puni.dev/trusted-hostpath': "'source'",
    },
    annotations: { 'puni.dev/worktree': 'string>0' },
    'deletionTimestamp?': 'string>0',
  },
});

/** The workload namespace; controller identity and uniqueness Leases stay in `puni-forge`. */
export function environmentNamespace(slug: string): string {
  return `puni-forge-${slug}`;
}

/** Read an optional namespace, refusing malformed or foreign state before callers mutate it. */
export async function readNamespace(
  client: NamespaceClient,
  owner: NamespaceOwner,
): Promise<OwnedNamespace | undefined> {
  const name = environmentNamespace(owner.slug);
  const text = await client.kubectl(['get', 'namespace', name, '--ignore-not-found', '-o', 'json']);
  if (text.trim() === '') return undefined;
  const namespace = Namespace(JSON.parse(text));
  // Proof: bypassing schema validation fails the wrong-trust and missing-UID
  // adoption negatives in forge-namespace.test.ts; a preexisting unlabelled namespace also refuses live.
  if (namespace instanceof type.errors)
    throw new Error(`${name} has malformed namespace ownership: ${namespace.summary}`);
  const { metadata } = namespace;
  const worktree = metadata.annotations['puni.dev/worktree'];
  // Proof: removing each comparison fails the wrong-name or foreign lab, slug and worktree negatives
  // in forge-namespace.test.ts; no apply or namespace deletion is permitted before it.
  if (
    metadata.name !== name ||
    metadata.labels['puni.dev/lab-id'] !== owner.labId ||
    metadata.labels['puni.dev/dev-slug'] !== owner.slug ||
    (owner.worktree !== undefined && worktree !== owner.worktree)
  ) {
    throw new Error(`${name} namespace ownership does not match this lab, slug and worktree`);
  }
  return {
    name,
    uid: metadata.uid,
    worktree,
    isTerminating: metadata.deletionTimestamp !== undefined,
  };
}

/** Atomically create an owned namespace, or recover an earlier create for the exact same pair. */
export async function createNamespace(
  client: NamespaceClient,
  owner: NamespaceOwner & { readonly worktree: string },
): Promise<void> {
  const name = environmentNamespace(owner.slug);
  const namespace = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name,
      labels: {
        'puni.dev/lab-id': owner.labId,
        'puni.dev/dev-slug': owner.slug,
        'puni.dev/trusted-hostpath': 'source',
        'pod-security.kubernetes.io/enforce': 'privileged',
        'pod-security.kubernetes.io/warn': 'restricted',
        'pod-security.kubernetes.io/audit': 'restricted',
      },
      annotations: { 'puni.dev/worktree': owner.worktree },
    },
  };
  const outcome = await client.attempt(['create', '-f', '-'], { input: JSON.stringify(namespace) });
  if (outcome.exitCode === 0) return;
  if (!outcome.stderr.includes('(AlreadyExists)'))
    throw new Error(`kubectl create namespace ${name} failed: ${outcome.stderr.trim()}`);
  const existing = await readNamespace(client, owner);
  // Proof: removing either branch fails the disappearing recovery or terminating adoption
  // negative in forge-namespace.test.ts; namespace deletion must finish before the slug is reused.
  if (existing === undefined || existing.isTerminating)
    throw new Error(
      `${name} disappeared or is terminating; retry after namespace deletion finishes`,
    );
}

/** Delete the inspected namespace, including its database PVC, only while its UID still matches. */
export async function deleteNamespace(
  client: NamespaceClient,
  namespace: OwnedNamespace,
): Promise<void> {
  // Proof: removing the UID precondition fails `refuses a namespace replaced between ownership
  // inspection and deletion`; the replacement namespace survives the refused teardown.
  await client.kubectl(['delete', `--raw=/api/v1/namespaces/${namespace.name}`, '-f', '-'], {
    input: JSON.stringify({
      apiVersion: 'v1',
      kind: 'DeleteOptions',
      preconditions: { uid: namespace.uid },
    }),
  });
  await client.kubectl(['wait', '--for=delete', `namespace/${namespace.name}`, '--timeout=600s']);
}

/**
 * Namespace-local Pod identity and permission for the shared controller, with no API token.
 *
 * Proof: removing the local RoleBinding made the live shared-controller can-i positive answer
 * no; restoring it answered yes, while the local workload identity still answered no.
 */
export function namespaceAccess(slug: string, labId: string): readonly Record<string, unknown>[] {
  const metadata = {
    namespace: environmentNamespace(slug),
    labels: { 'puni.dev/dev-slug': slug, 'puni.dev/lab-id': labId },
  };
  return [
    {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: { ...metadata, name: 'dev-environment-controller' },
      automountServiceAccountToken: false,
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: { ...metadata, name: 'source-workload-manager' },
      rules: [
        {
          apiGroups: [''],
          resources: ['pods'],
          verbs: ['create', 'delete', 'get', 'list', 'patch', 'update', 'watch'],
        },
      ],
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { ...metadata, name: 'source-workload-manager' },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name: 'source-workload-manager',
      },
      subjects: [
        { kind: 'ServiceAccount', name: 'dev-environment-controller', namespace: 'puni-forge' },
      ],
    },
  ];
}
