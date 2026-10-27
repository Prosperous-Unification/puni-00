import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type } from 'arktype';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { parseAllDocuments, parseDocument, stringify } from 'yaml';

import { cliEnvironment } from './cli.fixture';
import {
  assessObservabilityRehearsalAdmission,
  prepareObservabilityRehearsal,
  validateObservabilityRehearsal,
} from './observability-parity-rehearsal';
import { provisionObservabilityTools } from './observability-tools.fixture';

const tools = await provisionObservabilityTools();
const root = join(import.meta.dir, '../../..');
const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root })
  .stdout.toString()
  .trim();
const request = {
  sourceRevision: revision,
  network: {
    api: ['172.31.100.1/32'],
    observer: ['172.31.100.2/32'],
    grafana: ['172.31.100.3/32'],
    s3: ['172.31.100.4/32'],
    alertDelivery: ['172.31.100.5/32'],
    publicProbes: ['172.31.100.6/32'],
  },
};
let directory: string;
let packet: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'puni-rehearsal-test-'));
  packet = join(directory, 'packet');
  await prepareObservabilityRehearsal(root, tools, request, packet);
});
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

const graph = 'infra/clusters/platform/local';
const services = 'infra/platform/observability/rehearsal';
async function alter(path: string, edit: (document: ReturnType<typeof parseDocument>) => void) {
  const copy = await mkdtemp(join(directory, 'alter-'));
  await cp(packet, copy, { recursive: true });
  const document = parseDocument(await readFile(join(copy, path), 'utf8'));
  edit(document);
  await writeFile(join(copy, path), document.toString());
  return copy;
}

test('packages exact two-instance Flux graph with original dependencies and no runtime certification', async () => {
  const receipt = await validateObservabilityRehearsal(root, tools, request, packet);
  expect(receipt.sourceRevision).toBe(revision);
  expect(receipt.generator.reviewStatus).toBe('unobserved');
  expect(receipt.runtimeRehearsal).toBe(false);
  expect(receipt.liveBinding).toBe(false);
  expect(receipt.transportImplemented).toBe(false);
  expect(receipt.stages).toEqual([
    'target',
    'controllers',
    'storage',
    'policy',
    'secrets',
    'certificates',
    'platform',
    'observability-controllers',
    'observability',
    'alerts',
    'backup',
  ]);
  expect(receipt.helmOwners).toContain('observability-dev/elasticsearch');
  expect(receipt.helmOwners).toContain('observability/elasticsearch');
  expect(
    receipt.helmOwners.filter((owner) => owner.endsWith('/prometheus-controller')),
  ).toHaveLength(1);
  expect(receipt.files.some((file) => file.path.endsWith('/otlp-ingress.yaml'))).toBe(false);
  expect(receipt.files.some((file) => file.path.startsWith('apps/'))).toBe(false);
  expect(
    receipt.externalPrerequisites.some(
      (secret) => secret.namespace === 'observability-dev' && secret.name === 'signal-health-users',
    ),
  ).toBe(true);
  const snapshots = await readFile(
    join(packet, 'infra/platform/backup/elastic/snapshots.yaml'),
    'utf8',
  );
  expect(snapshots).toContain('puni.dev/observability-flow: snapshot-check');
  const alerts = await readFile(join(packet, 'infra/platform/alerts/base/rules.yaml'), 'utf8');
  expect(alerts).toContain('puni.dev/telemetry-instance: prod');
});

test('same revision and generator produce identical per-file and artifact hashes', async () => {
  const second = await prepareObservabilityRehearsal(
    root,
    tools,
    request,
    join(directory, 'second'),
  );
  const first = await validateObservabilityRehearsal(root, tools, request, packet);
  expect(second.files).toEqual(first.files);
  expect(second.artifactSHA256).toBe(first.artifactSHA256);
});

test.each([
  'missing-stage',
  'missing-dependency',
  'missing-marker',
  'foreign-source',
  'wrong-owner',
])('packaged graph refuses %s', async (fault) => {
  const path = fault === 'missing-marker' ? `${graph}/target.yaml` : `${graph}/observability.yaml`;
  const copy = await alter(path, (document) => {
    if (fault === 'missing-stage') document.setIn(['metadata', 'name'], 'foreign');
    if (fault === 'missing-dependency')
      document.setIn(['spec', 'dependsOn'], [{ name: 'platform' }]);
    if (fault === 'missing-marker') document.deleteIn(['spec', 'healthChecks']);
    if (fault === 'foreign-source') document.setIn(['spec', 'sourceRef', 'name'], 'foreign');
    if (fault === 'wrong-owner') document.setIn(['metadata', 'namespace'], 'foreign');
  });
  expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(/graph/);
});

