import { createHash } from 'node:crypto';

import { type } from 'arktype';

import { renderDevConfiguration } from './configuration';

const Commit = type(/^[a-f0-9]{40}$/);
const Hash = type(/^[a-f0-9]{64}$/);
const Files = type({ 'alertmanager.yaml': Hash, 'compose.slack.json': Hash, '+': 'reject' });
const Manifest = type({
  schemaVersion: '1',
  purpose: "'puni-alerts/1'",
  environment: "'dev'",
  host: "'h3mon'",
  project: "'puni-dev-observability'",
  sourceCommit: Commit,
  files: Files,
  '+': 'reject',
});
const Observation = type({
  directory: 'string',
  mountedPath: 'string',
  manifest: Manifest,
  actual: Files,
  '+': 'reject',
});
const hashText = (text: string) => createHash('sha256').update(text).digest('hex');

/** Produces only the authorized Alertmanager config, its read-only mount overlay and a source-identified manifest. The caller separately proves the commit's review/gate status; this pure renderer does not authorize host writes. Existing services and the named Alertmanager store are inherited unchanged from the retained base. */
export function renderNotificationRelease(sourceCommit: string) {
  // Proof: removing the source-format assertion accepts malformed/traversing source identities in notification-release.test.ts.
  const commit = Commit.assert(sourceCommit);
  const directory = '/home/monitor/puni-dev-observability/releases/slack-' + commit;
  const configuration = renderDevConfiguration()['alertmanager.yaml'];
  const overlay =
    JSON.stringify(
      {
        services: {
          alertmanager: {
            volumes: [
              'alertmanager:/alertmanager',
              directory + '/alertmanager.yaml:/etc/puni/alertmanager.yaml:ro',
            ],
          },
        },
      },
      null,
      2,
    ) + '\n';
  const manifest = {
    schemaVersion: 1,
    purpose: 'puni-alerts/1',
    environment: 'dev',
    host: 'h3mon',
    project: 'puni-dev-observability',
    sourceCommit: commit,
    files: {
      'alertmanager.yaml': hashText(configuration),
      'compose.slack.json': hashText(overlay),
    },
  };
  return {
    directory,
    files: {
      'alertmanager.yaml': configuration,
      'compose.slack.json': overlay,
      'manifest.json': JSON.stringify(manifest, null, 2) + '\n',
    },
  };
}

/** Revalidates actual mounted-file hashes against current trusted rendering, including the exact retained-volume overlay. A self-consistent host manifest alone cannot establish policy. Source identity is recorded provenance, not proof of Git review/gating or an apply authorization. */
export function validateNotificationRelease(input: unknown) {
  // Proof: schema omission admits foreign purpose and extra files in notification-release.test.ts.
  const observed = Observation.assert(input);
  const expected = renderNotificationRelease(observed.manifest.sourceCommit);
  const manifest = Manifest.assert(JSON.parse(expected.files['manifest.json']));
  // Proof: path-guard omission admits foreign mount/directory/source relationships in notification-release.test.ts.
  if (
    observed.directory !== expected.directory ||
    observed.mountedPath !== expected.directory + '/alertmanager.yaml'
  )
    throw new Error('Notification configuration is not mounted from its exact owned release');
  // Proof: hash-guard omission admits changed bytes; replacing trusted-render comparison with host-only consistency admits forged matching hashes in notification-release.test.ts.
  for (const name of ['alertmanager.yaml', 'compose.slack.json'] as const)
    if (
      observed.actual[name] !== manifest.files[name] ||
      observed.manifest.files[name] !== manifest.files[name]
    )
      throw new Error('Notification release differs from trusted rendered policy');
  return {
    sourceCommit: observed.manifest.sourceCommit,
    directory: observed.directory,
    mountedPath: observed.mountedPath,
  };
}
