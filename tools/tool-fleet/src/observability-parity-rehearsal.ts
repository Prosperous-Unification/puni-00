import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { isNode, parseAllDocuments, parseDocument, stringify } from 'yaml';

import { readToolchain } from './contracts';
import { type HostCapacity, requireProfileResources } from './k3d-lab';
import { inspectRehearsalSecrets } from './observability-rehearsal-secrets';
import { createObservabilitySource } from './observability-source';

const SHA = /^[a-f0-9]{40}$/;
const Request = type({ sourceRevision: SHA, network: 'unknown', '+': 'reject' });
const graph = 'infra/clusters/platform/local';
const services = 'infra/platform/observability/rehearsal';
const receiptName = 'rehearsal.json';
const dependencies: Record<string, string[]> = {
  target: [],
  controllers: ['target'],
  storage: ['controllers'],
  policy: ['controllers'],
  secrets: ['policy'],
  certificates: ['controllers', 'secrets'],
  platform: ['storage', 'secrets'],
  observability: ['platform', 'certificates'],
  alerts: ['observability'],
  backup: ['alerts'],
};
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function execute(arguments_: string[], cwd: string, input?: Uint8Array): Buffer {
  const child = Bun.spawnSync(arguments_, {
    cwd,
    stdin: input,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (child.exitCode !== 0) throw new Error('Rehearsal required command failed');
  return child.stdout;
}
async function collectFiles(directory: string, prefix = ''): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Rehearsal symbolic file refused');
    if (entry.isDirectory()) paths.push(...(await collectFiles(directory, path)));
    else if (entry.isFile()) paths.push(path);
    else throw new Error('Rehearsal unsupported file');
  }
  return paths.sort();
}
function documents(bytes: string) {
  return parseAllDocuments(bytes)
    .map((document) => {
      if (document.errors.length) throw new Error('Rehearsal malformed YAML');
      return document;
    })
    .filter((document) => document.toJSON() !== null);
}
function describeCapacity(files: Map<string, Buffer>) {
  const claimTemplates: { file: string; path: string; storage: string; sizeMiB: number }[] = [];
  const resourcePolicies: {
    file: string;
    path: string;
    quantities: Record<string, string | number>;
  }[] = [];
  function visit(value: unknown, file: string, path: string): void {
    if (Array.isArray(value)) {
      value.forEach((entry: unknown, index) => {
        visit(entry, file, `${path}/${String(index)}`);
      });
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const key of Object.keys(value)) {
      const child: unknown = Reflect.get(value, key);
      const next = `${path}/${key}`;
      if (key === 'requests' || key === 'limits') {
        const quantities = type('Record<string,string|number>').assert(child);
        resourcePolicies.push({ file, path: next, quantities });
        if (key === 'requests' && Object.hasOwn(quantities, 'storage')) {
          const storage = type(/^[1-9][0-9]*(?:Mi|Gi)$/).assert(quantities['storage']);
          const sizeMiB = Number(storage.slice(0, -2)) * (storage.endsWith('Gi') ? 1024 : 1);
          claimTemplates.push({ file, path: `${next}/storage`, storage, sizeMiB });
        }
      } else visit(child, file, next);
    }
  }
  for (const [path, bytes] of [...files].sort(([left], [right]) => left.localeCompare(right)))
    if (path.endsWith('.yaml'))
      documents(bytes.toString()).forEach((document, index) => {
        visit(document.toJSON(), path, `/${String(index)}`);
      });
  return {
    scope: 'authored-template-sizes' as const,
    includesDisabledTemplates: true as const,
    claimTemplates,
    claimSizeSumMiB: claimTemplates.reduce((sum, claim) => sum + claim.sizeMiB, 0),
    resourcePolicies,
    effectiveDemandObserved: false as const,
    unknowns: [
      'controller-generated replica/init/sidecar demand',
      'current-node hostPath writable state bounds',
      'k3d/system and image/build scratch demand',
      'backup/recovery/transient and existing workload coexistence demand',
    ],
  };
}
async function generatorProvenance(root: string) {
  const paths = [
    'tools/tool-fleet/src',
    'tools/tool-observability-stack/src/configuration',
    'tsconfig.base.json',
    'bun.lock',
    'package.json',
  ];
  const names = execute(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...paths],
    root,
  )
    .toString()
    .split('\0')
    .filter((path) => path && !path.endsWith('.test.ts'))
    .sort();
  const files = await Promise.all(
    names.map(async (path) => ({ path, sha256: hash(await readFile(join(root, path))) })),
  );
  return {
    revision: execute(['git', 'rev-parse', 'HEAD'], root).toString().trim(),
    dirty: execute(['git', 'status', '--porcelain', '--', ...paths], root).length > 0,
    reviewStatus: 'unobserved' as const,
    files,
  };
}
async function buildPacket(root: string, input: unknown) {
  const request = Request(input);
  if (request instanceof type.errors) throw new Error('Rehearsal invalid request');
  const resolved = Bun.spawnSync(
    ['git', 'rev-parse', '--verify', `${request.sourceRevision}^{commit}`],
    { cwd: root, timeout: 10000 },
  );
  if (resolved.exitCode !== 0 || resolved.stdout.toString().trim() !== request.sourceRevision)
    throw new Error('Rehearsal source revision unavailable');
  const exported = await mkdtemp(join(tmpdir(), 'puni-rehearsal-source-'));
  try {
    execute(
      ['tar', '-xf', '-', '-C', exported],
      root,
      execute(['git', 'archive', '--format=tar', request.sourceRevision, 'infra'], root),
    );
    const source = await createObservabilitySource(exported, {
      placement: 'local',
      instances: [
        { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
        { environment: 'prod', namespace: 'observability', policy: 'disposable-rehearsal' },
      ],
      network: request.network,
    });
    const files = new Map<string, Buffer>();
    const put = (path: string, bytes: string) => files.set(path, Buffer.from(bytes));
    const resourceNames: string[] = [];
    for (const release of source.releases) {
      const path = `releases/${release.owner}.yaml`;
      put(`${services}/${path}`, release.manifest);
      resourceNames.push(path);
    }
    for (const instance of source.instances) {
      for (const part of ['native', 'security'] as const) {
        const path = `${instance.namespace}-${part}.yaml`;
        put(`${services}/${path}`, instance[part]);
        resourceNames.push(path);
      }
    }
    for (const handoff of source.handoffs.filter((handoff) => handoff.enabled)) {
      const patched = handoff.resources
        .map((resource) => {
          const document = parseDocument(resource.manifest);
          for (const input of resource.patches) {
            const patch = type({ op: "'add'", path: 'string', value: 'unknown' }).assert(input);
            document.setIn(patch.path.slice(1).split('/'), document.createNode(patch.value));
          }
          return document.toString();
        })
        .join('---\n');
      put(handoff.path, patched);
      if (handoff.owner === 'flux-system/observability') {
        put(
          'infra/platform/observability/prometheus/kustomization.yaml',
          stringify({
            apiVersion: 'kustomize.config.k8s.io/v1beta1',
            kind: 'Kustomization',
            resources: ['blackbox-exporter.yaml'],
          }),
        );
        resourceNames.push('../prometheus');
      }
    }
    // Keep the platform reader's declared service, never its legacy permissive policy.
    const listeners = documents(
      await readFile(
        join(exported, 'infra/platform/observability/local/otlp-ingress.yaml'),
        'utf8',
      ),
    ).filter((document) => document.get('kind') === 'Service');
    put(
      `${services}/retained-service.yaml`,
      listeners.map((document) => document.toString()).join('---\n'),
    );
    for (const name of ['telemetry.yaml', 'receiver.yaml'])
      put(
        `${services}/${name}`,
        await readFile(join(exported, 'infra/platform/observability/local', name), 'utf8'),
      );
    resourceNames.push('retained-service.yaml', 'telemetry.yaml', 'receiver.yaml');
    put(
      `${services}/kustomization.yaml`,
      stringify({
        apiVersion: 'kustomize.config.k8s.io/v1beta1',
        kind: 'Kustomization',
        resources: resourceNames,
      }),
    );
    const observability = parseDocument(
      await readFile(join(exported, graph, 'observability.yaml'), 'utf8'),
    );
    observability.setIn(['spec', 'path'], `./${services}`);
    put(`${graph}/observability.yaml`, observability.toString());
    const namespaces = await readFile(
      join(exported, 'infra/platform/policy/namespaces.yaml'),
      'utf8',
    );
    put(
      'infra/platform/policy/namespaces.yaml',
      `${namespaces}\n---\n${stringify({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'observability-dev', labels: { 'pod-security.kubernetes.io/enforce': 'restricted', 'pod-security.kubernetes.io/enforce-version': 'latest' } } })}`,
    );

    const visited = new Set<string>();
    async function collect(path: string): Promise<void> {
      path = relative(exported, resolve(exported, path));
      if (!path.startsWith('infra/')) throw new Error('Rehearsal source path escapes infra');
      if (visited.has(path)) return;
      visited.add(path);
      const generatedDirectory = files.has(`${path}/kustomization.yaml`);
      const status =
        files.has(path) || generatedDirectory ? undefined : await lstat(join(exported, path));
      if (status?.isSymbolicLink()) throw new Error('Rehearsal source symbolic file refused');
      if (generatedDirectory || status?.isDirectory()) {
        await collect(`${path}/kustomization.yaml`);
        return;
      }
      const bytes = files.get(path) ?? (await readFile(join(exported, path)));
      files.set(path, bytes);
      if (!path.endsWith('.yaml')) return;
      for (const document of documents(bytes.toString())) {
        if (document.get('kind') === 'HelmRelease') {
          const chart = type('string').assert(document.getIn(['spec', 'chart', 'spec', 'chart']));
          await collect(chart);
        }
        if (
          document.get('kind') !== 'Kustomization' ||
          document.get('apiVersion') !== 'kustomize.config.k8s.io/v1beta1'
        )
          continue;
        const kustomization = type({
          resources: 'string[]',
          'configMapGenerator?': type({ files: 'string[]' }).array(),
        }).assert(document.toJSON());
        for (const resource of kustomization.resources)
          await collect(join(dirname(path), resource));
        for (const generator of kustomization.configMapGenerator ?? [])
          for (const filename of generator.files)
            await collect(join(dirname(path), filename.split('=').at(-1) ?? filename));
      }
    }
    await collect(graph);
    for (const stage of Object.keys(dependencies)) {
      const document = parseDocument(
        (
          files.get(`${graph}/${stage}.yaml`) ??
          (await readFile(join(exported, graph, `${stage}.yaml`)))
        ).toString(),
      );
      await collect(type('string').assert(document.getIn(['spec', 'path'])));
    }
    await collect('infra/versions/toolchain.json');
    await collect('infra/platform/secrets/platform-local/externally-provided.json');
    const instanceSecrets = source.instances.flatMap((instance) =>
      instance.requiredSecrets.map((secret) => ({ namespace: instance.namespace, ...secret })),
    );
    const secretInventory = inspectRehearsalSecrets(files, instanceSecrets);
    const hashes = [...files]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, bytes]) => ({ path, sha256: hash(bytes) }));
    return {
      files,
      instanceSecrets,
      receipt: {
        schemaVersion: 1 as const,
        scope: 'disposable-observability-source' as const,
        sourceRevision: request.sourceRevision,
        sourceReviewStatus: 'unobserved' as const,
        generator: await generatorProvenance(root),
        network: source.network,
        files: hashes,
        artifactSHA256: hash(encode(hashes)),
        stages: Object.keys(dependencies),
        declaredCapacity: describeCapacity(files),
        helmOwners: source.releases.map((release) => release.owner),
        ...secretInventory,
        remainingPrerequisites: [
          'resolve declared external material and observe controller-produced Secrets',
          'observed network bindings and instance-distinct material',
          'full two-instance, transient and coexistence budget',
          'exact authenticated Flux source transport',
          'complete owned resource identities',
        ],
        transportImplemented: false as const,
        runtimeRehearsal: false as const,
        liveBinding: false as const,
      },
    };
  } finally {
    await rm(exported, { recursive: true, force: true });
  }
}
export type ObservabilityRehearsalReceipt = Awaited<ReturnType<typeof buildPacket>>['receipt'];