test('packaged broad legacy ingress refuses independently before hash validation', async () => {
  const copy = await alter(`${services}/kustomization.yaml`, (document) => {
    document.addIn(['resources'], 'broad.yaml');
  });
  await writeFile(
    join(copy, services, 'broad.yaml'),
    stringify({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: 'legacy', namespace: 'observability' },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress'],
        ingress: [{ from: [{ namespaceSelector: {} }], ports: [{ protocol: 'TCP', port: 4318 }] }],
      },
    }),
  );
  expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(
    /broad ingress/,
  );
});

test('packaged Secret refuses without exposing material', async () => {
  const copy = await alter(`${services}/kustomization.yaml`, (document) => {
    document.addIn(['resources'], 'secret.yaml');
  });
  await writeFile(
    join(copy, services, 'secret.yaml'),
    stringify({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: 'foreign', namespace: 'observability' },
      stringData: { password: 'PRIVATE-MARKER' },
    }),
  );
  try {
    await validateObservabilityRehearsal(root, tools, request, copy);
    throw new Error('accepted');
  } catch (failure) {
    expect(String(failure)).toContain('Secret');
    expect(String(failure)).not.toContain('PRIVATE-MARKER');
  }
});

test.each(['extra-file', 'altered-bytes', 'missing-file'])(
  'packet file closure refuses %s',
  async (fault) => {
    const copy = await mkdtemp(join(directory, 'files-'));
    await cp(packet, copy, { recursive: true });
    if (fault === 'extra-file') await writeFile(join(copy, 'extra.txt'), 'unused');
    if (fault === 'altered-bytes')
      await writeFile(
        join(copy, 'infra/versions/toolchain.json'),
        (await readFile(join(copy, 'infra/versions/toolchain.json'), 'utf8')) + '\n',
      );
    if (fault === 'missing-file') await rm(join(copy, 'infra/versions/toolchain.json'));
    expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(/file|hash/);
  },
);

test('altered receipt source revision is rejected as provenance mismatch', async () => {
  const copy = await mkdtemp(join(directory, 'provenance-'));
  await cp(packet, copy, { recursive: true });
  const receiptPath = join(copy, 'rehearsal.json');
  const receipt = parseDocument(await readFile(receiptPath, 'utf8'));
  receipt.set('sourceRevision', `${revision.startsWith('0') ? '1' : '0'}${revision.slice(1)}`);
  await writeFile(receiptPath, JSON.stringify(receipt.toJSON()));
  expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(/provenance/);
});

test('unknown source revision cannot generate a packet', () => {
  expect(
    prepareObservabilityRehearsal(
      root,
      tools,
      { ...request, sourceRevision: '0'.repeat(40) },
      join(directory, 'absent'),
    ),
  ).rejects.toThrow(/source revision/);
});

test('fixture receiver cannot certify stack readiness through admission', () => {
  expect(() =>
    assessObservabilityRehearsalAdmission({ availableMemoryMiB: 16383, freeDiskMiB: 100000 }),
  ).toThrow(/16384 MiB required/);
  const admission = assessObservabilityRehearsalAdmission({
    availableMemoryMiB: 32768,
    freeDiskMiB: 100000,
  });
  expect(admission.admitted).toBe(false);
  expect(admission.blockers).toContain(
    'complete two-instance, transient and coexistence budget unobserved',
  );
  expect(admission.runtimeRehearsal).toBe(false);
});

test('prepare preserves the selected graph bytes', async () => {
  const bytes = await readFile(join(root, 'infra/platform/observability/local/kustomization.yaml'));
  const committed = Bun.spawnSync(
    ['git', 'show', `${revision}:infra/platform/observability/local/kustomization.yaml`],
    { cwd: root },
  ).stdout;
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    createHash('sha256').update(committed).digest('hex'),
  );
});

test('prepare refuses selected source destination before writing any packet', () => {
  expect(prepareObservabilityRehearsal(root, tools, request, join(root, 'infra'))).rejects.toThrow(
    /destination/,
  );
});

