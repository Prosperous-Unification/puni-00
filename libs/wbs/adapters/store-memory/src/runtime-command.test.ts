import { assertRuntimeRejection } from '@wbs/conformance/runtime-command-conformance';
import {
  runtimeCommandConformance,
  runtimeRecordConformance,
} from '@wbs/conformance/runtime-command-conformance';
import { describe } from 'bun:test';

import { openMemorySource } from './source';

describe('memory runtime command persistence', () => {
  const open = () => {
    const source = openMemorySource();
    return Promise.resolve({ source, close: () => source.close() });
  };
  runtimeCommandConformance(open);
  runtimeRecordConformance(open);
});

import { it } from 'bun:test';

import { inMemoryRuntimeCommands, memoryRuntimeTable } from './runtime-command';

it('rejects retained memory history loss before reporting receipt or scope absence', async () => {
  const table = memoryRuntimeTable();
  const store = inMemoryRuntimeCommands(table);
  const scope = { organizationId: 'org', projectId: 'project', personId: 'person' };
  await store.compareAuthority(scope, null, 'owner');
  table.authorities.clear();
  await assertRuntimeRejection(store.readAuthority(scope), 'runtime retained history');
  await assertRuntimeRejection(store.readAcceptance(scope, 'absent'), 'runtime retained history');
  await assertRuntimeRejection(store.assertAbsentHistory(), 'runtime retained history');
});
