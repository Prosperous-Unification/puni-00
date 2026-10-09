import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import {
  assertScenarioJournalExtends,
  deriveScenarioIndex,
  importScenarioIdentifiers,
  proposeScenarioAllocation,
  type ScenarioJournal,
  type ScenarioProposal,
  validateScenarioProvenance,
} from './scenarios';

const source = 'openspec/specs/example/spec.md';
const identified = `### Requirement: example\n#### Scenario: [EXAMPLE-001] First case\n- **WHEN** it runs\n- **THEN** it works\n`;
const blank = `### Requirement: example\n#### Scenario: First case\n- **WHEN** it runs\n- **THEN** it works\n`;
const empty: ScenarioJournal = { schemaVersion: 1, events: [] };
const repositories: string[] = [];
const cliPath = join(import.meta.dir, '..', 'cli.ts');

function runScenarioCli(argv: string[]): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([process.execPath, 'run', cliPath, 'scenario', ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

function outputOf(output: Uint8Array | undefined): string {
  if (output === undefined) throw new Error('scenario CLI output pipe was unavailable');
  return Buffer.from(output).toString('utf8');
}

function repositoryWith(specMarkdown: string, journal: string): string {
  const repository = mkdtempSync(join(tmpdir(), 'scenario-allocator-'));
  repositories.push(repository);
  for (const [path, sourceText] of [
    [source, specMarkdown],
    ['openspec/scenario-allocations.json', journal],
  ]) {
    const target = join(repository, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, sourceText);
  }
  return repository;
}

afterEach(() => {
  for (const repository of repositories.splice(0))
    rmSync(repository, { recursive: true, force: true });
});

describe('scenario allocation journal', () => {
  test('imports an existing identifier unchanged, then allocates the next ordinal', () => {
    const imported = importScenarioIdentifiers(empty, source, identified);
    expect(imported.events).toEqual([
      { kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' },
    ]);
    const proposal = proposeScenarioAllocation(
      imported,
      source,
      `${identified}#### Scenario: Second case\n`,
    );
    expect(proposal.specMarkdown).toContain('#### Scenario: [EXAMPLE-002] Second case');
    expect(proposal.events).toEqual([
      { kind: 'allocate', id: 'EXAMPLE-002', source, title: 'Second case' },
    ]);
    expect(proposal.journal.events).toHaveLength(2);
  });

  test('imports an identified title before provenance enforcement', () => {
    expect(() => validateScenarioProvenance(empty, source, identified)).toThrow('EXAMPLE-001');
    const imported = importScenarioIdentifiers(empty, source, identified);
    expect(validateScenarioProvenance(imported, source, identified)).toEqual([]);
  });

  test('keeps a retired identifier reserved and rejects reuse', () => {
    const journal: ScenarioJournal = {
      schemaVersion: 1,
      events: [
        { kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' },
        { kind: 'retire', id: 'EXAMPLE-001' },
        { kind: 'allocate', id: 'EXAMPLE-001', source, title: 'Reused case' },
      ],
    };
    expect(() => deriveScenarioIndex(journal)).toThrow('EXAMPLE-001');
    const retired: ScenarioJournal = { schemaVersion: 1, events: journal.events.slice(0, 2) };
    expect(proposeScenarioAllocation(retired, source, blank).events[0]?.id).toBe('EXAMPLE-002');
  });

  test('records a rename under the same identifier and a split under its predecessor', () => {
    const journal: ScenarioJournal = {
      schemaVersion: 1,
      events: [
        { kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' },
        {
          kind: 'rename',
          id: 'EXAMPLE-001',
          priorTitle: 'First case',
          title: 'Renamed case',
          priorRevision: 'abc123',
        },
      ],
    };
    const proposal = proposeScenarioAllocation(
      journal,
      source,
      '### Requirement: example\n#### Scenario: [EXAMPLE-001] Renamed case\n#### Scenario: Split A\n#### Scenario: Split B\n',
      { 'Split A': 'EXAMPLE-001', 'Split B': 'EXAMPLE-001' },
    );
    expect(proposal.events).toEqual([
      { kind: 'split', id: 'EXAMPLE-002', source, title: 'Split A', predecessor: 'EXAMPLE-001' },
      { kind: 'split', id: 'EXAMPLE-003', source, title: 'Split B', predecessor: 'EXAMPLE-001' },
    ]);
    expect(deriveScenarioIndex(proposal.journal).get('EXAMPLE-001')?.title).toBe('Renamed case');
  });

  test('rejects a split whose predecessor was never issued', () => {
    const imported = importScenarioIdentifiers(empty, source, identified);
    expect(() =>
      proposeScenarioAllocation(imported, source, `${identified}#### Scenario: Split A\n`, {
        'Split A': 'EXAMPLE-999',
      }),
    ).toThrow('EXAMPLE-999');
  });

  test('refuses removal or rewriting of trusted prior events', () => {
    const prior: ScenarioJournal = {
      schemaVersion: 1,
      events: [
        { kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' },
        { kind: 'retire', id: 'EXAMPLE-001' },
      ],
    };
    expect(() => {
      assertScenarioJournalExtends({ schemaVersion: 1, events: prior.events.slice(0, 1) }, prior);
    }).toThrow('removed');
    expect(() => {
      assertScenarioJournalExtends(
        {
          schemaVersion: 1,
          events: [
            { kind: 'import', id: 'EXAMPLE-001', source, title: 'Altered case' },
            prior.events[1],
          ],
        },
        prior,
      );
    }).toThrow('rewrote');
  });

  test('production CLI proposes an allocation without editing its inputs', () => {
    const repository = repositoryWith(blank, JSON.stringify(empty));
    const invocation = runScenarioCli(['allocate', repository, source]);
    expect(invocation.exitCode, outputOf(invocation.stderr)).toBe(0);
    const proposal = JSON.parse(outputOf(invocation.stdout)) as ScenarioProposal;
    expect(proposal.specMarkdown).toContain('#### Scenario: [EXAMPLE-001] First case');
    expect(readFileSync(join(repository, source), 'utf8')).toBe(blank);
  });

  test('production CLI refuses an absent journal and malformed journal', () => {
    const repository = repositoryWith(blank, '{');
    const malformed = runScenarioCli(['allocate', repository, source]);
    expect(malformed.exitCode).toBe(1);
    expect(outputOf(malformed.stderr)).toContain('malformed scenario journal');
    rmSync(join(repository, 'openspec/scenario-allocations.json'));
    const absent = runScenarioCli(['allocate', repository, source]);
    expect(absent.exitCode).toBe(1);
    expect(outputOf(absent.stderr)).toContain('cannot read scenario journal');
  });

  test('production CLI validates the adopted capability against imported IDs', () => {
    const repository = join(import.meta.dir, '..', '..', '..', '..', '..', '..');
    const invocation = runScenarioCli([
      'validate',
      repository,
      'openspec/specs/project-assignment-reads/spec.md',
    ]);
    expect(invocation.exitCode, outputOf(invocation.stderr)).toBe(0);
    expect(JSON.parse(outputOf(invocation.stdout)) as unknown).toEqual({ unidentified: [] });
  });

  test('production CLI refuses an identified scenario without imported provenance', () => {
    const repository = repositoryWith(identified, JSON.stringify(empty));
    const invocation = runScenarioCli(['validate', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain('EXAMPLE-001');
  });
});
