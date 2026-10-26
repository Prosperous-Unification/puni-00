import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type } from 'arktype';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { parseDocument, stringify } from 'yaml';

import {
  assessObservabilityRehearsalAdmission,
  prepareObservabilityRehearsal,
  validateObservabilityRehearsal,
} from './observability-parity-rehearsal';

const root = join(import.meta.dir, '../../..');
const tools = '/tmp/puni-parity-tools';
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

test('stale source revision is rejected even with valid source-shaped packet', () => {
  const prior = Bun.spawnSync(['git', 'rev-parse', 'HEAD^'], { cwd: root })
    .stdout.toString()
    .trim();
  expect(
    validateObservabilityRehearsal(root, tools, { ...request, sourceRevision: prior }, packet),
  ).rejects.toThrow(/provenance/);
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
  await writeFile(executable, '#!/bin/sh\nexec /tmp/puni-parity-tools/kubectl "$@"\n');
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
