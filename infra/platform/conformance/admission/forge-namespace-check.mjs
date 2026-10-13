import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { file, spawnSync } from 'bun';
import { parse } from 'yaml';

const { structuredClone } = globalThis;
const base = fileURLToPath(new URL('.', import.meta.url));
const kubectl = process.env.KUBECTL;
const kubeconfig = process.env.KUBECONFIG;
const context = process.env.KUBE_CONTEXT;
if (!kubectl || !kubeconfig || !context) {
  throw new Error('Set KUBECTL, KUBECONFIG and KUBE_CONTEXT to the disposable cluster explicitly');
}
function request(arguments_, document) {
  return spawnSync([kubectl, '--kubeconfig', kubeconfig, '--context', context, ...arguments_], {
    stdin: document === undefined ? undefined : Buffer.from(JSON.stringify(document)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
}
function requireRequest(arguments_, document) {
  const response = request(arguments_, document);
  if (response.exitCode !== 0) throw new Error(response.stderr.toString());
  return response.stdout.toString();
}
function admit(name, document, denial, arguments_) {
  if (process.env.PROBE_FILTER && !name.includes(process.env.PROBE_FILTER)) return;
  const response = request(arguments_ ?? ['create', '--dry-run=server', '-f', '-'], document);
  const error = response.stderr.toString();
  if (
    denial === undefined
      ? response.exitCode !== 0
      : response.exitCode === 0 || !error.includes(denial)
  ) {
    throw new Error(
      `${name}: expected ${denial ?? 'admission'}; exit ${response.exitCode}: ${error}`,
    );
  }
  console.log(`PASS ${name}`);
}
const forge = parse(await file(`${base}forge-allowed.yaml`).text());
const identityMessage = 'source workloads require';
for (const namespace of ['puni-forge', 'puni-forge-alpha', 'puni-forge-beta']) {
  const pod = structuredClone(forge);
  pod.metadata.namespace = namespace;
  admit(`${namespace} approved`, pod);
  const faults = [
    [
      'nested path',
      (p) => (p.spec.volumes[0].hostPath.path = '/srv/puni/worktrees/puni-00/subdirectory'),
      'exact directory root',
    ],
    [
      'wrong image',
      (p) => (p.spec.containers[0].image = 'registry.puni.test/untrusted:latest'),
      identityMessage,
    ],
    ['wrong service account', (p) => (p.spec.serviceAccountName = 'default'), identityMessage],
    [
      'wrong controller',
      (p) => (p.metadata.labels['puni.dev/controller'] = 'other'),
      identityMessage,
    ],
    [
      'wrong node',
      (p) => (p.spec.nodeSelector['puni.dev/capability-forge'] = 'false'),
      identityMessage,
    ],
    [
      'privileged',
      (p) =>
        Object.assign(p.spec.containers[0].securityContext, {
          privileged: true,
          allowPrivilegeEscalation: true,
        }),
      'Restricted-equivalent isolation',
    ],
    [
      'host port',
      (p) => (p.spec.containers[0].ports = [{ containerPort: 8080, hostPort: 18080 }]),
      'may not bind host ports',
    ],
    [
      'unconfined',
      (p) => (p.spec.containers[0].securityContext.appArmorProfile = { type: 'Unconfined' }),
      'Baseline pod and container security',
    ],
    [
      'legacy apparmor',
      (p) =>
        (p.metadata.annotations = {
          'container.apparmor.security.beta.kubernetes.io/source': 'unconfined',
        }),
      'denied',
    ],
    [
      'probe host',
      (p) => (p.spec.containers[0].livenessProbe = { httpGet: { port: 8080, host: '127.0.0.1' } }),
      'may not select a host',
    ],
  ];
  for (const [name, inject, denial] of faults) {
    const broken = structuredClone(pod);
    inject(broken);
    admit(`${namespace} ${name}`, broken, denial);
  }
  for (const fault of ['image', 'privileged']) {
    const broken = structuredClone(pod);
    const container = structuredClone(pod.spec.containers[0]);
    container.name = 'init';
    if (fault === 'image') container.image = 'registry.puni.test/untrusted:latest';
    else
      Object.assign(container.securityContext, {
        privileged: true,
        allowPrivilegeEscalation: true,
      });
    broken.spec.initContainers = [container];
    admit(
      `${namespace} init ${fault}`,
      broken,
      fault === 'image' ? identityMessage : 'Restricted-equivalent isolation',
    );
  }
  const live = structuredClone(pod);
  live.metadata.name = 'ephemeral-target';
  requireRequest(['apply', '-f', '-'], live);
  for (const fault of ['image', 'privileged']) {
    const ephemeral = structuredClone(pod.spec.containers[0]);
    delete ephemeral.volumeMounts;
    ephemeral.name = 'debug';
    ephemeral.targetContainerName = 'source';
    if (fault === 'image') ephemeral.image = 'registry.puni.test/untrusted:latest';
    else
      Object.assign(ephemeral.securityContext, {
        privileged: true,
        allowPrivilegeEscalation: true,
      });
    const patch = { spec: { ephemeralContainers: [ephemeral] } };
    admit(
      `${namespace} ephemeral ${fault}`,
      undefined,
      fault === 'image' ? identityMessage : 'Restricted-equivalent isolation',
      [
        'patch',
        'pod',
        'ephemeral-target',
        '-n',
        namespace,
        '--subresource=ephemeralcontainers',
        '--type=merge',
        '--dry-run=server',
        '--patch',
        JSON.stringify(patch),
      ],
    );
  }
  admit(`${namespace} retain source label`, undefined, undefined, [
    'patch',
    'namespace',
    namespace,
    '--type=merge',
    '--dry-run=server',
    '--patch',
    JSON.stringify({ metadata: { labels: { 'puni.dev/trusted-hostpath': 'source' } } }),
  ]);
  for (const label of [null, 'solver', 'unknown']) {
    const document = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: `${namespace}-new` },
    };
    if (label !== null) document.metadata.labels = { 'puni.dev/trusted-hostpath': label };
    admit(`${namespace} create label ${label}`, document, 'trusted namespaces');
    const patch = { metadata: { labels: { 'puni.dev/trusted-hostpath': label } } };
    admit(`${namespace} update label ${label}`, undefined, 'trusted namespaces', [
      'patch',
      'namespace',
      namespace,
      '--type=merge',
      '--dry-run=server',
      '--patch',
      JSON.stringify(patch),
    ]);
  }
}
for (const slug of ['a', 'a'.repeat(20), 'a-1']) {
  admit(`namespace valid slug ${slug}`, {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: `puni-forge-${slug}`,
      labels: { 'puni.dev/trusted-hostpath': 'source' },
    },
  });
}
for (const name of ['puni-forge-1bad', `puni-forge-${'a'.repeat(21)}`]) {
  admit(
    `namespace malformed without label ${name}`,
    { apiVersion: 'v1', kind: 'Namespace', metadata: { name } },
    'trusted namespaces',
  );
}
for (const [name, label] of [
  ['puni-forge-1bad', 'source'],
  [`puni-forge-${'a'.repeat(21)}`, 'source'],
  ['ordinary-trusted', 'source'],
  ['ordinary-unknown', 'unknown'],
  ['ordinary-solver', 'solver'],
]) {
  admit(
    `namespace identity ${name}`,
    {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name, labels: { 'puni.dev/trusted-hostpath': label } },
    },
    'trusted namespaces',
  );
}
for (const fixture of ['solver-allowed.yaml', 'solver-rollback-allowed.yaml'])
  admit(fixture, parse(await file(`${base}${fixture}`).text()));
