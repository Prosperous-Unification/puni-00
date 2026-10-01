import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AuthenticatedUser, VerifiedOrganizationCredential } from '@wbs/contracts';
import {
  openConnection,
  runMigrations,
  SqliteBrowserCredentialRevocations,
  WriteCoordinator,
} from '@wbs/store-sqlite';
import { expect, test } from 'bun:test';

import { organizationCookieBinding } from './organization-cookie';
import { organizationSelection } from './organization-selection';

const MIGRATIONS = new URL('../../drizzle', import.meta.url).pathname;

test('a selection in flight before revocation cannot restore authority after its cookie issues', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'wbs-revocation-race-'));
  const path = join(folder, 'test.db');
  runMigrations(path, MIGRATIONS);
  const connection = openConnection(path);
  let releaseChoices:
    | ((memberships: readonly { organizationId: string; name: string; role: 'member' }[]) => void)
    | undefined;
  let choicesStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    choicesStarted = resolve;
  });
  const choices = new Promise<readonly { organizationId: string; name: string; role: 'member' }[]>(
    (resolve) => {
      releaseChoices = resolve;
    },
  );
  try {
    const evidence: VerifiedOrganizationCredential = {
      kind: 'native',
      userId: 'ada',
      digest: 'a'.repeat(64),
      expiresAt: Date.now() + 60_000,
    };
    const principal: AuthenticatedUser = {
      id: 'ada',
      username: 'ada',
      scopes: [],
      organizationBinding: { credential: evidence, cookie: null },
    };
    const revocations = new SqliteBrowserCredentialRevocations(
      connection.db,
      new WriteCoordinator(),
    );
    const selection = organizationSelection(
      {
        list: () => {
          choicesStarted?.();
          return choices;
        },
      },
      organizationCookieBinding('test-session-key'),
      revocations,
    );
    const issued = selection.endpoints.select(principal, 'org-a');
    await started;
    await revocations.revoke(evidence, Date.now());
    releaseChoices?.([{ organizationId: 'org-a', name: 'org-a', role: 'member' }]);
    const outcome = await issued;
    expect(outcome.kind).toBe('selected');
    if (outcome.kind !== 'selected') throw new Error('selection did not issue a cookie');
    // Proof: removing the post-commit shared read made this cookie recover
    // org-a, even though revocation had committed before it was issued.
    expect(
      await selection.activeOrganizationOf({
        ...principal,
        organizationBinding: { credential: evidence, cookie: outcome.cookie },
      }),
    ).toBeNull();
  } finally {
    releaseChoices?.([]);
    connection.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
