import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { parse, parseAllDocuments } from 'yaml';

// Proof: removing assertOtlpTransport from validatePlatform made insecure TLS, hostname bypass,
// missing trust, queue replacement, canary routing and signing-key negatives resolve (2026-10-15).
const ClientTls = type({
  ca_file: "'/etc/otel/server-trust/ca.crt'",
  cert_file: "'/etc/otel/client/tls.crt'",
  key_file: "'/etc/otel/client/tls.key'",
  server_name_override: "'${env:PUNI_TELEMETRY_SERVER_NAME}'",
  min_version: "'1.3'",
  reload_interval: "'1m'",
  '+': 'reject',
});
const ServerTls = type({
  cert_file: "'/etc/otel/server/tls.crt'",
  key_file: "'/etc/otel/server/tls.key'",
  client_ca_file: "'/etc/otel/client-trust/ca.crt'",
  min_version: "'1.3'",
  reload_interval: "'1m'",
  '+': 'reject',
});
const Agent = type({
  spec: {
    values: {
      extraVolumes: type({ name: 'string', 'secret?': { secretName: 'string' } }).array(),
      alternateConfig: {
        exporters: {
          otlp: {
            tls: ClientTls,
            sending_queue: { enabled: 'true', storage: "'file_storage/queue'", queue_size: '5000' },
          },
        },
        service: {
          pipelines: {
            logs: { exporters: type("'otlp'").array().exactlyLength(1) },
            metrics: { exporters: type("'otlp'").array().exactlyLength(1) },
          },
        },
      },
    },
  },
});
const Collector = type({
  spec: {
    values: {
      alternateConfig: {
        receivers: {
          'otlp/mtls': {
            protocols: {
              grpc: {
                endpoint: "'${env:MY_POD_IP}:14317'",
                tls: ServerTls,
                keepalive: {
                  server_parameters: {
                    max_connection_age: "'5m'",
                    max_connection_age_grace: "'30s'",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});
const Gateway = type({
  kind: "'Service'",
  metadata: { name: "'otel-gateway'" },
  spec: {
    type: "'NodePort'",
    externalTrafficPolicy: "'Local'",
    ports: type({
      name: 'string',
      port: 'number',
      targetPort: 'number',
      nodePort: 'number',
      protocol: "'TCP'",
    }).array(),
  },
});

async function readManifest(root: string, path: string): Promise<unknown> {
  return parse(await readFile(join(root, path), 'utf8'));
}

/**
 * Enforce the authenticated canary topology. Plaintext 30417 remains an explicit rollback
 * listener until the two-cluster cutover drill closes it; workers always use TLS 30419.
 * Throws on missing manifests, TLS bypasses, signing-key mounts or changed queue identity.
 */
export async function assertOtlpTransport(root: string): Promise<void> {
  await assertCertificates(root);
  const agent = Agent(await readManifest(root, 'infra/platform/telemetry/agent/agent.yaml'));
  if (agent instanceof type.errors)
    throw new Error(`OTLP agent transport invalid: ${agent.summary}`);
  for (const [name, secretName] of [
    ['otel-client-tls', 'otel-client-tls'],
    ['otel-server-trust', 'otel-server-trust'],
  ] as const) {
    if (
      !agent.spec.values.extraVolumes.some(
        (volume) => volume.name === name && volume.secret?.secretName === secretName,
      )
    ) {
      throw new Error(`OTLP agent must mount ${secretName}`);
    }
  }
  if (
    agent.spec.values.extraVolumes.some((volume) => volume.secret?.secretName === 'otel-client-ca')
  ) {
    throw new Error('OTLP agent cannot mount a signing key');
  }
  const collector = Collector(
    await readManifest(root, 'infra/platform/observability/otel/collector.yaml'),
  );
  if (collector instanceof type.errors)
    throw new Error(`OTLP gateway transport invalid: ${collector.summary}`);
  for (const environment of ['local', 'production']) {
    const path = join(root, `infra/platform/observability/${environment}/otlp-ingress.yaml`);
    const gateways = parseAllDocuments(await readFile(path, 'utf8')).flatMap((document) => {
      const gateway = Gateway(document.toJSON());
      return gateway instanceof type.errors ? [] : [gateway];
    });
    if (gateways.length !== 1) throw new Error(`${environment} OTLP gateway must be unique`);
    const [gateway] = gateways;
    if (
      !gateway.spec.ports.some(
        (port) =>
          port.name === 'otlp-mtls' &&
          port.port === 14317 &&
          port.targetPort === 14317 &&
          port.nodePort === 30419,
      )
    ) {
      throw new Error(`${environment} OTLP canary must target the TLS receiver`);
    }
    const upstream = type({
      data: {
        upstream: 'string',
        serverName: "'otel-gateway.puni.internal'",
        transport: "'mtls-canary'",
      },
    })(await readManifest(root, `infra/platform/telemetry/${environment}/upstream.yaml`));
    if (upstream instanceof type.errors || !upstream.data.upstream.endsWith(':30419')) {
      throw new Error(`${environment} OTLP workers must use the authenticated canary`);
    }
  }
}

// Proof: bypassing assertOtlpTransport made wrong EKU, shared CA and disabled rotation resolve
// in platform.test.ts (2026-10-15). Generation-readiness removal resolved there too.
const Certificate = type({
  kind: "'Certificate'",
  metadata: { name: 'string', namespace: "'observability'" },
  spec: {
    secretName: 'string',
    duration: "'24h'",
    renewBefore: "'8h'",
    privateKey: { algorithm: "'ECDSA'", size: '256', rotationPolicy: "'Always'" },
    usages: 'string[]',
    issuerRef: { name: 'string', kind: "'Issuer'" },
    'dnsNames?': 'string[]',
    'commonName?': 'string',
  },
});
const Issuer = type({
  kind: "'Issuer'",
  metadata: { name: 'string', namespace: "'observability'" },
  spec: { ca: { secretName: 'string' }, '+': 'reject' },
});
const Readiness = type({
  spec: {
    healthCheckExprs: type({
      apiVersion: "'cert-manager.io/v1'",
      kind: "'Certificate'",
      failed: 'string',
      current: 'string',
    })
      .array()
      .exactlyLength(1),
  },
});

/** Require separate signing authorities, short-lived rotating leaves and generation-aware readiness. */
async function assertCertificates(root: string): Promise<void> {
  for (const environment of ['local', 'production']) {
    for (const purpose of ['platform', 'workers']) {
      const role = purpose === 'platform' ? 'server' : 'client';
      const documents = parseAllDocuments(
        await readFile(
          join(root, `infra/platform/certificates/${purpose}/${environment}/certificate.yaml`),
          'utf8',
        ),
      );
      const certificates = documents.flatMap((document) => {
        const certificate = Certificate(document.toJSON());
        return certificate instanceof type.errors ? [] : [certificate];
      });
      const issuers = documents.flatMap((document) => {
        const issuer = Issuer(document.toJSON());
        return issuer instanceof type.errors ? [] : [issuer];
      });
      if (certificates.length !== 1 || issuers.length !== 1)
        throw new Error(`${purpose}-${environment} OTLP issuer and certificate must be unique`);
      const [certificate] = certificates;
      const [issuer] = issuers;
      if (
        certificate.metadata.name !== `otel-${role}` ||
        certificate.spec.secretName !== `otel-${role}-tls` ||
        certificate.spec.issuerRef.name !== `otel-${role}` ||
        issuer.metadata.name !== `otel-${role}` ||
        issuer.spec.ca.secretName !== `otel-${role}-ca` ||
        certificate.spec.usages.join(',') !== `digital signature,${role} auth` ||
        (role === 'server'
          ? certificate.spec.dnsNames?.join(',') !== 'otel-gateway.puni.internal'
          : certificate.spec.commonName !== `workers-${environment}`)
      ) {
        throw new Error(`${purpose}-${environment} OTLP certificate authority or leaf invalid`);
      }
      const readiness = Readiness(
        await readManifest(root, `infra/clusters/${purpose}/${environment}/certificates.yaml`),
      );
      if (
        readiness instanceof type.errors ||
        readiness.spec.healthCheckExprs[0].failed !==
          "status.conditions.exists(c, c.type == 'Ready' && c.status == 'False')" ||
        readiness.spec.healthCheckExprs[0].current !==
          "status.conditions.exists(c, c.type == 'Ready' && c.status == 'True' && c.observedGeneration == metadata.generation)"
      ) {
        throw new Error(
          `${purpose}-${environment} OTLP certificates require current-generation readiness`,
        );
      }
    }
  }
}