test('CLI prepare and validate produce source receipts; unknown arguments and malformed inputs refuse safely', async () => {
  const input = join(directory, 'request.json');
  await writeFile(input, JSON.stringify(request));
  const destination = join(directory, 'cli-packet');
  const command = (args: string[]) =>
    Bun.spawnSync(
      ['bun', join(root, 'tools/tool-fleet/src/observability-parity-rehearsal-cli.ts'), ...args],
      { cwd: root, env: { ...process.env, PUNI_PARITY_TOOLS: tools }, timeout: 30000 },
    );
  const prepared = command(['prepare', input, destination]);
  expect(prepared.exitCode).toBe(0);
  expect(
    type({ runtimeRehearsal: 'boolean' }).assert(JSON.parse(prepared.stdout.toString()))
      .runtimeRehearsal,
  ).toBe(false);
  const checked = command(['validate', input, destination]);
  expect(checked.exitCode).toBe(0);
  expect(
    type({ artifactSHA256: 'string' }).assert(JSON.parse(checked.stdout.toString())).artifactSHA256,
  ).toBe(
    type({ artifactSHA256: 'string' }).assert(JSON.parse(prepared.stdout.toString()))
      .artifactSHA256,
  );
  expect(command(['validate', input, destination, 'extra']).exitCode).toBe(1);
  await writeFile(input, 'PRIVATE-MARKER {');
  const malformed = command(['prepare', input, join(directory, 'bad-cli')]);
  expect(malformed.exitCode).toBe(1);
  expect(malformed.stderr.toString()).toContain('input-malformed');
  expect(malformed.stderr.toString()).not.toContain('PRIVATE-MARKER');
});

test.each(['owner', 'source', 'api'])(
  'packaged Helm %s refuses independently before hash validation',
  async (fault) => {
    const copy = await alter(
      `${services}/releases/observability-dev/elasticsearch.yaml`,
      (document) => {
        if (fault === 'owner') document.setIn(['metadata', 'namespace'], 'foreign');
        if (fault === 'source')
          document.setIn(['spec', 'chart', 'spec', 'sourceRef', 'name'], 'foreign');
        if (fault === 'api') document.set('apiVersion', 'foreign/v1');
      },
    );
    expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(
      /graph Helm/,
    );
  },
);

test.each(['absent', 'unreadable', 'malformed'])(
  'packet receipt %s is refused without fallback',
  async (fault) => {
    const copy = await mkdtemp(join(directory, 'receipt-'));
    await cp(packet, copy, { recursive: true });
    if (fault === 'absent') await rm(join(copy, 'rehearsal.json'));
    if (fault === 'unreadable') {
      await rm(join(copy, 'rehearsal.json'));
      await import('node:fs/promises').then(({ mkdir }) => mkdir(join(copy, 'rehearsal.json')));
    }
    if (fault === 'malformed') await writeFile(join(copy, 'rehearsal.json'), '{');
    expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow();
  },
);

test('source receipt inventories every authored claim size without claiming effective capacity', async () => {
  const receipt = await validateObservabilityRehearsal(root, tools, request, packet);
  expect(receipt.declaredCapacity.claimSizeSumMiB).toBe(133120);
  expect(receipt.declaredCapacity.claimTemplates).toHaveLength(13);
  expect(receipt.declaredCapacity.effectiveDemandObserved).toBe(false);
  expect(receipt.declaredCapacity.includesDisabledTemplates).toBe(true);
  expect(
    receipt.declaredCapacity.claimTemplates.find((claim) =>
      claim.file.endsWith('/prometheus-controller.yaml'),
    )?.sizeMiB,
  ).toBe(10240);
  expect(receipt.declaredCapacity.resourcePolicies.length).toBeGreaterThan(20);
});

test('CLI bounds input before parsing for prepare, validate and admit without leaking private input', async () => {
  const input = join(directory, 'oversize.json');
  await writeFile(input, JSON.stringify(request) + ' '.repeat(65536));
  for (const action of ['prepare', 'validate', 'admit']) {
    const child = Bun.spawnSync(
      [
        'bun',
        join(root, 'tools/tool-fleet/src/observability-parity-rehearsal-cli.ts'),
        action,
        input,
        action === 'prepare' ? join(directory, 'oversize-packet') : packet,
      ],
      { cwd: root, env: { ...process.env, PUNI_PARITY_TOOLS: tools }, timeout: 30000 },
    );
    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toContain('input-too-large');
  }
});

