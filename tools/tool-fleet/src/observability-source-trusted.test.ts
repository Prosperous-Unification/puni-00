import { appendFile, chmod, cp, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';
import { parseAllDocuments, stringify } from 'yaml';

import { createObservabilitySource } from './observability-source';
const root = join(import.meta.dir, '../../..');
const request = {
  placement: 'production',
  instances: [
    { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
    { environment: 'prod', namespace: 'observability', policy: 'retained-production' },
  ],
  network: {
    api: ['10.1.0.4/32'],
    observer: ['172.31.100.10/32'],
    grafana: ['172.31.100.11/32'],
    s3: ['172.31.100.12/32'],
    alertDelivery: ['172.31.100.13/32'],
    publicProbes: ['172.31.100.14/32'],
  },
};
test.each([
  'valid',
  'metadata',
  'inventory YAML',
  'profile YAML',
  'enrolled peers',
  'absent',
  'unreadable',
] as const)('full source refuses trusted %s fault', async (fault) => {
  const directory = await scratchAsync('source-trusted-');
  await cp(join(root, 'infra'), join(directory, 'infra'), {
    recursive: true,
    filter: (path) => !path.endsWith('/charts'),
  });
  await symlink(join(root, 'infra/platform/charts'), join(directory, 'infra/platform/charts'));
  if (fault === 'metadata') {
    const snapshotPath = join(directory, 'infra/platform/backup/elastic/snapshots.yaml');
    const documents = parseAllDocuments(await readFile(snapshotPath, 'utf8'));
    const cron = documents.find((document) => document.get('kind') === 'CronJob');
    if (!cron) throw new Error('fixture CronJob absent');
    cron.setIn(['spec', 'jobTemplate', 'spec', 'template', 'metadata'], {
      annotations: { retained: 'owner' },
      labels: { retained: 'label' },
    });
    await writeFile(
      snapshotPath,
      documents.map((document) => stringify(document.toJSON())).join('---\n'),
    );
    const source = await createObservabilitySource(directory, request);
    const resource = source.handoffs
      .find((handoff) => handoff.path.endsWith('/snapshots.yaml'))
      ?.resources.find((resource) => resource.identity.includes(':CronJob:'));
    expect(resource?.patches).toContainEqual({
      op: 'add',
      path: '/spec/jobTemplate/spec/template/metadata',
      value: {
        annotations: { retained: 'owner' },
        labels: { retained: 'label', 'puni.dev/observability-flow': 'snapshot-check' },
      },
    });
    return;
  }
  if (fault === 'valid') {
    expect((await createObservabilitySource(directory, request)).scope).toBe(
      'full-service-desired-source',
    );
    return;
  }
  const path = join(
    directory,
    fault === 'profile YAML'
      ? 'infra/platform/alerts/production/kustomization.yaml'
      : 'infra/ansible/inventory/production-existing-hosts.yml',
  );
  if (fault.endsWith('YAML')) await appendFile(path, '\nproof: first\nproof: second\n');
  if (fault === 'enrolled peers')
    await writeFile(path, (await readFile(path, 'utf8')).replace('10.1.0.2', '10.1.0.3'));
  if (fault === 'absent') await unlink(path);
  if (fault === 'unreadable') await chmod(path, 0);
  try {
    const pending = createObservabilitySource(directory, request);
    expect(pending).rejects.toThrow();
    await pending.catch(() => undefined);
  } finally {
    if (fault === 'unreadable') await chmod(path, 0o600);
  }
});
