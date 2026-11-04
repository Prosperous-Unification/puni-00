import { readFile } from 'node:fs/promises';

import { type } from 'arktype';
import { expect, test } from 'bun:test';
import { parseAllDocuments } from 'yaml';

async function registryEnvironment(): Promise<Record<string, string>> {
  const manifests = parseAllDocuments(
    await readFile(
      new URL('../../../infra/platform/registry/base/registry.yaml', import.meta.url),
      'utf8',
    ),
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

test('ordinary endpoint refuses manifest and blob deletion independently of credentials', async () => {
  expect((await registryEnvironment())['REGISTRY_STORAGE_DELETE_ENABLED']).toBe('false');
});

test('ordinary endpoint disables age-only upload purging using the pinned object override', async () => {
  const environment = await registryEnvironment();
  expect(environment['REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING']).toBe('{"enabled": false}');
  expect(environment['REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING_ENABLED']).toBeUndefined();
});