test('same-version substituted kubectl is refused before execution', async () => {
  const foreignTools = join(directory, 'foreign-tools');
  await mkdir(foreignTools);
  const executable = join(foreignTools, 'kubectl');
  await writeFile(executable, `#!/bin/sh\nexec '${join(tools, 'kubectl')}' "$@"\n`);
  await chmod(executable, 0o700);
  expect(validateObservabilityRehearsal(root, foreignTools, request, packet)).rejects.toThrow(
    'kubectl integrity',
  );
});

test('CLI unreadable packet refuses without exposing its private path', async () => {
  const input = join(directory, 'private-path-request.json');
  await writeFile(input, JSON.stringify(request));
  const child = Bun.spawnSync(
    [
      'bun',
      join(root, 'tools/tool-fleet/src/observability-parity-rehearsal-cli.ts'),
      'validate',
      input,
      join(directory, 'PRIVATE-MARKER'),
    ],
    { cwd: root, env: { ...process.env, PUNI_PARITY_TOOLS: tools }, timeout: 30000 },
  );
  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString()).toContain('validation-refused');
  expect(child.stderr.toString()).not.toContain('PRIVATE-MARKER');
});

async function withIngress(ingress: unknown) {
  const copy = await alter(`${services}/kustomization.yaml`, (document) => {
    document.addIn(['resources'], 'selector-control.yaml');
  });
  await writeFile(
    join(copy, services, 'selector-control.yaml'),
    stringify({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: 'selector-control', namespace: 'observability' },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress'],
        ...(ingress === undefined ? {} : { ingress }),
      },
    }),
  );
  return copy;
}

test.each([
  { namespaceSelector: { matchLabels: {} } },
  { namespaceSelector: { matchExpressions: [] } },
  { podSelector: { matchLabels: {} } },
  { podSelector: { matchExpressions: [] } },
  { namespaceSelector: { matchLabels: {} }, podSelector: { matchExpressions: [] } },
  { namespaceSelector: { matchLabels: {} }, podSelector: { matchLabels: { app: 'collector' } } },
  { namespaceSelector: { matchExpressions: [{ key: 'app', operator: 'Exists' }] } },
  { namespaceSelector: { matchLabels: { app: 'collector' }, unknown: true } },
])(
  'semantic ingress guard refuses unconstrained or unsupported selector %j before hashes',
  async (peer) => {
    const copy = await withIngress([{ from: [peer] }]);
    expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(
      /broad ingress/,
    );
  },
);

test.each([
  {
    ingress: [
      {
        from: [
          {
            namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'observability' } },
            podSelector: { matchLabels: {} },
          },
        ],
      },
    ],
  },
  { ingress: [{ from: [{ podSelector: { matchLabels: { app: 'collector' } } }] }] },
  { ingress: [] },
  { ingress: undefined },
])(
  'semantic ingress guard preserves narrow peers or deny-all before byte closure %j',
  async ({ ingress }) => {
    const copy = await withIngress(ingress);
    expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(
      /file closure/,
    );
  },
);

test.each([{}, { from: [] }])(
  'semantic ingress guard still refuses unrestricted from %j',
  async (rule) => {
    const copy = await withIngress([rule]);
    expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(
      /broad ingress/,
    );
  },
);