/** Package the exact Git input using separately identified generator bytes. This prepares source only; it neither creates a lab nor certifies reconciliation or runtime acceptance. */
export async function prepareObservabilityRehearsal(
  root: string,
  tools: string,
  input: unknown,
  destination: string,
): Promise<ObservabilityRehearsalReceipt> {
  const within = relative(resolve(root), resolve(destination));
  if (within === '' || (!within.startsWith('../') && !within.startsWith('.puni/')))
    throw new Error('Rehearsal destination must be outside source or inside ignored lab state');
  const packet = await buildPacket(root, input);
  await mkdir(destination);
  for (const [path, bytes] of packet.files) {
    await mkdir(dirname(join(destination, path)), { recursive: true });
    await writeFile(join(destination, path), bytes);
  }
  await writeFile(join(destination, receiptName), encode(packet.receipt));
  return validateObservabilityRehearsal(root, tools, input, destination);
}

const Identity = type({
  apiVersion: 'string',
  kind: 'string',
  metadata: { name: 'string', 'namespace?': 'string' },
});
function requireGraph(source: string, stage: string): void {
  // Proof: bypassing this guard failed all five packaged-graph negatives: only hash refusal remained.
  const manifest = type({
    apiVersion: "'kustomize.toolkit.fluxcd.io/v1'",
    kind: "'Kustomization'",
    metadata: { name: 'string', namespace: 'string' },
    spec: {
      sourceRef: { kind: 'string', name: 'string' },
      kubeConfig: { secretRef: { name: 'string' } },
      decryption: { provider: 'string', secretRef: { name: 'string' } },
      'dependsOn?': type({ name: 'string' }).array(),
      'healthChecks?': 'unknown[]',
      path: 'string',
      prune: 'boolean',
      'wait?': 'boolean',
    },
  })(parseDocument(source).toJSON());
  if (
    manifest instanceof type.errors ||
    manifest.metadata.name !== stage ||
    manifest.metadata.namespace !== 'flux-system' ||
    manifest.spec.sourceRef.kind !== 'GitRepository' ||
    manifest.spec.sourceRef.name !== 'puni-platform' ||
    manifest.spec.kubeConfig.secretRef.name !== 'platform-local-kubeconfig' ||
    manifest.spec.decryption.provider !== 'sops' ||
    manifest.spec.decryption.secretRef.name !== 'sops-age' ||
    !manifest.spec.prune ||
    !isDeepStrictEqual(
      manifest.spec.dependsOn ?? [],
      dependencies[stage].map((name) => ({ name })),
    ) ||
    (stage !== 'target' && manifest.spec.wait !== true) ||
    (stage === 'target' &&
      !isDeepStrictEqual(manifest.spec.healthChecks, [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          name: 'puni-cluster-platform-local',
          namespace: 'kube-system',
        },
      ])) ||
    (stage === 'observability' && manifest.spec.path !== `./${services}`)
  )
    throw new Error('Rehearsal graph prerequisite differs');
}
/** Only equality selectors used by this packet are supported; empty syntax is unconstrained, and expression evaluation is deliberately unsupported. */
function constrainsSelector(input: unknown): boolean {
  // Proof: forcing true failed eight empty/unsupported-selector negatives; only file closure remained.
  const selector = type({
    'matchLabels?': 'Record<string,string>',
    'matchExpressions?': 'unknown[]',
    '+': 'reject',
  })(input);
  if (
    selector instanceof type.errors ||
    Array.isArray(input) ||
    Array.isArray(selector.matchLabels) ||
    (selector.matchExpressions !== undefined && selector.matchExpressions.length > 0)
  )
    throw new Error('Rehearsal broad ingress refused');
  return selector.matchLabels !== undefined && Object.keys(selector.matchLabels).length > 0;
}
function requireProtectedResources(source: string, path?: string): void {
  for (const document of documents(source)) {
    if (document.get('kind') === 'Kustomization') continue;
    const manifest = Identity.assert(document.toJSON());
    if (
      manifest.kind === 'Secret' ||
      /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(document.toString())
    )
      // Proof: bypassing protected-resource checks changed the injected Secret refusal to file closure; its negative failed.
      throw new Error('Rehearsal Secret material refused');
    if (manifest.kind === 'HelmRelease') {
      const reference = document.getIn(['spec', 'chart', 'spec', 'sourceRef'], true);
      if (
        manifest.apiVersion !== 'helm.toolkit.fluxcd.io/v2' ||
        !isNode(reference) ||
        !isDeepStrictEqual(reference.toJSON(), {
          kind: 'GitRepository',
          name: 'puni-platform',
          namespace: 'flux-system',
        }) ||
        (path?.startsWith(`${services}/releases/`) &&
          path !==
            `${services}/releases/${manifest.metadata.namespace ?? '_'}/${manifest.metadata.name}.yaml`)
      )
        // Proof: bypassing protected-resource checks failed owner/source/API negatives with only hash refusal.
        throw new Error('Rehearsal graph Helm owner, API or source differs');
    }
    if (
      manifest.kind !== 'NetworkPolicy' ||
      !['observability', 'observability-dev'].includes(manifest.metadata.namespace ?? '')
    )
      continue;
    // Proof: bypassing protected-resource checks changed broad namespace ingress to file-closure refusal; its negative failed.
    const rules =
      type({ spec: { 'ingress?': type({ 'from?': 'object[]' }).array() } }).assert(
        document.toJSON(),
      ).spec.ingress ?? [];
    for (const rule of rules) {
      if (!rule.from?.length) throw new Error('Rehearsal broad ingress refused');
      for (const peer of rule.from) {
        const entry = type({
          'namespaceSelector?': 'unknown',
          'podSelector?': 'unknown',
          'ipBlock?': { cidr: 'string' },
          '+': 'reject',
        })(peer);
        if (entry instanceof type.errors) throw new Error('Rehearsal broad ingress refused');
        if (entry.ipBlock !== undefined) {
          if (
            entry.namespaceSelector !== undefined ||
            entry.podSelector !== undefined ||
            !entry.ipBlock.cidr.endsWith('/32')
          )
            throw new Error('Rehearsal broad ingress refused');
          continue;
        }
        const namespaceConstrained =
          entry.namespaceSelector === undefined
            ? false
            : constrainsSelector(entry.namespaceSelector);
        const podConstrained =
          entry.podSelector === undefined ? false : constrainsSelector(entry.podSelector);
        if (
          (entry.namespaceSelector !== undefined && !namespaceConstrained) ||
          (!namespaceConstrained && !podConstrained)
        )
          throw new Error('Rehearsal broad ingress refused');
      }
    }
  }
}
async function validateBuilds(
  root: string,
  tools: string,
  directory: string,
  expected: Awaited<ReturnType<typeof buildPacket>>,
) {
  const lock = await readToolchain(join(directory, 'infra/versions/toolchain.json'));
  const kubectl = join(tools, 'kubectl');
  // Proof: a same-version wrapper was accepted before this SHA-256 check; substituted-kubectl negative failed.
  if (hash(await readFile(kubectl)) !== lock.binaries.kubectl.sha256)
    throw new Error('Rehearsal kubectl integrity differs');
  if (
    !execute([kubectl, 'version', '--client'], root)
      .toString()
      .includes(`Client Version: ${lock.binaries.kubectl.version}`)
  )
    throw new Error('Rehearsal kubectl version differs');
  const rootBuild = execute([kubectl, 'kustomize', join(directory, graph)], root).toString();
  const roots = documents(rootBuild).map((document) => Identity.assert(document.toJSON()));
  if (
    !isDeepStrictEqual(
      roots
        .filter((manifest) => manifest.kind === 'Kustomization')
        .map((manifest) => manifest.metadata.name)
        .sort(),
      Object.keys(dependencies).sort(),
    ) ||
    roots.length !== Object.keys(dependencies).length + 1
  )
    throw new Error('Rehearsal graph stage closure differs');
  const owners: string[] = [];
  const seen = new Set<string>();
  for (const stage of Object.keys(dependencies)) {
    const path = join(directory, graph, `${stage}.yaml`);
    const source = await readFile(path, 'utf8');
    requireGraph(source, stage);
    const destination = type('string').assert(parseDocument(source).getIn(['spec', 'path']));
    const rendered = execute([kubectl, 'kustomize', join(directory, destination)], root).toString();
    requireProtectedResources(rendered);
    for (const document of documents(rendered)) {
      const manifest = Identity.assert(document.toJSON());
      const identity = `${manifest.apiVersion}:${manifest.kind}:${manifest.metadata.namespace ?? '_'}:${manifest.metadata.name}`;
      if (seen.has(identity)) throw new Error('Rehearsal graph duplicate owner');
      seen.add(identity);
      if (manifest.kind !== 'HelmRelease') continue;
      if (manifest.apiVersion !== 'helm.toolkit.fluxcd.io/v2')
        throw new Error('Rehearsal graph Helm API differs');
      const release = type({
        spec: {
          chart: {
            spec: {
              chart: 'string',
              version: 'string',
              sourceRef: { kind: 'string', name: 'string', namespace: 'string' },
            },
          },
        },
      }).assert(document.toJSON());
      const chart = release.spec.chart.spec;
      if (
        !isDeepStrictEqual(chart.sourceRef, {
          kind: 'GitRepository',
          name: 'puni-platform',
          namespace: 'flux-system',
        })
      )
        throw new Error('Rehearsal graph chart source differs');
      const pin = Object.values(lock.charts).find(
        (pin) =>
          chart.chart ===
            `./infra/platform/charts/${pin.url.slice(pin.url.lastIndexOf('/') + 1)}` &&
          pin.version === chart.version,
      );
      if (hash(await readFile(join(directory, chart.chart))) !== pin?.sha256)
        throw new Error('Rehearsal graph chart pin differs');
      if (stage === 'observability')
        owners.push(`${manifest.metadata.namespace ?? '_'}/${manifest.metadata.name}`);
    }
  }
  if (!isDeepStrictEqual(owners.sort(), [...expected.receipt.helmOwners].sort()))
    throw new Error('Rehearsal graph Helm owner closure differs');
}

