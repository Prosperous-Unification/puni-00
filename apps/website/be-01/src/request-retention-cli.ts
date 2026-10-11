import {
  assertRetentionCoverage,
  inspectRequestRetention,
  listAmbiguousRetentionSubjects,
  resolveRetentionAnchor,
  type RetentionSubjectKind,
} from '@website/store-sqlite';

import { journalCommands, runRetentionJournalCommand } from './retention-journal-cli';

const usage =
  'Usage: report DATABASE | coverage DATABASE | ambiguous DATABASE | resolve DATABASE KIND SUBJECT_ID ANCHOR_MS EVIDENCE_REFERENCE ACTOR';

function parseKind(value: string): RetentionSubjectKind {
  if (value !== 'software_request' && value !== 'proposal_submission')
    throw new Error('Kind must be software_request or proposal_submission');
  return value;
}

function parseAnchor(value: string): number {
  // Proof: without this pattern the 1.5 child command reached the store's generic anchor refusal instead.
  if (!/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error('ANCHOR_MS must be decimal UTC epoch milliseconds');
  return Number(value);
}

/**
 * Runs one operator retention command without opening an API listener. `report` and `coverage`
 * print counts only; `ambiguous` prints typed identities without content. Nothing here deletes
 * or blanks content.
 */
export function runRequestRetentionCommand(
  arguments_: string[],
  now: number,
  environment: Record<string, string | undefined> = {},
): unknown {
  const [command, databasePath] = arguments_;
  if (!databasePath) throw new Error(usage);
  if (command === 'resolve') {
    // A local resolution would not survive a restore once the journal is active (veto V8).
    // Proof: dropping this refusal made `resolve refuses while the journal is active` resolve locally.
    if (environment['RETENTION_JOURNAL'] === 's3')
      throw new Error(
        'resolve is local-only; with RETENTION_JOURNAL=s3 the resolution must be journaled',
      );
    const [, , kind, subjectId, anchorText, evidenceReference, actor] = arguments_;
    if (
      arguments_.length !== 7 ||
      !kind ||
      !subjectId ||
      !anchorText ||
      !evidenceReference ||
      !actor
    )
      throw new Error(usage);
    return resolveRetentionAnchor(
      databasePath,
      {
        kind: parseKind(kind),
        subjectId,
        anchorAt: parseAnchor(anchorText),
        evidenceReference,
        actor,
      },
      now,
    );
  }
  // Proof: unknown-command and extra-argument child commands fail before opening a database.
  if (arguments_.length !== 2) throw new Error(usage);
  if (command === 'report') return inspectRequestRetention(databasePath, now);
  if (command === 'coverage') return assertRetentionCoverage(databasePath, now);
  if (command === 'ambiguous') return listAmbiguousRetentionSubjects(databasePath);
  throw new Error(usage);
}

if (import.meta.main) {
  try {
    const arguments_ = Bun.argv.slice(2);
    if (journalCommands.some((command) => command === arguments_[0])) {
      const outcome = await runRetentionJournalCommand(arguments_, {
        environment: process.env,
        now: Date.now(),
      });
      console.log(JSON.stringify(outcome.output));
      process.exitCode = outcome.exitCode;
    } else
      console.log(JSON.stringify(runRequestRetentionCommand(arguments_, Date.now(), process.env)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Request retention failed');
    process.exitCode = 1;
  }
}