test('complete packet receipt distinguishes exact external material from packaged Secret producers', async () => {
  const receipt = await validateObservabilityRehearsal(root, tools, request, packet);
  const needed = [
    ['puni-registry', 'registry-auth', ['htpasswd']],
    ['puni-backup', 'object-store-root', ['MINIO_ROOT_PASSWORD', 'MINIO_ROOT_USER']],
    ['puni-backup', 'object-store-tls', ['tls.crt', 'tls.key']],
    ['puni-backup', 'object-store-ca', ['ca.crt']],
    ['puni-backup', 'velero-credentials', ['cloud']],
    ['puni-backup', 'velero-repo-credentials', ['repository-password']],
    ['observability', 'otel-server-ca', ['tls.crt', 'tls.key']],
    ['observability', 'otel-client-trust', ['ca.crt']],
    ['flux-system', 'platform-local-kubeconfig', ['value.yaml']],
    ['flux-system', 'sops-age', ['age.agekey']],
  ] as const;
  for (const [namespace, name, keys] of needed) {
    const declaration = receipt.externalPrerequisites.find(
      (secret) => secret.namespace === namespace && secret.name === name,
    );
    expect(declaration?.keys.toSorted()).toEqual([...keys]);
    expect(declaration?.provisioner).toBe('external');
  }
  expect(receipt.externalPrerequisites.every((secret) => secret.provisioner === 'external')).toBe(
    true,
  );
  for (const [namespace, name, provisioner] of [
    ['puni-registry', 'registry-ca', 'cert-manager'],
    ['puni-registry', 'registry-tls', 'cert-manager'],
    ['observability', 'otel-server-tls', 'cert-manager'],
    ['observability', 'elasticsearch-es-elastic-user', 'eck'],
    ['observability-dev', 'kibana-kb-http-certs-public', 'eck'],
    ['observability', 'kps-admission', 'helm-hook'],
  ])
    expect(
      receipt.controllerSecrets.some(
        (secret) =>
          secret.namespace === namespace &&
          secret.name === name &&
          secret.provisioner === provisioner,
      ),
    ).toBe(true);
  expect(
    receipt.secretReferences.find(
      (reference) => reference.namespace === 'puni-backup' && reference.name === 'object-store-ca',
    )?.keys,
  ).toEqual(['ca.crt']);
});

