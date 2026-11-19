import { deepStrictEqual, strictEqual } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import {
  type acquireRuntimeAuthority,
  type applyRuntimeCommands,
  type ClientInput,
  parseCanonicalRuntimeRequest,
  type RuntimeReceipt1,
  type RuntimeScope1,
} from '@wbs/contracts';
import { constants, Database } from 'bun:sqlite';
import { test } from 'bun:test';

import { createRuntimeClient } from '../../bridge/runtime-client';
import { dispatchAuthority } from '../dispatch-authority';
import { organizationId } from '../record-codecs';
import type { Ownership } from '../records';
import { readRuntimeHistory } from '../runtime-history';
import type { RuntimeAcceptance, RuntimeScopeSnapshot } from '../runtime-records';
import { createLegacyRecoveryReceiver } from '../testing/recovery-receiver';
import { openSqliteStores } from './open-stores';

interface OriginalCapture {
  readonly revision: string;
  readonly captured: {
    readonly ownership: Ownership;
    readonly pin: { readonly scope: RuntimeScope1 };
    readonly canonicalRequest: string;
    readonly receiptBytesBase64: string;
    readonly acceptance: { readonly value: RuntimeAcceptance };
    readonly history: RuntimeScopeSnapshot;
    readonly scopeTuple: string;
  };
  readonly physical: { readonly tables: Readonly<Record<string, readonly unknown[]>> };
  readonly fixture: { readonly sha256: string; readonly bytes: number };
}
function readOriginal() {
  const base = new URL(
    '../../../../../../../openspec/changes/wbs-work-packages/fixtures/',
    import.meta.url,
  );
  const compressed = readFileSync(new URL('legacy-dash-runtime6.sqlite.gz', base));
  strictEqual(
    createHash('sha256').update(compressed).digest('hex'),
    '2bf5736e00d175987b6d569fe067c5fdf59185e3a41de37c9d983a5635a33bbc',
  );
  // This test boundary describes the separately pinned original producer capture, never a production parser.
  const capture = JSON.parse(
    readFileSync(new URL('legacy-dash-runtime6.json', base), 'utf8'),
  ) as OriginalCapture;
  strictEqual(capture.revision, '7bdb31fd592eba83e696f570fbf9d2e1d9f26ebf');
  const bytes = gunzipSync(compressed);
  strictEqual(createHash('sha256').update(bytes).digest('hex'), capture.fixture.sha256);
  strictEqual(bytes.length, capture.fixture.bytes);
  return { capture, bytes };
}
function observe(path: string, names: readonly string[]) {
  const address = pathToFileURL(path);
  address.searchParams.set('immutable', '1');
  const database = new Database(
    address.href,
    constants.SQLITE_OPEN_READONLY | constants.SQLITE_OPEN_URI,
  );
  try {
    return Object.fromEntries(
      names.map((name) => [
        name,
        database
          .query('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid')
          .all()
          .map((entry) =>
            Object.fromEntries(
              Object.entries(entry as Record<string, unknown>).map(([key, value]) => [
                key,
                value instanceof Uint8Array
                  ? { base64: Buffer.from(value).toString('base64') }
                  : typeof value === 'bigint'
                    ? { bigint: value.toString() }
                    : value,
              ]),
            ),
          ),
      ]),
    );
  } finally {
    database.close();
  }
}
test('current native open and cold reopen retain genuine outgoing Dash6 identity and accepted duplicate without HTTP', async () => {
  const { capture, bytes } = readOriginal();
  const directory = mkdtempSync(join(tmpdir(), 'dash6-rename-'));
  const path = join(directory, 'runs.sqlite');
  writeFileSync(path, bytes, { flag: 'wx' });
  const tables = Object.keys(capture.physical.tables);
  try {
    deepStrictEqual(observe(path, tables), capture.physical.tables);
    const scope = capture.captured.pin.scope;
    strictEqual(
      capture.captured.scopeTuple,
      JSON.stringify([scope.organizationId, scope.projectId, scope.personId]),
    );
    deepStrictEqual(parseCanonicalRuntimeRequest(capture.captured.canonicalRequest).scope, {
      organizationId: scope.organizationId,
      workPackageId: scope.projectId,
      personId: scope.personId,
    });
    const options = {
      path,
      organizationId: organizationId(scope.organizationId),
      capacity: 1,
      leaseMilliseconds: 10000,
      clock: { read: () => 1000 },
      maxBusyAttempts: 20,
      busyDelayMilliseconds: 1,
    };
    let sends = 0;
    const client = createRuntimeClient(() => {
      sends++;
      throw Error('accepted historical duplicate must not send HTTP');
    });
    for (let turn = 0; turn < 2; turn++) {
      const stores = await openSqliteStores(options);
      try {
        deepStrictEqual(
          await readRuntimeHistory(stores.runs, stores.artifacts, scope),
          capture.captured.history,
        );
        const duplicate = await dispatchAuthority(
          stores.runs,
          stores.artifacts,
          client,
          { ownership: capture.captured.ownership, scope, expectedRevision: 0 },
          capture.captured.canonicalRequest,
          new AbortController().signal,
        );
        strictEqual(duplicate.kind, 'accepted');
        deepStrictEqual(duplicate.acceptance, capture.captured.acceptance.value);
        strictEqual(
          Buffer.from(await stores.artifacts.readArtifact(duplicate.acceptance.evidence)).toString(
            'base64',
          ),
          capture.captured.receiptBytesBase64,
        );
      } finally {
        await stores.close();
      }
      deepStrictEqual(observe(path, tables), capture.physical.tables);
    }
    strictEqual(sends, 0);
  } finally {
    rmSync(directory, { recursive: true });
  }
}, 60000);

