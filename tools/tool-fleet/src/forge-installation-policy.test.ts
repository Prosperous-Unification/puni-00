import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { assertTrustedWorkloadImages } from './platform-manifests';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value))
    throw new Error('trusted-workload parameter fixture is not an object');
  return value;
}

it('the committed platform explicitly starts with no PUNI installation permission', async () => {
  const document: unknown = Bun.YAML.parse(await readFile(
    join(import.meta.dir, '../../../infra/platform/policy/trusted-images.yaml'), 'utf8',
  ));
  expect(() => assertTrustedWorkloadImages([{ path: 'policy/trusted-images.yaml', document }])).not.toThrow();
  const parameters = readRecord(document);
  expect(readRecord(parameters['data'])['forgePuniInstallationRoots']).toBe('');
  expect(readRecord(readRecord(parameters['metadata'])['annotations'])['puni.dev/forge-installation-owners']).toBe('{}');
  const missing = structuredClone(parameters);
  delete readRecord(missing['data'])['forgePuniInstallationRoots'];
  expect(() => assertTrustedWorkloadImages([{ path: 'policy/trusted-images.yaml', document: missing }])).toThrow('Exactly one puni-trusted-workload admission ConfigMap is required');
});
