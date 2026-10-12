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
  // The selection's own revocation lookup answers "not revoked" and is then
  // held, so revocation commits between that check and the cookie's issue.
  let releaseCheck: (() => void) | undefined;
  let checkAnswered: (() => void) | undefined;
  const answered = new Promise<void>((resolve) => {
    checkAnswered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    releaseCheck = resolve;
  });
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
    let lookups = 0;
    const selection = organizationSelection(
      {
        list: () => Promise.resolve([{ organizationId: 'org-a', name: 'org-a', role: 'member' }]),
      },
      organizationCookieBinding('test-session-key'),
      {
        isRevoked: async (credential) => {
          const revoked = await revocations.isRevoked(credential);
          lookups += 1;
          if (lookups === 1) {
            checkAnswered?.();
            await held;
          }
          return revoked;
        },
      },
      // No enforcement or policy in this fixture: the rules admit.
      () => Promise.resolve(null),
    );
    const issued = selection.endpoints.select(principal, 'org-a');
    await answered;
    await revocations.revoke(evidence, Date.now());
    releaseCheck?.();
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
    releaseCheck?.();
    connection.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
