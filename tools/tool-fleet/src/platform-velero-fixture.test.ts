import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseDocument } from 'yaml';

import { assessObservabilityBudget } from './observability-budget';

export const veleroPatch = `- op: test
  path: /spec/template/spec/volumes
  value:
    - name: cloud-credentials
      secret: { secretName: velero-credentials }
    - name: plugins
      emptyDir: {}
    - name: scratch
      emptyDir: {}
- op: add
  path: /spec/template/spec/volumes/1/emptyDir/sizeLimit
  value: 256Mi
- op: add
  path: /spec/template/spec/volumes/2/emptyDir/sizeLimit
  value: 1Gi
`;
export function veleroPostRenderers() {
  return [
    {
      kustomize: {
        patches: [
          {
            target: {
              group: 'apps',
              version: 'v1',
              kind: 'Deployment',
              name: 'velero',
              namespace: 'puni-backup',
            },
            patch: veleroPatch,
          },
        ],
      },
    },
  ];
}
/** A candidate fixture before its owning declarations land; historical input stays untouched. */
export function boundVeleroManifest(bytes: string) {
  const document = parseDocument(bytes);
  document.setIn(['spec', 'postRenderers'], veleroPostRenderers());
  document.setIn(['spec', 'values', 'resources', 'requests', 'ephemeral-storage'], '128Mi');
  document.setIn(['spec', 'values', 'resources', 'limits', 'ephemeral-storage'], '1Gi');
  document.setIn(['spec', 'values', 'initContainers', 0, 'resources'], {
    requests: { cpu: '50m', memory: '64Mi', 'ephemeral-storage': '16Mi' },
    limits: { cpu: '1', memory: '256Mi', 'ephemeral-storage': '128Mi' },
  });
  return document;
}
export async function writeVeleroCandidates(root: string) {
  for (const environment of ['local', 'production']) {
    const file = join(root, `infra/platform/backup/velero/${environment}/velero.yaml`);
    await writeFile(file, boundVeleroManifest(await readFile(file, 'utf8')).toString());
  }
  await writeFile(
    join(root, 'infra/platform/observability/base/coexistence.json'),
    JSON.stringify(await assessObservabilityBudget(root)),
  );
}
