import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { parseAllDocuments, parseDocument } from 'yaml';

const root = resolve(import.meta.dir, '../../../..');

function manifest(path: string): unknown {
  return parseDocument(readFileSync(resolve(root, path), 'utf8')).toJS();
}

describe('MCP deployment persistence', () => {
  it('mounts a retained single-writer store and sources rotating keys from a Secret', () => {
    const deployment = parseAllDocuments(
      readFileSync(resolve(root, 'deploy/k8s/wbs/base/mcp.yaml'), 'utf8'),
    )[0].toJS() as Record<string, unknown>;
    const claim = manifest('deploy/k8s/wbs/base/mcp-storage.yaml');
    const base = manifest('deploy/k8s/wbs/base/kustomization.yaml') as {
      resources: string[];
    };
    const overlays = ['local', 'staging', 'prod'].map((overlay) =>
      manifest(`deploy/k8s/wbs/overlays/${overlay}/kustomization.yaml`),
    );

    expect(deployment).toMatchObject({
      spec: {
        replicas: 1,
        strategy: { type: 'Recreate' },
        template: {
          spec: {
            containers: [
              {
                env: [
                  { name: 'PORT', value: '3300' },
                  { name: 'HOME', value: '/tmp' },
                  { name: 'MCP_STORE_PATH', value: '/var/lib/wbs-mcp/sessions.sqlite' },
                  {
                    name: 'MCP_STORE_KEY_CURRENT',
                    valueFrom: {
                      secretKeyRef: { name: 'wbs-mcp-secrets', key: 'MCP_STORE_KEY_CURRENT' },
                    },
                  },
                  {
                    name: 'MCP_STORE_KEY_PREVIOUS',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'wbs-mcp-secrets',
                        key: 'MCP_STORE_KEY_PREVIOUS',
                        optional: true,
                      },
                    },
                  },
                  {
                    name: 'MCP_SIGNING_KEY_CURRENT',
                    valueFrom: {
                      secretKeyRef: { name: 'wbs-mcp-secrets', key: 'MCP_SIGNING_KEY_CURRENT' },
                    },
                  },
                  {
                    name: 'MCP_SIGNING_KEY_PREVIOUS',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'wbs-mcp-secrets',
                        key: 'MCP_SIGNING_KEY_PREVIOUS',
                        optional: true,
                      },
                    },
                  },
                ],
                volumeMounts: [
                  { name: 'mcp-store', mountPath: '/var/lib/wbs-mcp' },
                  { name: 'tmp', mountPath: '/tmp' },
                ],
              },
            ],
            volumes: [
              { name: 'mcp-store', persistentVolumeClaim: { claimName: 'wbs-mcp' } },
              { name: 'tmp' },
            ],
          },
        },
      },
    });
    expect(claim).toMatchObject({
      kind: 'PersistentVolumeClaim',
      metadata: { name: 'wbs-mcp', namespace: 'wbs' },
      spec: { accessModes: ['ReadWriteOnce'] },
    });
    expect(base.resources).toContain('mcp-storage.yaml');
    for (const [index, overlay] of overlays.entries()) {
      const patches = (overlay as { patches: { target: { name: string }; patch: string }[] })
        .patches;
      const mcp = patches.find((patch) => patch.target.name === 'wbs-mcp');
      expect(mcp?.patch).toContain(index === 0 ? 'value: puni-local' : 'value: puni-retain');
    }
    expect(
      JSON.parse(
        readFileSync(
          resolve(root, 'deploy/k8s/wbs/overlays/prod/externally-provided.json'),
          'utf8',
        ),
      ),
    ).toEqual([{ namespace: 'wbs', name: 'wbs-mcp-secrets', source: 'operator' }]);
  });
});

interface IngressPath {
  readonly path: string;
  readonly pathType: 'Exact' | 'Prefix';
  readonly backend: { readonly service: { readonly name: string } };
}

interface IngressDocument {
  readonly kind: string;
  readonly spec: {
    readonly rules: readonly {
      readonly host: string;
      readonly http: { readonly paths: readonly IngressPath[] };
    }[];
  };
}

/**
 * The Service one overlay's Ingresses send `requestPath` to on `host`, by the Kubernetes
 * matching rule Traefik also follows here: an Exact path beats any Prefix, and the longest
 * element-wise Prefix wins. Undefined when nothing matches.
 */
function routedService(overlay: string, host: string, requestPath: string): string | undefined {
  const paths = parseAllDocuments(
    readFileSync(resolve(root, `deploy/k8s/wbs/overlays/${overlay}/ingress.yaml`), 'utf8'),
  )
    .map((document) => document.toJS() as IngressDocument)
    .filter((document) => document.kind === 'Ingress')
    .flatMap((document) => document.spec.rules)
    .filter((rule) => rule.host === host)
    .flatMap((rule) => rule.http.paths);
  const exact = paths.find((entry) => entry.pathType === 'Exact' && entry.path === requestPath);
  if (exact !== undefined) return exact.backend.service.name;
  const prefix = paths
    .filter(
      (entry) =>
        entry.pathType === 'Prefix' &&
        (entry.path === '/' ||
          requestPath === entry.path ||
          requestPath.startsWith(`${entry.path.replace(/\/$/, '')}/`)),
    )
    .sort((left, right) => right.path.length - left.path.length)
    .at(0);
  return prefix?.backend.service.name;
}

describe('public MCP OAuth discovery ingress', () => {
  const discovery = [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp',
    '/.well-known/oauth-authorization-server/mcp/oauth',
  ];
  const publicHosts = [
    ['prod', 'wbs.bulletpoints.club'],
    ['staging', 'wbs-staging.bulletpoints.club'],
  ] as const;

  // Proof: on 2026-09-27, removing the Exact /.well-known/oauth-protected-resource/mcp rule
  // from the prod overlay failed this test with `Expected: "wbs-mcp"`, `Received:
  // "wbs-frontend"`: the SPA fallback answered discovery, as it did live on that date.
  it.each(publicHosts)('routes each discovery URL on %s to mcp-01', (overlay, host) => {
    for (const path of discovery) expect(routedService(overlay, host, path)).toBe('wbs-mcp');
  });

  it.each(publicHosts)('keeps MCP, API, socket and SPA routing on %s', (overlay, host) => {
    expect(routedService(overlay, host, '/mcp')).toBe('wbs-mcp');
    expect(routedService(overlay, host, '/mcp/oauth/token')).toBe('wbs-mcp');
    expect(routedService(overlay, host, '/api/projects')).toBe('wbs-backend');
    expect(routedService(overlay, host, '/ws')).toBe('wbs-gateway');
    expect(routedService(overlay, host, '/projects/p-1')).toBe('wbs-frontend');
  });

  it.each(publicHosts)(
    'does not widen discovery to other well-known paths on %s',
    (overlay, host) => {
      for (const path of [
        '/.well-known/openid-configuration',
        '/.well-known/oauth-protected-resource/other',
        '/.well-known/oauth-authorization-server',
        '/.well-known/oauth-authorization-server/mcp/oauth/extra',
      ])
        expect(routedService(overlay, host, path)).toBe('wbs-frontend');
    },
  );
});
