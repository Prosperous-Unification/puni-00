import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import {
  deriveScenarioIndex,
  importScenarioIdentifiers,
  proposeScenarioAllocation,
  type ScenarioJournal,
  validateScenarioProvenance,
} from './scenarios';

const JournalPath = 'openspec/scenario-allocations.json';
const SourcePath = type(/^openspec\/(?:changes\/[a-z0-9-]+\/specs\/|specs\/)[a-z0-9-]+\/spec\.md$/);
const NewIdentity = type({
  kind: "'import'|'allocate'",
  id: 'string>=1',
  source: 'string>=1',
  title: 'string>=1',
}).onUndeclaredKey('reject');
const SplitIdentity = type({
  kind: "'split'",
  id: 'string>=1',
  source: 'string>=1',
  title: 'string>=1',
  predecessor: 'string>=1',
}).onUndeclaredKey('reject');
const RenameIdentity = type({
  kind: "'rename'",
  id: 'string>=1',
  priorTitle: 'string>=1',
  title: 'string>=1',
  priorRevision: 'string>=1',
}).onUndeclaredKey('reject');
const RetireIdentity = type({ kind: "'retire'", id: 'string>=1' }).onUndeclaredKey('reject');
const JournalRecord = type({
  schemaVersion: '1',
  events: NewIdentity.or(SplitIdentity).or(RenameIdentity).or(RetireIdentity).array(),
}).onUndeclaredKey('reject');

/** Decodes the checked-in allocation journal at the external input boundary. */
export function decodeScenarioJournal(input: unknown): ScenarioJournal {
  // Proof: bypassing this schema boundary made wrong version and wrong field-type
  // journals reach provenance checking; both production CLI negatives failed.
  const journal = parseOrThrow(JournalRecord, input);
  // Proof: skipping this check made a schema-valid duplicate-event journal lose the
  // "malformed scenario journal" CLI boundary; its negative failed on raw reservation text.
  deriveScenarioIndex(journal);
  return journal;
}

function readText(path: string, label: string): string {
  try {
    // Proof: removing fatal UTF-8 decoding made the production invalid-byte journal
    // negative report malformed JSON with a replacement character instead of a read error.
    return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path));
  } catch (cause) {
    // Proof: replacing this rethrow with an empty string made the production absent-journal
    // negative report malformed JSON instead of ENOENT; the unreadable path separately reports EISDIR.
    throw new Error(
      `cannot read ${label} ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

function readJournal(repository: string): ScenarioJournal {
  const path = join(repository, JournalPath);
  const source = readText(path, 'scenario journal');
  let input: unknown;
  try {
    input = JSON.parse(source) as unknown;
  } catch (cause) {
    // Proof: rethrowing raw JSON syntax failure made the production malformed-journal
    // CLI negative lose its named boundary diagnostic.
    throw new Error(
      `malformed scenario journal ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  try {
    return decodeScenarioJournal(input);
  } catch (cause) {
    // Proof: rethrowing a schema failure made the production wrong-version journal
    // negative lose its named malformed-journal diagnostic.
    throw new Error(
      `malformed scenario journal ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

/** Pure proposed import/allocation or provenance check for one selected OpenSpec source. */
export function writeScenarioCommand(argv: readonly string[]): void {
  const [command, action, repository, rawSource, flag, predecessor] = argv;
  // Proof: replacing this usage refusal with `return` made unsupported `destroy` exit 0;
  // the production CLI negative expected exit 1.
  if (
    command !== 'scenario' ||
    (action !== 'import' && action !== 'allocate' && action !== 'validate') ||
    (argv.length !== 4 && argv.length !== 6) ||
    (argv.length === 6 && (action !== 'allocate' || flag !== '--predecessor'))
  ) {
    throw new Error(
      'usage: twilight-burokrat scenario <import|allocate|validate> <repository> <openspec-spec-path> [--predecessor <id>]',
    );
  }
  // Proof: bypassing SourcePath made the invalid-source CLI negative report a missing
  // specification file instead of rejecting the path at the input boundary.
  const source = parseOrThrow(SourcePath, rawSource);
  const root = resolve(repository);
  const specPath = resolve(root, source);
  const specMarkdown = readText(specPath, 'scenario specification');
  const journal = readJournal(root);
  if (action === 'validate') {
    process.stdout.write(
      `${JSON.stringify({ unidentified: validateScenarioProvenance(journal, source, specMarkdown) })}\n`,
    );
    return;
  }
  if (action === 'import') {
    const imported = importScenarioIdentifiers(journal, source, specMarkdown);
    process.stdout.write(
      `${JSON.stringify({ specMarkdown, events: imported.events.slice(journal.events.length), journal: imported })}\n`,
    );
    return;
  }
  const predecessors =
    argv.length === 4
      ? {}
      : Object.fromEntries(
          [...specMarkdown.matchAll(/^#### Scenario: (.*)$/gm)].map((match) => [
            match[1],
            predecessor,
          ]),
        );
  process.stdout.write(
    `${JSON.stringify(proposeScenarioAllocation(journal, source, specMarkdown, predecessors))}\n`,
  );
}
