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