for (const fixture of ['solver-alternate-path.yaml', 'solver-untrusted-image.yaml'])
  admit(fixture, parse(await file(`${base}${fixture}`).text()), 'denied');
const ordinary = structuredClone(forge);
ordinary.metadata.namespace = 'ordinary-restricted';
delete ordinary.spec.volumes;
delete ordinary.spec.containers[0].volumeMounts;
ordinary.spec.serviceAccountName = 'default';
admit('ordinary Restricted approved', ordinary);
Object.assign(ordinary.spec.containers[0].securityContext, {
  privileged: true,
  allowPrivilegeEscalation: true,
});
admit('ordinary Restricted privileged', ordinary, 'violates PodSecurity');
const parameter = JSON.parse(
  requireRequest(['get', 'configmap', 'puni-trusted-workload', '-n', 'wbs-solver', '-o', 'json']),
);
delete parameter.metadata.resourceVersion;
delete parameter.metadata.uid;
requireRequest(['delete', 'configmap', 'puni-trusted-workload', '-n', 'wbs-solver']);
try {
  for (const namespace of ['puni-forge', 'puni-forge-alpha', 'puni-forge-beta', 'wbs-solver']) {
    const pod =
      namespace === 'wbs-solver'
        ? parse(await file(`${base}solver-allowed.yaml`).text())
        : structuredClone(forge);
    pod.metadata.namespace = namespace;
    admit(`${namespace} missing parameter`, pod, 'no params found');
  }
  Object.assign(ordinary.spec.containers[0].securityContext, {
    privileged: false,
    allowPrivilegeEscalation: false,
  });
  admit('ordinary without trusted parameter', ordinary);
} finally {
  requireRequest(['create', '-f', '-'], parameter);
}
console.log('forge namespace admission checks passed');
