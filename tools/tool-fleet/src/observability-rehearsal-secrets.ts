import { type } from 'arktype';
import { parseAllDocuments, parseDocument } from 'yaml';

/** Required keys are source contracts, never a claim that credentials or effective grants were observed. */
export interface RehearsalSecret {
  namespace: string;
  name: string;
  keys: string[];
  authority: string;
  provisioner: string;
}
/** Secret keys supplied by the named packaged controller producer; readiness remains unobserved. */
export interface ControllerSecret extends RehearsalSecret {
  producer: string;
}
/** One consumed Secret reference, resolved to exact namespace and required keys. */
export interface SecretReference {
  namespace: string;
  name: string;
  keys: string[];
  consumer: string;
  path: string;
}
/** Property names and array positions retain structural identity independently of diagnostic paths. */
type PropertyPath = readonly (string | number)[];

const externalPath = 'infra/platform/secrets/platform-local/externally-provided.json';
const Material = type({
  namespace: 'string>0',
  name: 'string>0',
  keys: 'string[]',
  authority: 'string>0',
  provisioner: "'external' | 'eck'",
});
const Identity = type({ kind: 'string', metadata: { name: 'string', 'namespace?': 'string' } });
const supplemental: RehearsalSecret[] = [
  {
    namespace: 'puni-registry',
    name: 'registry-auth',
    keys: ['htpasswd'],
    authority: 'registry-authentication',
    provisioner: 'external',
  },
  {
    namespace: 'puni-backup',
    name: 'object-store-root',
    keys: ['MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD'],
    authority: 'object-store-admin',
    provisioner: 'external',
  },
  {
    namespace: 'puni-backup',
    name: 'object-store-tls',
    keys: ['tls.crt', 'tls.key'],
    authority: 'object-store-server',
    provisioner: 'external',
  },
  {
    namespace: 'puni-backup',
    name: 'object-store-ca',
    keys: ['ca.crt'],
    authority: 'object-store-trust',
    provisioner: 'external',
  },
  {
    namespace: 'puni-backup',
    name: 'velero-credentials',
    keys: ['cloud'],
    authority: 'backup-storage',
    provisioner: 'external',
  },
  {
    namespace: 'puni-backup',
    name: 'velero-repo-credentials',
    keys: ['repository-password'],
    authority: 'backup-repository-encryption',
    provisioner: 'external',
  },
  {
    namespace: 'observability',
    name: 'otel-server-ca',
    keys: ['tls.crt', 'tls.key'],
    authority: 'retained-reader-server-ca',
    provisioner: 'external',
  },
  {
    namespace: 'observability',
    name: 'otel-client-trust',
    keys: ['ca.crt'],
    authority: 'retained-reader-client-trust',
    provisioner: 'external',
  },
  {
    namespace: 'flux-system',
    name: 'platform-local-kubeconfig',
    keys: ['value.yaml'],
    authority: 'flux-target-access',
    provisioner: 'external',
  },
  {
    namespace: 'flux-system',
    name: 'sops-age',
    keys: ['age.agekey'],
    authority: 'flux-decryption',
    provisioner: 'external',
  },
];
function refuse(): never {
  throw new Error('Rehearsal Secret reference closure differs');
}
function requireFile(files: ReadonlyMap<string, Buffer>, path: string): Buffer {
  const bytes = files.get(path);
  if (bytes === undefined) return refuse();
  return bytes;
}
/** Helm inheritance reads the actual packaged defaults; missing or malformed trusted values never become guessed defaults. */
function readChartDefaults(files: ReadonlyMap<string, Buffer>, chart: string) {
  const child = Bun.spawnSync(['tar', '-xzOf', '-', 'kube-prometheus-stack/values.yaml'], {
    stdin: requireFile(files, chart.replace(/^\.\//, '')),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });
  if (child.exitCode !== 0) return refuse();
  const document = parseDocument(child.stdout.toString());
  if (document.errors.length) return refuse();
  return document;
}
/** Close only the Secret-reference forms consumed by this packet: Flux refs, native/projected volumes and env, ECK settings/realms, monitoring TLS and Velero CA/credentials. */
export function inspectRehearsalSecrets(
  files: ReadonlyMap<string, Buffer>,
  instanceSecrets: readonly RehearsalSecret[],
) {
  const declarations = type({
    namespace: 'string',
    name: 'string',
    source: "'operator' | 'rehearsal'",
    '+': 'reject',
  }).array()(JSON.parse(requireFile(files, externalPath).toString()));
  // Proof: allowing extra metadata fields lost the independent declaration-shape refusal; only hashes refused.
  if (declarations instanceof type.errors) refuse();
  // Proof: bypassing actual inspection lost the missing-declaration negative to the byte check.
  for (const secret of supplemental)
    if (
      secret.namespace !== 'flux-system' &&
      !declarations.some(
        (entry) => entry.namespace === secret.namespace && entry.name === secret.name,
      )
    )
      refuse();
  const requirements = [...instanceSecrets, ...supplemental].map((secret) =>
    Material.assert(secret),
  );
  const externalPrerequisites = requirements.filter((secret) => secret.provisioner === 'external');
  const controllerSecrets: ControllerSecret[] = [];
  const references: SecretReference[] = [];
  const manifests = [...files]
    .filter(([path]) => path.endsWith('.yaml'))
    .flatMap(([path, bytes]) =>
      parseAllDocuments(bytes.toString()).flatMap((document, index) => {
        if (document.errors.length) return refuse();
        if (
          document.toJSON() === null ||
          document.get('apiVersion') === 'kustomize.config.k8s.io/v1beta1'
        )
          return [];
        return [
          {
            path: `${path}#${String(index)}`,
            document,
            identity: Identity.assert(document.toJSON()),
          },
        ];
      }),
    );
  const eckController = manifests.some(
    ({ document, identity }) =>
      identity.kind === 'HelmRelease' &&
      identity.metadata.namespace === 'observability' &&
      identity.metadata.name === 'eck-operator' &&
      String(document.getIn(['spec', 'chart', 'spec', 'chart'])).startsWith(
        './infra/platform/charts/eck-operator-',
      ),
  );
  for (const { document, identity } of manifests) {
    const namespace = identity.metadata.namespace;
    if (namespace === undefined) continue;
    const producer = `${identity.kind}/${namespace}/${identity.metadata.name}`;
    if (identity.kind === 'Certificate' && document.get('apiVersion') === 'cert-manager.io/v1') {
      controllerSecrets.push({
        namespace,
        name: type('string>0').assert(document.getIn(['spec', 'secretName'])),
        keys: ['tls.crt', 'tls.key'],
        authority: 'certificate-output',
        provisioner: 'cert-manager',
        producer,
      });
    }
    if (identity.kind !== 'HelmRelease') continue;
    const chart = type('string').assert(document.getIn(['spec', 'chart', 'spec', 'chart']));
    if (eckController && /\/eck-(elasticsearch|kibana)-/.test(chart)) {
      const name = type('string>0').assert(document.getIn(['spec', 'values', 'fullnameOverride']));
      const outputs = chart.includes('/eck-elasticsearch-')
        ? [
            { name: `${name}-es-elastic-user`, keys: ['elastic'] },
            { name: `${name}-es-http-certs-public`, keys: ['ca.crt'] },
          ]
        : [{ name: `${name}-kb-http-certs-public`, keys: ['ca.crt'] }];
      for (const output of outputs)
        controllerSecrets.push({
          ...output,
          namespace,
          authority: 'eck-output',
          provisioner: 'eck',
          producer,
        });
    }
    if (chart.includes('/kube-prometheus-stack-')) {
      const defaults = readChartDefaults(files, chart);
      const enabled = (path: string[]) =>
        type('boolean').assert(
          document.hasIn(['spec', 'values', ...path])
            ? document.getIn(['spec', 'values', ...path])
            : defaults.getIn(path),
        );
      if (
        enabled(['prometheusOperator', 'enabled']) &&
        enabled(['prometheusOperator', 'admissionWebhooks', 'enabled']) &&
        enabled(['prometheusOperator', 'admissionWebhooks', 'patch', 'enabled']) &&
        !enabled(['prometheusOperator', 'admissionWebhooks', 'certManager', 'enabled'])
      ) {
        const name = type('string>0').assert(
          document.getIn(['spec', 'values', 'fullnameOverride']),
        );
        controllerSecrets.push({
          namespace,
          name: `${name}-admission`,
          keys: ['ca', 'cert', 'key'],
          authority: 'monitoring-admission-tls',
          provisioner: 'helm-hook',
          producer,
        });
      }
    }
  }
  const identities = new Map<string, RehearsalSecret>();
  for (const secret of [...externalPrerequisites, ...controllerSecrets]) {
    const name = `${secret.namespace}/${secret.name}`;
    // Proof: bypassing actual inspection lost the duplicate-producer negative to file closure.
    if (identities.has(name)) refuse();
    identities.set(name, secret);
  }
  for (const secret of requirements.filter((secret) => secret.provisioner === 'eck')) {
    const producer = identities.get(`${secret.namespace}/${secret.name}`);
    if (producer?.provisioner !== 'eck' || secret.keys.some((key) => !producer.keys.includes(key)))
      refuse();
  }
  function add(
    namespace: string | undefined,
    name: unknown,
    keys: string[],
    consumer: string,
    path: string,
  ) {
    if (namespace === undefined || typeof name !== 'string') return refuse();
    const declaration = identities.get(`${namespace}/${name}`);
    // Proof: bypassing actual inspection lost native name/key, CA and missing-producer negatives to byte closure.
    if (declaration === undefined || keys.some((key) => !declaration.keys.includes(key)))
      return refuse();
    references.push({
      namespace,
      name,
      keys: keys.length ? keys : [...declaration.keys],
      consumer,
      path,
    });
  }
  function scan(
    value: unknown,
    namespace: string | undefined,
    consumer: string,
    path: string,
    segments: PropertyPath,
    schemaRoots: readonly PropertyPath[],
  ): void {
    // Proof: Task25c2b crd-schema-distinction omission misread schema vocabulary; whole-CRD skipping hid conversion/embedded-object faults.
    // Proof: Task25c2b fix1 slash-joined comparison admitted both sibling undeclared-reference and malformed-embedded negatives.
    if (
      schemaRoots.some(
        (root) =>
          root.length === segments.length &&
          root.every((segment, index) => segment === segments[index]),
      )
    )
      return;
    if (Array.isArray(value)) {
      value.forEach((entry: unknown, index) => {
        scan(
          entry,
          namespace,
          consumer,
          `${path}/${String(index)}`,
          [...segments, index],
          schemaRoots,
        );
      });
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const fields = type('Record<string,unknown>').assert(value);
    // Embedded Helm extraObjects own their namespaces just like top-level manifests.
    if (
      Object.hasOwn(fields, 'apiVersion') &&
      Object.hasOwn(fields, 'kind') &&
      Object.hasOwn(fields, 'metadata')
    ) {
      const embedded = Identity.assert(value);
      namespace = embedded.metadata.namespace;
      consumer = `${embedded.kind}/${namespace ?? '_'}/${embedded.metadata.name}`;
    }
    for (const [key, child] of Object.entries(fields)) {
      const next = `${path}/${key}`;
      if (['secretName', 'existingSecret', 'configSecret'].includes(key)) {
        const entries = fields['items'] ?? fields['entries'];
        const keys =
          entries === undefined
            ? []
            : type({ key: 'string' })
                .array()
                .assert(entries)
                .map((entry) => entry.key);
        add(namespace, child, keys, consumer, next);
      } else if (
        ['secretKeyRef', 'secretRef', 'caCertRef'].includes(key) ||
        (key === 'secret' &&
          typeof child === 'object' &&
          child !== null &&
          Object.hasOwn(child, 'name'))
      ) {
        const reference = type({
          name: 'string',
          'key?': 'string',
          'items?': type({ key: 'string' }).array(),
        }).assert(child);
        add(
          namespace,
          reference.name,
          reference.key === undefined
            ? (reference.items?.map((entry) => entry.key) ?? [])
            : [reference.key],
          consumer,
          next,
        );
      } else scan(child, namespace, consumer, next, [...segments, key], schemaRoots);
    }
  }
  for (const { path, document, identity } of manifests) {
    if (identity.kind === 'Certificate') continue;
    const consumer = `${identity.kind}/${identity.metadata.namespace ?? '_'}/${identity.metadata.name}`;
    const schemaRoots: PropertyPath[] = [];
    // Proof: Task25c2b crd-api-scope weakening exempted foreign APIs and ordinary resources.
    if (
      identity.kind === 'CustomResourceDefinition' &&
      document.get('apiVersion') === 'apiextensions.k8s.io/v1'
    ) {
      // Proof: Task25c2b crd-known-shape bypass accepted a null schema boundary.
      const definition = type({
        spec: {
          versions: type({ 'schema?': { 'openAPIV3Schema?': 'Record<string,unknown>' } }).array(),
        },
      }).assert(document.toJSON());
      definition.spec.versions.forEach((version, index) => {
        // Proof: Task25c2b crd-map-shape removal accepted schema/root arrays as maps.
        if (Array.isArray(version.schema) || Array.isArray(version.schema?.openAPIV3Schema))
          throw new Error('Rehearsal malformed CRD schema boundary');
        schemaRoots.push(['spec', 'versions', index, 'schema', 'openAPIV3Schema']);
      });
    }
    scan(
      type({ 'spec?': 'unknown' }).assert(document.toJSON()).spec,
      identity.metadata.namespace,
      consumer,
      path + '/spec',
      ['spec'],
      schemaRoots,
    );
    if (
      identity.kind === 'HelmRelease' &&
      String(document.getIn(['spec', 'chart', 'spec', 'chart'])).includes('/velero-')
    )
      add(
        identity.metadata.namespace,
        'velero-repo-credentials',
        ['repository-password'],
        consumer,
        path + '/implicit-kopia-repository-password',
      );
  }
  const compare = (left: RehearsalSecret, right: RehearsalSecret) =>
    `${left.namespace}/${left.name}`.localeCompare(`${right.namespace}/${right.name}`);
  return {
    // Proof: omitting non-observability declarations failed the complete-positive receipt key assertion.
    externalPrerequisites: externalPrerequisites.sort(compare),
    // Proof: returning no controller outputs failed the complete-positive receipt producer assertion.
    controllerSecrets: controllerSecrets.sort(compare),
    secretReferences: references,
  };
}