type CommandBody = ClientInput<typeof applyRuntimeCommands>['body'];
interface PairedWbsCapture {
  readonly scope: RuntimeScope1;
  readonly authorityRequest: ClientInput<typeof acquireRuntimeAuthority>['body'];
  readonly claimRequest: CommandBody & {
    action: Extract<CommandBody['action'], { kind: 'claim' }>;
  };
  readonly writeRequest: CommandBody & {
    action: Extract<CommandBody['action'], { kind: 'write' }>;
  };
  readonly receipts: {
    readonly authority: RuntimeReceipt1;
    readonly claim: RuntimeReceipt1;
    readonly write: RuntimeReceipt1;
  };
  readonly tables: {
    readonly runtime_command_receipt: readonly {
      readonly command_id: string;
      readonly accepted: string;
    }[];
  };
}
test('current RuntimeClient replays all original1 operations after actual111 migration cold reopen and deleted references with current authorization', async () => {
  const base = new URL(
    '../../../../../../../openspec/changes/wbs-work-packages/fixtures/',
    import.meta.url,
  );
  // Test-only types are pinned by the independent original producer fixture and mounted strict current client decoders.
  const paired = JSON.parse(
    readFileSync(new URL('legacy-runtime-database1.txt', base), 'utf8'),
  ) as PairedWbsCapture;
  const provenance = JSON.parse(
    readFileSync(new URL('legacy-runtime-database-capture.json', base), 'utf8'),
  ) as { readonly outgoingMigrations: readonly { readonly name: string; readonly hash: string }[] };
  const receiver = await createLegacyRecoveryReceiver();
  const params = { id: paired.scope.projectId };
  const lookup = (commandId: string) =>
    receiver.client.lookupReceipt({
      params: { ...params, commandId },
      query: {
        personId: paired.scope.personId,
        expectedLedgerId: paired.authorityRequest.expectedLedgerId,
      },
    });
  const retries = [
    {
      name: 'grant',
      receipt: paired.receipts.authority,
      send: () => receiver.client.acquireAuthority({ params, body: paired.authorityRequest }),
      changed: () =>
        receiver.client.acquireAuthority({
          params,
          body: { ...paired.authorityRequest, ownerId: 'changed-valid-owner' },
        }),
    },
    {
      name: 'claim',
      receipt: paired.receipts.claim,
      send: () => receiver.client.applyCommands({ params, body: paired.claimRequest }),
      changed: () =>
        receiver.client.applyCommands({
          params,
          body: {
            ...paired.claimRequest,
            action: {
              ...paired.claimRequest.action,
              execution: { ...paired.claimRequest.action.execution, runId: 'changed-valid-run' },
            },
          },
        }),
    },
    {
      name: 'write',
      receipt: paired.receipts.write,
      send: () => receiver.client.applyCommands({ params, body: paired.writeRequest }),
      changed: () =>
        receiver.client.applyCommands({
          params,
          body: {
            ...paired.writeRequest,
            action: {
              ...paired.writeRequest.action,
              commands: [
                { kind: 'setProgress', workItemId: 'leaf', stepId: 'dev', state: 'in_progress' },
              ],
            },
          },
        }),
    },
  ];
  function inspect() {
    return receiver.inspectRuntime() as Record<string, readonly Record<string, unknown>[]>;
  }
  function retained() {
    return inspect()
      ['runtime_command_receipt'].map((row) => ({
        command_id: row['command_id'],
        accepted: row['accepted'],
      }))
      .sort((left, right) => String(left.command_id).localeCompare(String(right.command_id)));
  }
  const expectedRetained = paired.tables.runtime_command_receipt
    .map(({ command_id, accepted }) => ({ command_id, accepted }))
    .sort((left, right) => left.command_id.localeCompare(right.command_id));
  const rawResponses = new Map<string, string>();
  try {
    const first = inspect();
    const ledger = first['__drizzle_migrations'].map((row) => ({
      name: row['name'],
      hash: row['hash'],
    }));
    strictEqual(ledger.length, 111);
    deepStrictEqual(ledger.slice(0, 110), provenance.outgoingMigrations);
    const rename = readFileSync(
      new URL(
        '../../../../../../../apps/wbs/be-01/drizzle/20261110100000_rename_project_to_work_package/migration.sql',
        import.meta.url,
      ),
    );
    deepStrictEqual(ledger[110], {
      name: '20261110100000_rename_project_to_work_package',
      hash: createHash('sha256').update(rename).digest('hex'),
    });
    deepStrictEqual(retained(), expectedRetained);
    for (let round = 0; round < 3; round++) {
      if (round === 1) await receiver.reopen();
      if (round === 2) receiver.deleteRuntimeTargets();
      const before = receiver.inspectRuntime();
      for (const retry of retries) {
        for (const [operation, exchange] of [
          ['post', await retry.send()],
          ['lookup', await lookup(retry.name)],
        ] as const) {
          strictEqual(exchange.reply.kind, 'success');
          deepStrictEqual(exchange.reply.body, retry.receipt);
          if (exchange.response === null)
            throw Error('historical current-client response capture absent');
          const raw = Buffer.from(exchange.response.bytes).toString('base64');
          const key = retry.name + ':' + operation;
          if (round === 0) rawResponses.set(key, raw);
          else strictEqual(raw, rawResponses.get(key));
        }
      }
      deepStrictEqual(receiver.inspectRuntime(), before);
      deepStrictEqual(retained(), expectedRetained);
    }
    for (const retry of retries) {
      const before = receiver.inspectRuntime();
      const changed = await retry.changed();
      strictEqual(changed.reply.kind, 'refusal');
      strictEqual(changed.reply.status, 409);
      deepStrictEqual(changed.reply.body, { error: 'runtime_command_conflict' });
      deepStrictEqual(receiver.inspectRuntime(), before);
    }
    receiver.allowReadOnly();
    strictEqual((await receiver.readWorkPackage()).status, 200);
    for (const retry of retries) {
      const before = receiver.inspectRuntime();
      const refused = await retry.send();
      strictEqual(refused.reply.kind, 'refusal');
      strictEqual(refused.reply.status, 403);
      deepStrictEqual(refused.reply.body, { error: 'forbidden', permission: 'package.write' });
      const lookupRefused = await lookup(retry.name);
      strictEqual(lookupRefused.reply.kind, 'refusal');
      strictEqual(lookupRefused.reply.status, 403);
      deepStrictEqual(lookupRefused.reply.body, {
        error: 'forbidden',
        permission: 'package.write',
      });
      deepStrictEqual(receiver.inspectRuntime(), before);
    }
    receiver.restoreWrite();
    const before = inspect();
    const fresh = await receiver.client.acquireAuthority({
      params,
      body: {
        ...paired.authorityRequest,
        commandId: 'fresh-current2',
        ownerId: 'current-dash',
        expectedGeneration: 1,
      },
    });
    strictEqual(fresh.reply.kind, 'success');
    strictEqual(fresh.reply.body.schemaVersion, 2);
    deepStrictEqual(fresh.reply.body.scope, {
      organizationId: paired.scope.organizationId,
      workPackageId: paired.scope.projectId,
      personId: paired.scope.personId,
    });
    deepStrictEqual(fresh.reply.body.acceptance, {
      kind: 'authority',
      authority: { ownerId: 'current-dash', generation: 2 },
    });
    const after = inspect();
    strictEqual(before['runtime_command_receipt'].length, 3);
    strictEqual(after['runtime_command_receipt'].length, 4);
    deepStrictEqual(
      after['runtime_ledger'],
      before['runtime_ledger'].map((row) => ({ ...row, receipt_count: 4 })),
    );
    deepStrictEqual(
      after['runtime_authority'],
      before['runtime_authority'].map((row) => ({
        ...row,
        owner_id: 'current-dash',
        generation: 2,
      })),
    );
    deepStrictEqual(
      retained().filter((row) => row.command_id !== 'fresh-current2'),
      expectedRetained,
    );
    const added = after['runtime_command_receipt'].find(
      (row) => row['command_id'] === 'fresh-current2',
    );
    if (added === undefined || typeof added['accepted'] !== 'string')
      throw Error('current2 acceptance row absent');
    const accepted = JSON.parse(added['accepted']) as {
      schemaVersion: number;
      canonicalRequest: string;
      receipt: unknown;
    };
    strictEqual(accepted.schemaVersion, 2);
    strictEqual(
      (JSON.parse(accepted.canonicalRequest) as { schemaVersion: number }).schemaVersion,
      2,
    );
    deepStrictEqual(accepted.receipt, fresh.reply.body);
  } finally {
    await receiver.close();
  }
}, 60000);

