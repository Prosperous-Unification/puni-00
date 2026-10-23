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
    ledger: '00ee2da0a8908338e8592e94459a536209b4e89530dc22891ac7979f49c50770',
    streams: [
      'c8141c6ce5de5ed7d18ee99210a98de6318cce737a76b39e4bdc9ad77d0528c4',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ],
  },
  skipping: {
    ledger: 'bf437bb37cfb051d98c4370134fde1d674adc0a40ee7e283e81f6c59316cfd37',
    streams: [
      '433d109493327d40d37f80d5076fbbecbebd338e66384086b8f6a4e1718080fd',
      'a4823a4414f7e0308abf3abfdc2fc3f036c92fa5f554c5588e7f1640c0e89a9c',
      'bbe6a94c29cc8d3ff5a1792a5abae1f1122aed0642111b52036ab7e0b2b2ca47',
      'dcd65b57777d6a0ae2b15a1c7790ca8caa12122848cedee48a135f6ef25e1d1c',
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
