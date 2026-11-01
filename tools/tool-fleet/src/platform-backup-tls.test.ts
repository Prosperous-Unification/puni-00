import { expect, it } from 'bun:test';

import { referencedSecrets } from './platform-manifests';

it('includes a CA referenced only by Velero in Secret closure', () => {
  expect(
    referencedSecrets([
      {
        path: 'backup/velero/local/velero.yaml',
        document: {
          kind: 'HelmRelease',
          metadata: { name: 'velero', namespace: 'puni-backup' },
          spec: {
            values: {
              extraObjects: [
                { spec: { objectStorage: { caCertRef: { name: 'fixture-ca', key: 'ca.crt' } } } },
              ],
            },
          },
        },
      },
    ]),
  ).toContain('puni-backup/fixture-ca');
});
