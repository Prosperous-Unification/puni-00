import { readFile } from 'node:fs/promises';

import { type } from 'arktype';
import { expect, test } from 'bun:test';
import { parseAllDocuments } from 'yaml';

async function registryEnvironment(
  source: 'base/registry.yaml' | 'production/storage-patch.yaml',
): Promise<Record<string, string>> {
  const manifests = parseAllDocuments(
    await readFile(new URL(`../../../infra/platform/registry/${source}`, import.meta.url), 'utf8'),
  ).map((document): unknown => document.toJS() as unknown);
  const shape = type({
    kind: "'Deployment'",
    spec: {
      template: {
        spec: {
          containers: type({ env: type({ name: 'string', value: 'string' }).array() }).array(),
        },
      },
    },
  });
  const deployment = shape.assert(manifests.find((manifest) => shape.allows(manifest)));
  const container = deployment.spec.template.spec.containers.at(0);
  if (container === undefined) throw new Error('Missing registry container');
  return Object.fromEntries(
    container.env.map((variable: { name: string; value: string }) => [
      variable.name,
      variable.value,
    ]),
  );
}

test('staged managed endpoint retains manifest and blob deletion refusal', async () => {
  expect(
    (await registryEnvironment('production/storage-patch.yaml'))['REGISTRY_STORAGE_DELETE_ENABLED'],
  ).toBe('false');
});

test('staged managed endpoint retains the pinned age-only purger override', async () => {
  const environment = await registryEnvironment('production/storage-patch.yaml');
  expect(environment['REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING']).toBe('{"enabled": false}');
  expect(environment['REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING_ENABLED']).toBeUndefined();
});

test('active base preserves the supported legacy endpoint configuration', async () => {
  const environment = await registryEnvironment('base/registry.yaml');
  expect(environment['REGISTRY_STORAGE_DELETE_ENABLED']).toBe('true');
  expect(environment['REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING']).toBeUndefined();
});
