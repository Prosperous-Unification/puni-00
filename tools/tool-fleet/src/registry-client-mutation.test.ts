import { afterEach, expect, spyOn, test } from 'bun:test';

import { registryClusterFixture } from './registry-maintenance-cluster.fixture';
import * as installation from './registry-maintenance-installation';
import { createRegistryKubernetes } from './registry-maintenance-kubernetes';
import * as processPorts from './registry-maintenance-process';
import { requireRejection } from './registry-rejection.fixture';

const restorations: (() => void)[] = [];
afterEach(() => {
  for (const restore of restorations.splice(0).reverse()) restore();
});
for (const expired of [false, true])
  test(
    'actual Kubernetes mutation checks freshness after GET: expired=' + String(expired),
    async () => {
      const fixture = registryClusterFixture();
      const installed = {
        ...fixture.installed,
        recovery: { state: 'unenrolled' as const },
        kubernetes: { path: '/fixed-k3s', sha256: 'a'.repeat(64) },
        managementKubeconfig: { path: '/fixed-management', sha256: 'b'.repeat(64) },
        productionKubeconfig: { path: '/fixed-production', sha256: 'c'.repeat(64) },
      };
      const resource = {
        ...fixture.resources.get('Deployment/registry'),
        metadata: {
          ...fixture.resources.get('Deployment/registry')?.metadata,
          resourceVersion: '1',
        },
      };
      const locked = spyOn(processPorts, 'assertRegistryMaintenanceLock').mockResolvedValue(
        undefined,
      );
      const verified = spyOn(installation, 'verifyRegistryHostArtifact').mockResolvedValue(
        Buffer.alloc(0),
      );
      const reaped = spyOn(processPorts, 'awaitMaintenanceChild').mockResolvedValue(undefined);
      restorations.push(
        () => {
          locked.mockRestore();
        },
        () => {
          verified.mockRestore();
        },
        () => {
          reaped.mockRestore();
        },
      );
      const verbs: string[] = [];
      let clock = 0;
      let guarded = 0;
      const spawned = spyOn(Bun, 'spawn').mockImplementation((argv: unknown) => {
        const command = argv as string[];
        const verb = command.includes('patch') ? 'patch' : 'get';
        verbs.push(verb);
        if (verb === 'get' && expired) clock = 300001;
        return {
          stdin: { write: () => 1, flush: () => 1, end: () => 1 },
          stdout: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(Buffer.from(JSON.stringify(resource)));
              controller.close();
            },
          }),
          stderr: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.close();
            },
          }),
          exited: Promise.resolve(0),
        } as never;
      });
      restorations.push(() => {
        spawned.mockRestore();
      });
      const refused = new Error('receipt expired during resource GET');
      const api = await createRegistryKubernetes(installed, 3, new AbortController().signal, () => {
        guarded++;
        expect(verbs).toEqual(['get']);
        if (clock > 300000) throw refused;
      });
      const pending = api.patch('production', installed.ordinary.deployment, {
        kind: 'replicas',
        value: 1,
      });
      if (expired) {
        expect((await requireRejection(pending)).cause).toBe(refused);
        expect(verbs).toEqual(['get']);
      } else {
        await pending;
        expect(verbs).toEqual(['get', 'patch']);
      }
      expect(guarded).toBe(1);
    },
  );
