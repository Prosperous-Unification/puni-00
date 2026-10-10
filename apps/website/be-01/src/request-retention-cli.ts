import {
  assertRetentionCoverage,
  inspectRequestRetention,
  listAmbiguousRetentionSubjects,
  resolveRetentionAnchor,
  type RetentionSubjectKind,
} from '@website/store-sqlite';

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
export function runRequestRetentionCommand(arguments_: string[], now: number): unknown {
  const [command, databasePath] = arguments_;
  if (!databasePath) throw new Error(usage);
  if (command === 'resolve') {
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
    console.log(JSON.stringify(runRequestRetentionCommand(Bun.argv.slice(2), Date.now())));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Request retention failed');
    process.exitCode = 1;
  }
}
