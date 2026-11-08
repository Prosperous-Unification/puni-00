import { type } from 'arktype';
import { mock, setSystemTime } from 'bun:test';

import { registryClusterFixture } from './registry-maintenance-cluster.fixture';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { parseRegistryCommandResponse } from './registry-managed-journal';
import { readRegistryBytes } from './registry-stream';

const mode = type
  .enumerated(
    'valid',
    'missing',
    'incomplete',
    'stale',
    'future',
    'revision',
    'operation',
    'store',
    'path',
    'capacity',
    'snapshot',
    'plan',
    'bytes',
    'inodes',
  )
  .assert(process.argv.at(2));
const response = parseRegistryCommandResponse(
  JSON.parse(
    new TextDecoder().decode(
      await readRegistryBytes(Bun.stdin.stream(), 1024 * 1024, 'root receipt fixture'),
    ),
  ),
);
const journal = response.state;
if (
  journal.schemaVersion !== 4 ||
  journal.maintenanceEvidence === null ||
  journal.maintenance === null
)
  throw new Error('Missing actual held journal');
const evidence = journal.maintenanceEvidence;
const receipt = evidence.reclamation;
if (receipt?.after == null) throw new Error('Missing actual completed measurement');
setSystemTime(
  new Date(Date.parse(receipt.after.at) + (mode === 'stale' ? 60001 : mode === 'future' ? -1 : 0)),
);
if (mode === 'missing') delete evidence.reclamation;
if (mode === 'incomplete')
  evidence.reclamation = {
    ...receipt,
    after: null,
    planSha256: null,
    reclaimedBytes: null,
    reclaimedInodes: null,
  };
if (mode === 'revision') journal.revision++;
if (mode === 'operation') receipt.operationId = 'foreign';
if (mode === 'store') receipt.storageId = 'foreign';
if (mode === 'path') receipt.registryPath = '/foreign';
if (mode === 'capacity') journal.enrollment.maximumBytes++;
if (mode === 'snapshot') receipt.snapshotId = 'b'.repeat(64);
if (mode === 'plan') evidence.plan = '{}';
if (mode === 'bytes') receipt.reclaimedBytes = 500;
if (mode === 'inodes') receipt.reclaimedInodes = 5;
const fixture = registryClusterFixture();
// Boundary: installed mount/config parsing and Kubernetes effects are modeled. Valid lineage must reach the first trusted effect; invalid lineage must refuse before it.
const installed = {
  ...fixture.installed,
  schemaVersion: 1,
  recovery: { state: 'unenrolled' },
  registryId: journal.enrollment.registryId,
  journalMaximumBytes: journal.enrollment.journalMaximumBytes,
  ordinary: {
    ...fixture.installed.ordinary,
    path: journal.enrollment.registryPath,
    storageId: journal.enrollment.storageId,
    maximumBytes: journal.enrollment.maximumBytes,
  },
} as RegistryMaintenanceInstallation;
const observed = { effects: 0, message: '' };
await mock.module('./registry-maintenance-kubernetes', () => ({
  createRegistryKubernetes: () => {
    observed.effects++;
    throw new Error('trusted-effect-boundary');
  },
}));
const { executeRegistryHostAction } = await import('./registry-maintenance-actions');
try {
  await executeRegistryHostAction({
    installed,
    journal,
    request: {
      action: 'restore-service',
      operationId: journal.maintenance.operationId,
      owner: journal.maintenance.owner,
      token: journal.maintenance.token,
    },
    signal: new AbortController().signal,
    descriptor: 3,
    ready: () => Promise.resolve(),
  });
  throw new Error('Unexpected root restoration return');
} catch (cause) {
  if (!(cause instanceof Error)) throw cause;
  observed.message = cause.message;
}
process.stdout.write(JSON.stringify(observed));
