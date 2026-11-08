import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { registryFileJournal } from './registry-journal';

it('refuses a forged empty regular-release genesis and accepts only sealed inherited history', () => {
  const root = scratchSync('release-history-');
  const path = join(root, 'release.json');
  try {
    const history = {
      schemaVersion: 1,
      registryId: 'proof',
      product: 'wbs',
      environment: 'prod',
      target: 'k8s:uid/wbs/wbs-solver',
      source: path,
      genesis: { at: '2026-10-25T12:00:00.000Z', sourceRevision: 'observed-empty' },
      authorityRevision: 0,
      releases: [],
      promotion: null,
    };
    writeFileSync(
      path,
      JSON.stringify({ schemaVersion: 4, kind: 'registry-inheritance', registryHistory: history }),
    );
    expect(() => registryFileJournal(path).read()).toThrow();
    const bundle = {
      operationId: 'candidate',
      references: [{ repository: 'wbs-be', digest: `sha256:${'1'.repeat(64)}` }],
      receipt: { state: 'promoted', at: '2026-10-25T12:01:00.000Z' },
    };
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 4,
        kind: 'registry-inheritance',
        registryHistory: {
          ...history,
          authorityRevision: 9,
          releases: [bundle],
          promotion: {
            operationId: 'first-start',
            candidate: 'candidate',
            at: '2026-10-25T12:01:00.000Z',
          },
          inheritance: {
            source: join(root, 'first-start.json'),
            sha256: 'a'.repeat(64),
            operationId: 'first-start',
          },
        },
      }),
    );
    const journal = registryFileJournal(path);
    expect(journal.read()).toBeNull();
    expect(journal.readHistory?.()?.releases[0].operationId).toBe('candidate');
    expect(readFileSync(path, 'utf8')).toContain('registry-inheritance');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
