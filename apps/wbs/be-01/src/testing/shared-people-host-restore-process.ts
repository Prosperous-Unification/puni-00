import { SUPPORTED_CAPACITY_MODES } from '@wbs/domain';
import { mock } from 'bun:test';

import {
  type HostRestorePaths,
  type HostRestoreRequest,
  restoreSharedPeopleOnHost,
} from '../shared-people-host-restore';

const path = process.argv.at(2);
if (path === undefined) throw new Error('rehearsal request path missing');
// Test-owned fixture JSON is written by the rehearsal; production accepts neither paths nor capability overrides.
const rehearsal = (await Bun.file(path).json()) as {
  request: HostRestoreRequest;
  paths: HostRestorePaths;
};
const mode = process.argv[3];
if (mode === 'production-cli') {
  // Exercise unchanged CLI argument parsing and real host policy with test-owned paths only.
  const restore = restoreSharedPeopleOnHost;
  await mock.module('../shared-people-host-restore', () => ({
    restoreSharedPeopleOnHost: (request: HostRestoreRequest) => restore(request, rehearsal.paths),
  }));
  process.argv = [
    process.execPath,
    'shared-people-host-restore-cli.ts',
    rehearsal.request.backup,
    '--operation=' + String(rehearsal.request.operationId),
    ...rehearsal.request.approvalIds.map((id) => '--approval=' + id),
  ];
  await import('../shared-people-host-restore-cli');
} else {
  // Test-only release seam: the production capability declaration stays isolated-only.
  (SUPPORTED_CAPACITY_MODES as string[]).push('shared');
  const receipt = await restoreSharedPeopleOnHost(rehearsal.request, rehearsal.paths);
  if (mode === 'lost-output') process.exit(73);
  console.log(JSON.stringify(receipt));
}