for (const operation of ['grant', 'claim', 'write'] as const)
  test(
    'native original1 changed ' +
      operation +
      ' requires exact identity conflict after cold deletion',
    async () => {
      const base = new URL(
        '../../../../../../../openspec/changes/wbs-work-packages/fixtures/',
        import.meta.url,
      );
      // Exact paired fixture is authenticated by createLegacyRecoveryReceiver; this type only describes the test request bodies1.
      const paired = JSON.parse(
        readFileSync(new URL('legacy-runtime-database1.txt', base), 'utf8'),
      ) as PairedWbsCapture;
      const receiver = await createLegacyRecoveryReceiver();
      const params = { id: paired.scope.projectId };
      try {
        const original =
          operation === 'grant'
            ? await receiver.client.acquireAuthority({ params, body: paired.authorityRequest })
            : await receiver.client.applyCommands({
                params,
                body: operation === 'claim' ? paired.claimRequest : paired.writeRequest,
              });
        strictEqual(original.reply.kind, 'success');
        deepStrictEqual(
          original.reply.body,
          operation === 'grant'
            ? paired.receipts.authority
            : operation === 'claim'
              ? paired.receipts.claim
              : paired.receipts.write,
        );
        await receiver.reopen();
        receiver.deleteRuntimeTargets();
        const before = receiver.inspectRuntime();
        const changed =
          operation === 'grant'
            ? await receiver.client.acquireAuthority({
                params,
                body: { ...paired.authorityRequest, ownerId: 'independently-changed-owner' },
              })
            : operation === 'claim'
              ? await receiver.client.applyCommands({
                  params,
                  body: {
                    ...paired.claimRequest,
                    action: {
                      ...paired.claimRequest.action,
                      execution: {
                        ...paired.claimRequest.action.execution,
                        runId: 'independently-changed-run',
                      },
                    },
                  },
                })
              : await receiver.client.applyCommands({
                  params,
                  body: {
                    ...paired.writeRequest,
                    action: {
                      ...paired.writeRequest.action,
                      commands: [
                        {
                          kind: 'setProgress',
                          workItemId: 'leaf',
                          stepId: 'dev',
                          state: 'in_progress',
                        },
                      ],
                    },
                  },
                });
        strictEqual(changed.reply.kind, 'refusal');
        strictEqual(changed.reply.status, 409);
        deepStrictEqual(changed.reply.body, { error: 'runtime_command_conflict' });
        deepStrictEqual(receiver.inspectRuntime(), before);
      } finally {
        await receiver.close();
      }
    },
    60000,
  );
