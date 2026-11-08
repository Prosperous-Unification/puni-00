import { bindTransport, type VerifiedEndpoint } from '@tools/observability-transport';

import {
  declareObservabilityAuthority,
  declareObservabilityRoutes,
  type ObservabilityAuthorityInstance,
} from './observability-authority';

/** Caller-resolved ephemeral material; Secret names and synthetic source-policy origins cannot substitute for these contents. */
export interface ObservabilityAccessMaterial {
  ingest: { url: string; ca: string; cert: string; key: string };
  elastic: { url: string; ca: string; username: string; password: string };
  metrics: { url: string; ca: string; username: string; password: string };
}
/** Translates the actual Fleet authority/routes into neutral verified transport inputs; it makes no runtime or provenance claim. */
export function bindObservabilityAccess(
  instance: ObservabilityAuthorityInstance,
  material: ObservabilityAccessMaterial,
): {
  otlp: VerifiedEndpoint;
  elastic: VerifiedEndpoint;
  prometheus: VerifiedEndpoint;
  queryPatterns: string[];
  runtimeVerified: false;
} {
  const routes = declareObservabilityRoutes(instance);
  const bind = (service: 'ingest' | 'elastic-query' | 'metrics-query'): VerifiedEndpoint => {
    const route = routes.find((route) => route.service === service);
    // Proof: route-missing dependency control refuses the absent actual descriptor; guard removal loses its fixed category.
    if (route === undefined) throw new Error('Required observability route is absent');
    // Proof: route-auth dependency control refuses a basic-ingest declaration; guard removal accepts the same fault.
    if (route.authentication !== (service === 'ingest' ? 'mtls' : 'basic'))
      throw new Error('Observability route authentication mismatch');
    const resolved =
      service === 'ingest'
        ? material.ingest
        : service === 'elastic-query'
          ? material.elastic
          : material.metrics;
    const endpoint: VerifiedEndpoint =
      service === 'ingest'
        ? {
            url: resolved.url,
            serverName: route.serverName,
            ca: resolved.ca,
            authentication: { kind: 'mtls', cert: material.ingest.cert, key: material.ingest.key },
          }
        : {
            url: resolved.url,
            serverName: route.serverName,
            ca: resolved.ca,
            authentication: {
              kind: 'basic',
              username:
                service === 'elastic-query' ? material.elastic.username : material.metrics.username,
              password:
                service === 'elastic-query' ? material.elastic.password : material.metrics.password,
            },
          };
    bindTransport(endpoint);
    return endpoint;
  };
  return {
    otlp: bind('ingest'),
    elastic: bind('elastic-query'),
    prometheus: bind('metrics-query'),
    queryPatterns: declareObservabilityAuthority(instance).healthQuery.indices.flatMap(
      (index) => index.names,
    ),
    runtimeVerified: false,
  };
}