test.each([
  'native-name',
  'native-key',
  'ca-reference',
  'controller-producer',
  'missing-declaration',
  'declaration-shape',
  'duplicate-producer',
  'webhook-producer',
])('Secret reference closure refuses %s independently before hashes', async (fault) => {
  const copy = await mkdtemp(join(directory, 'secret-reference-'));
  await cp(packet, copy, { recursive: true });
  if (fault === 'declaration-shape') {
    const path = join(copy, 'infra/platform/secrets/platform-local/externally-provided.json');
    const declarations = type('object[]').assert(JSON.parse(await readFile(path, 'utf8')));
    declarations.push({
      namespace: 'observability',
      name: 'unexpected',
      source: 'operator',
      unknown: 'PRIVATE-MARKER',
    });
    await writeFile(path, JSON.stringify(declarations));
  } else if (fault === 'missing-declaration') {
    const path = join(copy, 'infra/platform/secrets/platform-local/externally-provided.json');
    const declarations = type({ namespace: 'string', name: 'string', source: 'string' })
      .array()
      .assert(JSON.parse(await readFile(path, 'utf8')));
    await writeFile(
      path,
      JSON.stringify(declarations.filter((declaration) => declaration.name !== 'registry-auth')),
    );
  } else if (fault === 'duplicate-producer') {
    await writeFile(
      join(copy, services, 'duplicate-producer.yaml'),
      stringify({
        apiVersion: 'cert-manager.io/v1',
        kind: 'Certificate',
        metadata: { name: 'duplicate', namespace: 'puni-registry' },
        spec: { secretName: 'registry-tls' },
      }),
    );
  } else if (fault === 'webhook-producer') {
    const path = join(copy, controllers, 'releases/observability/prometheus-controller.yaml');
    const document = parseDocument(await readFile(path, 'utf8'));
    document.setIn(
      ['spec', 'values', 'prometheusOperator', 'admissionWebhooks', 'patch', 'enabled'],
      false,
    );
    await writeFile(path, document.toString());
  } else if (fault === 'controller-producer') {
    await writeFile(join(copy, 'infra/platform/registry/local/issuers.yaml'), '');
  } else if (fault === 'ca-reference') {
    const path = join(copy, 'infra/platform/backup/velero/local/velero.yaml');
    const document = parseDocument(await readFile(path, 'utf8'));
    document.setIn(
      ['spec', 'values', 'extraObjects', 0, 'spec', 'objectStorage', 'caCertRef', 'name'],
      'undeclared-ca',
    );
    await writeFile(path, document.toString());
  } else {
    await writeFile(
      join(copy, services, 'reference-control.yaml'),
      stringify({
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name: 'reference-control', namespace: 'observability' },
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'consumer',
                  image: 'busybox',
                  env: [
                    {
                      name: 'INPUT',
                      valueFrom: {
                        secretKeyRef: {
                          name:
                            fault === 'native-name'
                              ? 'undeclared-material'
                              : 'signal-elastic-ingest',
                          key: fault === 'native-key' ? 'undeclared-key' : 'password',
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      }),
    );
  }
  expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(
    /Secret reference/,
  );
});

const controllers = 'infra/platform/observability/rehearsal-controllers';
const controller = 'releases/observability/prometheus-controller.yaml';

test('controller barrier builds the sole provider before four native ServiceMonitor consumers', async () => {
  const stage = parseDocument(
    await readFile(join(packet, graph, 'observability-controllers.yaml'), 'utf8'),
  );
  const Stage = type({ spec: { dependsOn: type({ name: 'string' }).array() } });
  expect(Stage.assert(stage.toJSON() as unknown).spec.dependsOn).toEqual([
    { name: 'platform' },
    { name: 'certificates' },
  ]);
  expect(stage.getIn(['spec', 'wait'])).toBe(true);
  expect(stage.getIn(['spec', 'timeout'])).toBe('20m');
  const main = parseDocument(await readFile(join(packet, graph, 'observability.yaml'), 'utf8'));
  expect(Stage.assert(main.toJSON() as unknown).spec.dependsOn).toEqual([
    { name: 'platform' },
    { name: 'certificates' },
    { name: 'observability-controllers' },
  ]);
  function build(path: string) {
    const child = Bun.spawnSync([join(tools, 'kubectl'), 'kustomize', join(packet, path)], {
      cwd: root,
    });
    expect(child.exitCode).toBe(0);
    const Resource = type({ kind: 'string', metadata: { name: 'string', 'namespace?': 'string' } });
    return parseAllDocuments(child.stdout.toString()).map((document) =>
      Resource.assert(document.toJSON() as unknown),
    );
  }
  const provider = build(controllers);
  expect(provider).toHaveLength(1);
  expect(provider[0]).toMatchObject({
    kind: 'HelmRelease',
    metadata: { name: 'prometheus-controller', namespace: 'observability' },
    spec: { chart: { spec: { version: '91.4.1' } }, values: { crds: { enabled: true } } },
  });
  const consumers = build(services);
  expect(
    consumers
      .filter((manifest) => manifest.kind === 'ServiceMonitor')
      .map((manifest) => manifest.metadata.namespace)
      .sort(),
  ).toEqual(['observability', 'observability', 'observability-dev', 'observability-dev']);
  expect(consumers.filter((manifest) => manifest.kind === 'HelmRelease')).toHaveLength(8);
  expect(
    consumers.some(
      (manifest) =>
        manifest.kind === 'HelmRelease' && manifest.metadata.name === 'prometheus-controller',
    ),
  ).toBe(false);
  expect(
    consumers.find(
      (manifest) => manifest.kind === 'HelmRelease' && manifest.metadata.name === 'eck-operator',
    ),
  ).toBeDefined();
});

test.each(['dependency', 'wait', 'timeout', 'health-override'])(
  'controller barrier refuses %s before file hashes',
  async (fault) => {
    const copy = await alter(
      `${graph}/${fault === 'dependency' ? 'observability' : 'observability-controllers'}.yaml`,
      (document) => {
        if (fault === 'dependency')
          document.setIn(['spec', 'dependsOn'], [{ name: 'platform' }, { name: 'certificates' }]);
        if (fault === 'wait') document.setIn(['spec', 'wait'], false);
        if (fault === 'timeout') document.setIn(['spec', 'timeout'], '0s');
        if (fault === 'health-override')
          document.setIn(
            ['spec', 'healthCheckExprs'],
            [{ apiVersion: 'helm.toolkit.fluxcd.io/v2', kind: 'HelmRelease', current: 'true' }],
          );
      },
    );
    expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(
      'Rehearsal graph prerequisite differs',
    );
  },
);

test.each(['same-stage', 'extra-controller-consumer', 'missing-monitor'])(
  'controller barrier independently refuses %s before file hashes',
  async (fault) => {
    const copy = await mkdtemp(join(directory, 'ordering-'));
    await cp(packet, copy, { recursive: true });
    const mainPath = join(copy, services, 'kustomization.yaml');
    const earlyPath = join(copy, controllers, 'kustomization.yaml');
    const main = parseDocument(await readFile(mainPath, 'utf8'));
    const early = parseDocument(await readFile(earlyPath, 'utf8'));
    if (fault === 'same-stage') {
      await cp(join(copy, controllers, controller), join(copy, services, controller));
      await rm(join(copy, controllers, controller));
      main.addIn(['resources'], controller);
      early.set('resources', []);
    }
    if (fault === 'extra-controller-consumer')
      early.addIn(['resources'], '../rehearsal/observability-native.yaml');
    if (fault === 'missing-monitor') {
      const path = join(copy, services, 'observability-native.yaml');
      const native = parseAllDocuments(await readFile(path, 'utf8'));
      let removed = false;
      await writeFile(
        path,
        native
          .filter((document) => {
            if (!removed && document.get('kind') === 'ServiceMonitor') {
              removed = true;
              return false;
            }
            return true;
          })
          .map((document) => document.toString())
          .join('---\n'),
      );
    }
    await writeFile(mainPath, main.toString());
    await writeFile(earlyPath, early.toString());
    expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(
      'Rehearsal controller ordering differs',
    );
  },
);

test.each([
  'remote-reference',
  'absolute-reference',
  'escaping-reference',
  'duplicate-reference',
  'missing-reference',
  'unsupported-transform',
])('controller barrier bounds packet reference %s', async (fault) => {
  const copy = await alter(`${controllers}/kustomization.yaml`, (document) => {
    if (fault === 'remote-reference')
      document.addIn(['resources'], 'https://example.invalid/provider.yaml');
    if (fault === 'absolute-reference') document.addIn(['resources'], '/etc/passwd');
    if (fault === 'escaping-reference')
      document.addIn(['resources'], '../../../../../outside.yaml');
    if (fault === 'duplicate-reference') document.addIn(['resources'], controller);
    if (fault === 'missing-reference') document.addIn(['resources'], 'missing.yaml');
    if (fault === 'unsupported-transform') document.set('namespace', 'foreign');
  });
  expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(
    'Rehearsal controller ordering differs',
  );
});

async function injectFactoryFault(name: string, before: string, after: string) {
  const path = join(root, 'tools/tool-fleet/src/observability-parity-rehearsal.ts');
  const source = await readFile(path, 'utf8');
  if (!source.includes(before)) throw new Error('Factory fault injection anchor absent');
  const injected = source
    .replace(before, after)
    .replace(/from '([^']+)'/g, (statement: string, specifier: string) =>
      specifier.startsWith('node:')
        ? statement
        : `from ${JSON.stringify(Bun.resolveSync(specifier, join(root, 'tools/tool-fleet/src')))}`,
    );
  const module = join(directory, `${name}.ts`);
  await writeFile(module, injected);
  const runner = join(directory, `${name}-runner.ts`);
  await writeFile(
    runner,
    `const {prepareObservabilityRehearsal} = await import(${JSON.stringify(module)});\ntry { await prepareObservabilityRehearsal(${JSON.stringify(root)}, ${JSON.stringify(tools)}, ${JSON.stringify(request)}, ${JSON.stringify(join(directory, name))}); } catch (failure) { console.error(failure.message); process.exit(1); }`,
  );
  return Bun.spawnSync(['bun', runner], { cwd: root, env: cliEnvironment(), timeout: 30000 });
}

test('controller barrier rejects matching broken-factory bytes with provider back beside consumers', async () => {
  const child = await injectFactoryFault(
    'same-stage-factory',
    "const isController = release.owner === 'observability/prometheus-controller';",
    'const isController = false;',
  );
  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString().trim()).toBe('Rehearsal controller ordering differs');
});

test('controller barrier rejects empty actual pinned controller-stage output', async () => {
  const child = await injectFactoryFault(
    'empty-controller-build',
    'const built = documents(rendered);',
    "const built = stage === 'observability-controllers' ? [] : documents(rendered);",
  );
  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString().trim()).toBe('Rehearsal graph controller build differs');
});

test('controller barrier refuses a mismatched early release identity before file hashes', async () => {
  const copy = await alter(`${controllers}/${controller}`, (document) => {
    document.setIn(['metadata', 'namespace'], 'foreign');
  });
  expect(validateObservabilityRehearsal(root, tools, request, copy)).rejects.toThrow(
    'Rehearsal graph Helm owner, API or source differs',
  );
});

test('controller barrier rejects matching broken-factory bytes without the dependency edge', async () => {
  const child = await injectFactoryFault(
    'missing-barrier-factory',
    "observability: ['platform', 'certificates', 'observability-controllers'],",
    "observability: ['platform', 'certificates'],",
  );
  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString().trim()).toBe('Rehearsal graph prerequisite differs');
});
