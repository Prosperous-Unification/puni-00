import { Buffer } from 'node:buffer';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { sleep, spawnSync } from 'bun';

const kubectl = process.env.KUBECTL;
const kubeconfig = process.env.KUBECONFIG;
const context = process.env.KUBE_CONTEXT;
const evidence = process.env.CLEANUP_PROBE_EVIDENCE;
if (!kubectl || !kubeconfig || !context || !evidence)
  throw new Error(
    'cleanup probe requires explicit disposable kubectl, kubeconfig, context and evidence',
  );
mkdirSync(evidence, { recursive: false, mode: 0o700 });
const token = randomUUID().slice(0, 8);
const prefix = `cleanup-${token}`;
const label = 'puni.dev/cleanup-admission-probe';
const sentinel = 'probe.puni.dev/hold';
const tracking = 'batch.kubernetes.io/job-tracking';
const originalFinalizers = [tracking, 'orphan', sentinel];
const imageMessage =
  'solver workloads require an approved backend image digest for every container';
let sequence = 0;
function request(name, args, document) {
  const response = spawnSync(
    [kubectl, '--kubeconfig', kubeconfig, '--context', context, '--request-timeout=20s', ...args],
    {
      stdin: document === undefined ? undefined : Buffer.from(JSON.stringify(document)),
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 30_000,
    },
  );
  const path = join(evidence, `${String(++sequence).padStart(3, '0')}-${name}`);
  writeFileSync(
    `${path}.json`,
    JSON.stringify(
      {
        args,
        document,
        exitCode: response.exitCode,
        stdout: response.stdout.toString(),
        stderr: response.stderr.toString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return response;
}
function requireRequest(name, args, document) {
  const response = request(name, args, document);
  if (response.exitCode !== 0) throw new Error(`${name}: ${response.stderr.toString()}`);
  return JSON.parse(response.stdout.toString());
}
function apply(name, document) {
  return requireRequest(name, ['create', '-f', '-', '-o', 'json'], document);
}
function getPod(name) {
  return requireRequest(`get-${name}`, ['get', 'pod', name, '-n', 'wbs-solver', '-o', 'json']);
}
function expectAdmission(name, args, document, admitted, apiBoundary = false) {
  const response = request(name, args, document);
  const error = response.stderr.toString();
  const refused =
    response.exitCode !== 0 &&
    (apiBoundary
      ? error.includes('no new finalizers can be added if the object is being deleted')
      : error.includes("ValidatingAdmissionPolicy 'puni-trusted-hostpath'") &&
        error.includes(imageMessage));
  if (admitted ? response.exitCode !== 0 : !refused)
    throw new Error(
      `${name}: expected ${admitted ? 'admission' : 'image-policy denial'}; exit ${response.exitCode}: ${error}`,
    );
  console.log(`PASS ${name}${apiBoundary ? ' (Kubernetes deleting-finalizer API boundary)' : ''}`);
}
const params = requireRequest('original-params', [
  'get',
  'configmap',
  'puni-trusted-workload',
  '-n',
  'wbs-solver',
  '-o',
  'json',
]);
const oldImage = params.data.solverImages.split(',')[0];
if (!oldImage || !oldImage.includes('@sha256:'))
  throw new Error('cleanup probe original digest missing');
const excludedImage = `registry.puni.test/wbs-be@sha256:${'e'.repeat(64)}`;
if (params.data.solverImages.split(',').includes(excludedImage))
  throw new Error('cleanup probe excluded digest already admitted');
const retentionName = `${prefix}-retain`;
apply('retention-policy', {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingAdmissionPolicy',
  metadata: { name: retentionName },
  spec: {
    failurePolicy: 'Fail',
    matchConstraints: {
      resourceRules: [
        { apiGroups: [''], apiVersions: ['v1'], operations: ['UPDATE'], resources: ['pods'] },
      ],
    },
    matchConditions: [
      {
        name: 'exact-owned-fixture',
        expression: `request.namespace == 'wbs-solver' && has(oldObject.metadata.labels) && '${label}' in oldObject.metadata.labels && oldObject.metadata.labels['${label}'] == '${token}'`,
      },
    ],
    validations: [
      {
        expression:
          'request.dryRun == true || (has(object.metadata.finalizers) ? object.metadata.finalizers : []) == (has(oldObject.metadata.finalizers) ? oldObject.metadata.finalizers : [])',
        message: 'owned cleanup probe retains original finalizers outside server dry-run',
      },
    ],
  },
});
apply('retention-binding', {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingAdmissionPolicyBinding',
  metadata: { name: retentionName },
  spec: { policyName: retentionName, validationActions: ['Deny'] },
});
requireRequest('retention-readback', [
  'get',
  'validatingadmissionpolicy',
  retentionName,
  '-o',
  'json',
]);
const service = request('service-account', [
  'get',
  'serviceaccount',
  'wbs-backend',
  '-n',
  'wbs-solver',
  '-o',
  'json',
]);
if (service.exitCode !== 0) {
  if (!service.stderr.toString().includes('NotFound')) throw new Error(service.stderr.toString());
  apply('create-service-account', {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: { name: 'wbs-backend', namespace: 'wbs-solver' },
  });
}
const nodes = requireRequest('nodes', ['get', 'nodes', '-o', 'json']);
const node = `${prefix}-nonexistent`;
if (nodes.items.some((entry) => entry.metadata.name === node))
  throw new Error('cleanup fixture node exists');
function fixture(suffix) {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: `${prefix}-${suffix}`,
      namespace: 'wbs-solver',
      labels: { 'puni.dev/controller': 'wbs-backend', [label]: token },
      finalizers: originalFinalizers,
    },
    spec: {
      serviceAccountName: 'wbs-backend',
      automountServiceAccountToken: false,
      nodeSelector: { 'puni.dev/capability-product': 'true' },
      nodeName: node,
      restartPolicy: 'Never',
      containers: [
        {
          name: 'backend',
          image: oldImage,
          securityContext: {
            allowPrivilegeEscalation: false,
            runAsNonRoot: true,
            seccompProfile: { type: 'RuntimeDefault' },
            capabilities: { drop: ['ALL'] },
          },
        },
      ],
    },
  };
}
// A policy GET is not informer readiness. Observe its exact real-update refusal before
// native fixtures exist; any early admitted additions affect only this sentinel-only control.
const readiness = fixture('retention-ready');
readiness.metadata.finalizers = [sentinel];
apply('create-retention-ready', readiness);
for (let attempt = 0; ; attempt++) {
  const original = getPod(readiness.metadata.name);
  const patch = [
    { op: 'test', path: '/metadata/uid', value: original.metadata.uid },
    { op: 'test', path: '/metadata/resourceVersion', value: original.metadata.resourceVersion },
    { op: 'add', path: '/metadata/finalizers/-', value: `probe.puni.dev/ready-${attempt}` },
  ];
  const response = request('retention-ready', [
    'patch',
    'pod',
    readiness.metadata.name,
    '-n',
    'wbs-solver',
    '--type=json',
    '-p',
    JSON.stringify(patch),
    '-o',
    'json',
  ]);
  if (response.exitCode !== 0) {
    const error = response.stderr.toString();
    if (
      !error.includes(retentionName) ||
      !error.includes('owned cleanup probe retains original finalizers outside server dry-run')
    )
      throw new Error(`wrong retention refusal: ${error}`);
    break;
  }
  if (attempt === 14) throw new Error('cleanup fixture retention did not converge');
  await sleep(1000);
}
const live = apply('create-live', fixture('live'));
const nonterminal = apply('create-nonterminal', fixture('nonterminal'));
const notDeleting = apply('create-not-deleting', fixture('not-deleting'));
const failed = apply('create-failed', fixture('failed'));
const succeeded = apply('create-succeeded', fixture('succeeded'));
requireRequest('exclude-old', [
  'patch',
  'configmap',
  'puni-trusted-workload',
  '-n',
  'wbs-solver',
  '--type=merge',
  '-p',
  JSON.stringify({ data: { solverImages: excludedImage } }),
  '-o',
  'json',
]);
// This real old-image CREATE must refuse before controller cleanup can rely on the changed parameter.
for (let attempt = 0; ; attempt++) {
  const response = request(
    'observe-exclusion',
    ['create', '--dry-run=server', '-f', '-', '-o', 'json'],
    fixture('excluded-create'),
  );
  if (response.exitCode !== 0) {
    if (!response.stderr.toString().includes(imageMessage))
      throw new Error(response.stderr.toString());
    break;
  }
  if (attempt === 14) throw new Error('cleanup probe image parameter did not converge');
  await sleep(1000);
}
for (const [pod, phase] of [
  [notDeleting, 'Failed'],
  [failed, 'Failed'],
  [succeeded, 'Succeeded'],
])
  requireRequest(`terminal-${pod.metadata.name}`, [
    'patch',
    'pod',
    pod.metadata.name,
    '-n',
    'wbs-solver',
    '--subresource=status',
    '--type=merge',
    '-p',
    JSON.stringify({ status: { phase } }),
    '-o',
    'json',
  ]);
for (const pod of [nonterminal, failed, succeeded]) {
  const deletion = request(`delete-${pod.metadata.name}`, [
    'delete',
    'pod',
    pod.metadata.name,
    '-n',
    'wbs-solver',
    '--grace-period=30',
    '--wait=false',
    '--cascade=orphan',
  ]);
  if (deletion.exitCode !== 0) throw new Error(deletion.stderr.toString());
}
function patchFor(pod, finalizers = [sentinel], extra = []) {
  return [
    { op: 'test', path: '/metadata/uid', value: pod.metadata.uid },
    { op: 'test', path: '/metadata/resourceVersion', value: pod.metadata.resourceVersion },
    { op: 'replace', path: '/metadata/finalizers', value: finalizers },
    ...extra,
  ];
}
function check(name, pod, finalizers, extra, admitted, subresource, apiBoundary = false) {
  const before = getPod(pod.metadata.name);
  if (JSON.stringify(before.metadata.finalizers) !== JSON.stringify(originalFinalizers))
    throw new Error(`${name}: original native finalizers changed`);
  const args = [
    'patch',
    'pod',
    before.metadata.name,
    '-n',
    'wbs-solver',
    '--type=json',
    '-p',
    JSON.stringify(patchFor(before, finalizers, extra)),
    '--dry-run=server',
    '-o',
    'json',
  ];
  if (subresource) args.push(`--subresource=${subresource}`);
  expectAdmission(name, args, undefined, admitted, apiBoundary);
  const after = getPod(pod.metadata.name);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error(`${name}: server dry-run changed original Pod`);
}
for (const pod of [failed, succeeded]) {
  const original = getPod(pod.metadata.name);
  if (
    original.status.phase !== (pod === failed ? 'Failed' : 'Succeeded') ||
    !original.metadata.deletionTimestamp
  )
    throw new Error('cleanup fixture must already be terminal and deleting');
  check(`${pod.metadata.name}-both-native`, pod, [sentinel], [], true);
  check(`${pod.metadata.name}-tracking`, pod, ['orphan', sentinel], [], true);
  check(`${pod.metadata.name}-orphan`, pod, [tracking, sentinel], [], true);
}
check(
  'empty-optional-metadata',
  failed,
  [sentinel],
  [
    { op: 'add', path: '/metadata/annotations', value: {} },
    { op: 'add', path: '/metadata/ownerReferences', value: [] },
  ],
  true,
);
check('live', live, [sentinel], [], false);
check('nonterminal-deleting', nonterminal, [sentinel], [], false);
check('terminal-not-deleting', notDeleting, [sentinel], [], false);
check(
  'spec',
  failed,
  [sentinel],
  [{ op: 'add', path: '/spec/activeDeadlineSeconds', value: 300 }],
  false,
);
check(
  'image',
  failed,
  [sentinel],
  [
    {
      op: 'replace',
      path: '/spec/containers/0/image',
      value: `registry.puni.test/wbs-be@sha256:${'f'.repeat(64)}`,
    },
  ],
  false,
);
check(
  'labels',
  failed,
  [sentinel],
  [{ op: 'add', path: '/metadata/labels/probe.puni.dev~1changed', value: 'true' }],
  false,
);
check(
  'annotations',
  failed,
  [sentinel],
  [{ op: 'add', path: '/metadata/annotations', value: { 'probe.puni.dev/changed': 'true' } }],
  false,
);
check(
  'owners',
  failed,
  [sentinel],
  [
    {
      op: 'add',
      path: '/metadata/ownerReferences',
      value: [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          name: params.metadata.name,
          uid: params.metadata.uid,
        },
      ],
    },
  ],
  false,
);
check('foreign-finalizer', failed, [tracking, 'orphan'], [], false);
check('addition', failed, [sentinel, 'probe.puni.dev/added'], [], false, undefined, true);
check('unchanged-finalizers', failed, originalFinalizers, [], false);
check('ephemeral-subresource', failed, [sentinel], [], false, 'ephemeralcontainers');
expectAdmission(
  'old-create',
  ['create', '--dry-run=server', '-f', '-', '-o', 'json'],
  fixture('old-create-negative'),
  false,
);
requireRequest('restore-original-params', [
  'patch',
  'configmap',
  'puni-trusted-workload',
  '-n',
  'wbs-solver',
  '--type=merge',
  '-p',
  JSON.stringify({ data: { solverImages: params.data.solverImages } }),
  '-o',
  'json',
]);
console.log(
  'Cleanup admission API controls complete; original fixture finalizers remain retained until owned cluster teardown.',
);
