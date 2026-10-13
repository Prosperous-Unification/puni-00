import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { file, spawnSync } from 'bun';
import { parse } from 'yaml';

const { structuredClone } = globalThis;
const kubectl = process.env.KUBECTL;
const kubeconfig = process.env.KUBECONFIG;
const context = process.env.KUBE_CONTEXT;
if (!kubectl || !kubeconfig || !context)
  throw new Error('Set KUBECTL, KUBECONFIG and KUBE_CONTEXT explicitly');
const isPreparing = process.argv.length === 3 && process.argv[2] === '--prepare';
if (!isPreparing && process.argv.length !== 2)
  throw new Error('Expected --prepare or no arguments');
const base = fileURLToPath(new URL('.', import.meta.url));
const forge = parse(await file(`${base}forge-allowed.yaml`).text());
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
function deny(name, arguments_, document) {
  if (process.env.PROBE_FILTER && !name.includes(process.env.PROBE_FILTER)) return;
  const response = request(arguments_, document);
  if (
    response.exitCode === 0 ||
    !response.stderr
      .toString()
      .includes('reserved forge namespaces require their source label before Pod admission')
  ) {
    throw new Error(
      `${name}: expected reserved identity denial; exit ${response.exitCode}: ${response.stderr.toString()}`,
    );
  }
  console.log(`PASS ${name}`);
}
function checkUpgrade() {
  for (const namespace of ['puni-forge-upgrade', 'puni-forge-1upgrade']) {
    if (isPreparing) {
      requireRequest(['create', '-f', '-'], {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: namespace,
          labels: { 'pod-security.kubernetes.io/enforce': 'privileged' },
        },
      });
      requireRequest(['create', '-f', '-'], {
        apiVersion: 'v1',
        kind: 'ServiceAccount',
        metadata: { name: 'dev-environment-controller', namespace },
      });
    }
    for (const isUnsafe of [false, true]) {
      const pod = structuredClone(forge);
      pod.metadata.namespace = namespace;
      pod.metadata.name = isUnsafe ? 'unsafe-upgrade' : 'approved-upgrade';
      if (isUnsafe)
        Object.assign(pod.spec.containers[0].securityContext, {
          privileged: true,
          allowPrivilegeEscalation: true,
        });
      if (isPreparing) {
        requireRequest(['create', '-f', '-'], pod);
        continue;
      }
      const name = `${namespace} ${isUnsafe ? 'unsafe' : 'approved'}`;
      const creation = structuredClone(pod);
      creation.metadata.name += '-new';
      deny(`${name} Pod create`, ['create', '--dry-run=server', '-f', '-'], creation);
      const patch = { metadata: { annotations: { 'puni.dev/upgrade-probe': 'after-install' } } };
      deny(`${name} Pod update`, [
        'patch',
        'pod',
        pod.metadata.name,
        '-n',
        namespace,
        '--type=merge',
        '--dry-run=server',
        '--patch',
        JSON.stringify(patch),
      ]);
      const ephemeral = structuredClone(pod.spec.containers[0]);
      delete ephemeral.volumeMounts;
      ephemeral.name = 'debug';
      ephemeral.targetContainerName = 'source';
      const addition = { spec: { ephemeralContainers: [ephemeral] } };
      deny(`${name} ephemeral update`, [
        'patch',
        'pod',
        pod.metadata.name,
        '-n',
        namespace,
        '--subresource=ephemeralcontainers',
        '--type=merge',
        '--dry-run=server',
        '--patch',
        JSON.stringify(addition),
      ]);
    }
  }
}
checkUpgrade();
if (!isPreparing) {
  const parameter = JSON.parse(
    requireRequest(['get', 'configmap', 'puni-trusted-workload', '-n', 'wbs-solver', '-o', 'json']),
  );
  delete parameter.metadata.resourceVersion;
  delete parameter.metadata.uid;
  requireRequest(['delete', 'configmap', 'puni-trusted-workload', '-n', 'wbs-solver']);
  try {
    console.log('upgrade checks without trusted parameters');
    checkUpgrade();
  } finally {
    requireRequest(['create', '-f', '-'], parameter);
  }
}

console.log(
  isPreparing
    ? 'upgrade fixtures created before policy installation'
    : 'forge namespace upgrade checks passed',
);