/** Validate actual Kustomize stage builds and byte-for-byte source/generator provenance; success is a source receipt only. */
export async function validateObservabilityRehearsal(
  root: string,
  tools: string,
  input: unknown,
  directory: string,
): Promise<ObservabilityRehearsalReceipt> {
  const expected = await buildPacket(root, input);
  const recorded: unknown = JSON.parse(await readFile(join(directory, receiptName), 'utf8'));
  // Proof: removing equality accepted the stale-revision packet; stale-source negative failed.
  if (!isDeepStrictEqual(recorded, expected.receipt))
    throw new Error('Rehearsal provenance differs');
  // Inspect symlinks before kubectl reads any local reference.
  const paths = await collectFiles(directory);
  for (const path of paths.filter((path) => path.endsWith('.yaml')))
    requireProtectedResources(await readFile(join(directory, path), 'utf8'), path);
  for (const stage of Object.keys(dependencies))
    requireGraph(await readFile(join(directory, graph, `${stage}.yaml`), 'utf8'), stage);
  const actualFiles = new Map<string, Buffer>();
  for (const path of paths)
    if (path !== receiptName) actualFiles.set(path, await readFile(join(directory, path)));
  // Proof: removing this actual-packet inspection failed seven reference/declaration/producer negatives before hashes.
  inspectRehearsalSecrets(actualFiles, expected.instanceSecrets);
  // Proof: removing closure accepted extra.txt; extra-file negative failed.
  if (!isDeepStrictEqual(paths, [...expected.files.keys(), receiptName].sort()))
    throw new Error('Rehearsal file closure differs');
  // Proof: removing hashes accepted an appended toolchain newline; altered-bytes negative failed.
  for (const [path, bytes] of expected.files)
    if (hash(await readFile(join(directory, path))) !== hash(bytes))
      throw new Error('Rehearsal file hash differs');
  await validateBuilds(root, tools, directory, expected);
  return expected.receipt;
}

/** The platform floor is necessary, not sufficient: unknown operator, current-node, backup/transient and overlap bounds cannot authorize a lab mutation. */
export function assessObservabilityRehearsalAdmission(capacity: HostCapacity) {
  // Proof: removing the shared floor let 16383 MiB pass this boundary; fixture-receiver negative failed.
  requireProfileResources('platform', capacity);
  return {
    admitted: false as const,
    capacity,
    blockers: ['complete two-instance, transient and coexistence budget unobserved'],
    runtimeRehearsal: false as const,
  };
}
