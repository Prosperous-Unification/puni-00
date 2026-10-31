/** Fleet instance identity consumed by source authority declarations; no live credentials or target UIDs. */
export interface ObservabilityAuthorityInstance {
  environment: 'dev' | 'prod';
  namespace: string;
}

/** Namespace-local material requirements; names/keys are declarations, never proof of the material or effective grants. */
export function declareObservabilitySecrets(placement: 'local' | 'production') {
  return [
    {
      name: 'elastic-s3-credentials',
      keys: [
        's3.client.default.access_key',
        's3.client.default.secret_key',
        ...(placement === 'local' ? ['ca.crt'] : []),
      ],
      authority: 'backup',
      provisioner: 'external',
    },
    {
      name: 'elasticsearch-es-elastic-user',
      keys: ['elastic'],
      authority: 'ingest-and-setup-admin',
      provisioner: 'eck',
    },
    {
      name: 'elasticsearch-es-http-certs-public',
      keys: ['ca.crt'],
      authority: 'elastic-server-trust',
      provisioner: 'eck',
    },
    {
      name: 'kibana-kb-http-certs-public',
      keys: ['ca.crt'],
      authority: 'kibana-server-trust',
      provisioner: 'eck',
    },
    {
      name: 'signal-health-users',
      keys: ['users', 'users_roles'],
      authority: 'health-readonly-file-realm',
      provisioner: 'external',
    },
    {
      name: 'signal-health-roles',
      keys: ['roles.yml'],
      authority: 'health-readonly-role',
      provisioner: 'external',
    },
    {
      name: 'signal-health-query',
      keys: ['username', 'password'],
      authority: 'health-readonly-client',
      provisioner: 'external',
    },
    {
      name: 'signal-collector-tls',
      keys: ['tls.crt', 'tls.key'],
      authority: 'ingest-server',
      provisioner: 'external',
    },
    {
      name: 'signal-gateway-tls',
      keys: ['tls.crt', 'tls.key'],
      authority: 'gateway-server',
      provisioner: 'external',
    },
    {
      name: 'signal-client-trust',
      keys: ['ca.crt'],
      authority: 'exclusive-instance-client-ca',
      provisioner: 'external',
    },
    {
      name: 'signal-collector-client',
      keys: ['tls.crt', 'tls.key'],
      authority: 'gateway-ingest-client',
      provisioner: 'external',
    },
    {
      name: 'signal-observer-client',
      keys: ['tls.crt', 'tls.key', 'ca.crt'],
      authority: 'observer-ingest-client',
      provisioner: 'external',
    },
    {
      name: 'signal-gateway-trust',
      keys: ['ca.crt'],
      authority: 'gateway-server-trust',
      provisioner: 'external',
    },
    {
      name: 'signal-metrics-tls',
      keys: ['tls.crt', 'tls.key'],
      authority: 'metrics-server',
      provisioner: 'external',
    },
    {
      name: 'signal-metrics-writer',
      keys: ['ca.crt', 'password'],
      authority: 'metrics-write-client',
      provisioner: 'external',
    },
    {
      name: 'signal-metrics-write-auth',
      keys: ['users'],
      authority: 'metrics-write-verifier',
      provisioner: 'external',
    },
    {
      name: 'signal-metrics-query-auth',
      keys: ['users'],
      authority: 'metrics-read-verifier',
      provisioner: 'external',
    },
    {
      name: 'signal-metrics-query',
      keys: ['username', 'password', 'ca.crt'],
      authority: 'metrics-read-client',
      provisioner: 'external',
    },
    {
      name: 'alertmanager-puni',
      keys: ['alertmanager.yaml'],
      authority: 'alert-routing',
      provisioner: 'external',
    },
  ];
}

/** Exact desired health grants and identity separation; effective authority remains a runtime obligation. */
export function declareObservabilityAuthority(instance: ObservabilityAuthorityInstance) {
  return {
    healthRole: 'signal-health-reader',
    healthQuery: {
      cluster: [],
      indices: [
        {
          names: [`logs-*.otel-${instance.environment}`, `traces-*.otel-${instance.environment}`],
          privileges: ['read'],
        },
      ],
    },
    fileRealmContract: {
      users: 'separate non-elastic identity',
      users_roles: 'only signal-health-reader',
      roles: 'exact healthQuery; no other grants',
    },
    metricsQuery: {
      paths: ['/api/v1/query', '/api/v1/query_range'],
      methods: ['GET', 'POST'],
      mutations: false,
      credentialReuse: false,
    },
    ingestTrust: {
      scope: 'exclusive-instance-ca',
      environment: instance.environment,
      effectiveAcceptanceVerified: false as const,
    },
    credentialSeparation:
      'query, write and admin credentials must differ within and across instances',
    effectiveAcceptanceVerified: false as const,
  };
}

/** Internal TLS identities plus required independent external dial bindings for the observer and retained Grafana. */
export function declareObservabilityRoutes(instance: ObservabilityAuthorityInstance) {
  return [
    {
      consumers: ['observer'],
      service: 'ingest',
      host: `signal-collector.${instance.namespace}.svc`,
      port: 4318,
      credential: 'signal-observer-client',
      authentication: 'mtls',
    },
    {
      consumers: ['observer', 'grafana'],
      service: 'elastic-query',
      host: `elasticsearch-es-http.${instance.namespace}.svc`,
      port: 9200,
      credential: 'signal-health-query',
      authentication: 'basic',
      trust: 'elasticsearch-es-http-certs-public',
    },
    {
      consumers: ['observer', 'grafana'],
      service: 'metrics-query',
      host: `signal-metrics.${instance.namespace}.svc`,
      port: 8443,
      credential: 'signal-metrics-query',
      authentication: 'basic',
    },
  ].map(({ host, port, ...route }) => ({
    ...route,
    url: `https://${host}:${String(port)}`,
    serverName: host,
    externalBinding: 'required',
    runtimeVerified: false as const,
  }));
}

export type ObservabilityAuthority = ReturnType<typeof declareObservabilityAuthority>;
export type ObservabilityRoutes = ReturnType<typeof declareObservabilityRoutes>;
export type ObservabilitySecretRequirements = ReturnType<typeof declareObservabilitySecrets>;
