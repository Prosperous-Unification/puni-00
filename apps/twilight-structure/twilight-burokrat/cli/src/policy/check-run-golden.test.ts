import { Buffer } from 'node:buffer';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { CheckRunLedger } from '../contracts/records';
import { hashBytes } from '../evidence/content-manifest';
import { dashCheckRunAuthority } from './check-run-authority';
import { goldenCheckRuns } from './check-run-fixtures';
import { planCandidateCheckRuns, readCheckRuns } from './check-runs';
import {
  candidateIdentityAt,
  createRelocationCandidate,
  disposeRelocationFixtures,
} from './relocation-fixtures';

/**
 * The SHA-256 of each golden ledger's bytes and the stream files it names. Regenerating a golden
 * (`fixtures/check-runs/README.md`) changes these; nothing else may.
 */
const pinned = {
  passing: {
    ledger: 'a7c6f41746e8f8adcfad147ff07a13d37afd82e6781929a966caabc1d4ec0933',
    streams: [
      '98723f679a1da659dc536c1bb913213740e575fda5853b91d2d65ac66a2c1a4b',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ],
  },
  skipping: {
    ledger: 'd2b030865c97214daaf1348b5070d608c002b7f22a50cc1e47e917adba622941',
    streams: [
      '6043908c8d26d62698476b88f737f39d5d3e91008d4155a81730902f5a37479c',
      '667da95e7097209cbdf69350717ea2fa0959c79f93c33bdaf66dd79d2aa0d085',
      'bbbbb014c5342e1ec0e357832451503b6f76985f62acf5a4f2f1f6761c5c79f9',
      'ffa58106b0212b64e04c51f3f90ba6274d63d398589e32229bd0aa971ef227a3',
    ],
  },
} as const;

const regenerate =
  'the reproducible candidate no longer matches the golden check runs; regenerate them as ' +
  'apps/twilight-structure/twilight-burokrat/cli/fixtures/check-runs/README.md describes';

afterAll(disposeRelocationFixtures);

describe('the golden check runs Twilight Dash wrote', () => {
  test('keep their pinned bytes', () => {
    // Proof (2026-10-12): appending a newline to the passing ledger failed here with the new
    // digest received; adding a third stream file failed the stream listing.
    for (const name of ['passing', 'skipping'] as const) {
      const directory = goldenCheckRuns[name];
      expect(hashBytes(readFileSync(join(directory, 'check-runs.json'))), name).toBe(
        pinned[name].ledger,
      );
      expect(readdirSync(join(directory, 'streams')).sort(), name).toEqual([
        ...pinned[name].streams,
      ]);
    }
  });

  test('bind the reproducible candidate and judge as its planned checks', () => {
    for (const [name, skippingCheck] of [
      ['passing', false],
      ['skipping', true],
    ] as const) {
      const fixture = createRelocationCandidate({ reproducible: true, skippingCheck });
      const ledger = CheckRunLedger.assert(
        JSON.parse(readFileSync(join(goldenCheckRuns[name], 'check-runs.json'), 'utf8')),
      );
      const candidate = {
        revision: fixture.candidateRevision,
        identity: candidateIdentityAt(fixture.repository, fixture.candidateRevision),
      };
      // Proof (2026-10-12): dropping `reproducible: true` from the candidate failed here on the
      // revision, with the message naming the regeneration procedure.
      expect(
        ledger.runs.map((run) => run.candidate),
        `${name}: ${regenerate}`,
      ).toEqual([candidate]);
      const plan = planCandidateCheckRuns(
        fixture.repository,
        fixture.candidateRevision,
        'docs/wiki-policy/policy.json',
      );
      const [run] = readCheckRuns(goldenCheckRuns[name], plan, dashCheckRunAuthority);
      expect([run.checkId, run.exitCode], name).toEqual(['check.fixture.module', 0]);
      const measured = new TextDecoder().decode(
        Buffer.concat([run.measured.stdout, run.measured.stderr]),
      );
      expect(measured, name).toContain(skippingCheck ? ' 1 skip' : 'relocation fixture check');
    }
  });
});
