import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import {
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

  test('continues the ordinal from 999 to 1000 and validates its provenance', () => {
    const journal: ScenarioJournal = {
      schemaVersion: 1,
      events: [{ kind: 'import', id: 'EXAMPLE-999', source, title: 'Last three digit case' }],
    };
    const proposal = proposeScenarioAllocation(
      journal,
      source,
      '#### Scenario: [EXAMPLE-999] Last three digit case\n#### Scenario: Next case\n',
    );
    expect(proposal.events).toEqual([
      { kind: 'allocate', id: 'EXAMPLE-1000', source, title: 'Next case' },
    ]);
    expect(validateScenarioProvenance(proposal.journal, source, proposal.specMarkdown)).toEqual([]);
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

  test('production CLI proposes an allocation without editing its inputs', () => {
    const repository = repositoryWith(blank, JSON.stringify(empty));
    const invocation = runScenarioCli(['allocate', repository, source]);
    expect(invocation.exitCode, outputOf(invocation.stderr)).toBe(0);
    const proposal = JSON.parse(outputOf(invocation.stdout)) as ScenarioProposal;
    expect(proposal.specMarkdown).toContain('#### Scenario: [EXAMPLE-001] First case');
    expect(readFileSync(join(repository, source), 'utf8')).toBe(blank);
  });

  test('production CLI continues allocation past identifier 999', () => {
    const journal: ScenarioJournal = {
      schemaVersion: 1,
      events: [{ kind: 'import', id: 'EXAMPLE-999', source, title: 'Last three digit case' }],
    };
    const repository = repositoryWith(
      '#### Scenario: [EXAMPLE-999] Last three digit case\n#### Scenario: Next case\n',
      JSON.stringify(journal),
    );
    const invocation = runScenarioCli(['allocate', repository, source]);
    expect(invocation.exitCode, outputOf(invocation.stderr)).toBe(0);
    const proposal = JSON.parse(outputOf(invocation.stdout)) as ScenarioProposal;
    expect(proposal.events[0]?.id).toBe('EXAMPLE-1000');
  });

  test('production CLI records a predecessor after identifier 1000', () => {
    const journal: ScenarioJournal = {
      schemaVersion: 1,
      events: [{ kind: 'import', id: 'EXAMPLE-1000', source, title: 'Prior case' }],
    };
    const repository = repositoryWith(
      '#### Scenario: [EXAMPLE-1000] Prior case\n#### Scenario: Split case\n',
      JSON.stringify(journal),
    );
    const invocation = runScenarioCli([
      'allocate',
      repository,
      source,
      '--predecessor',
      'EXAMPLE-1000',
    ]);
    expect(invocation.exitCode, outputOf(invocation.stderr)).toBe(0);
    const proposal = JSON.parse(outputOf(invocation.stdout)) as ScenarioProposal;
    expect(proposal.events).toEqual([
      {
        kind: 'split',
        id: 'EXAMPLE-1001',
        source,
        title: 'Split case',
        predecessor: 'EXAMPLE-1000',
      },
    ]);
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

  test('production CLI refuses one identifier on two headings during import and validation', () => {
    const duplicated = `${identified}#### Scenario: [EXAMPLE-001] First case\n`;
    const repository = repositoryWith(
      duplicated,
      JSON.stringify(importScenarioIdentifiers(empty, source, identified)),
    );
    const validated = runScenarioCli(['validate', repository, source]);
    expect(validated.exitCode).toBe(1);
    expect(outputOf(validated.stderr)).toContain('duplicate scenario identifier: EXAMPLE-001');

    const imported = runScenarioCli(['import', repository, source]);
    expect(imported.exitCode).toBe(1);
    expect(outputOf(imported.stderr)).toContain('duplicate scenario identifier: EXAMPLE-001');
  });

  test('production CLI refuses a source outside an OpenSpec spec.md path', () => {
    const repository = repositoryWith(identified, JSON.stringify(empty));
    const invocation = runScenarioCli(['import', repository, 'openspec/specs/example/not-spec.md']);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain('openspec/specs/example/not-spec.md');
    expect(outputOf(invocation.stderr)).not.toContain('cannot read scenario specification');
  });

  test('direct importer refuses a source outside an OpenSpec spec.md path', () => {
    expect(() =>
      importScenarioIdentifiers(empty, 'openspec/specs/example/not-spec.md', identified),
    ).toThrow('scenario source must be an OpenSpec spec.md path');
  });

  test('direct importer refuses a malformed capability in an OpenSpec path', () => {
    expect(() =>
      importScenarioIdentifiers(empty, 'openspec/specs/Bad/spec.md', identified),
    ).toThrow('scenario source has no capability');
  });

  test('production CLI refuses a schema-valid journal whose events reuse an ID', () => {
    const journal: ScenarioJournal = {
      schemaVersion: 1,
      events: [
        { kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' },
        { kind: 'allocate', id: 'EXAMPLE-001', source, title: 'Second case' },
      ],
    };
    const repository = repositoryWith(identified, JSON.stringify(journal));
    const invocation = runScenarioCli(['validate', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain('malformed scenario journal');
    expect(outputOf(invocation.stderr)).toContain(
      'scenario identifier was already reserved: EXAMPLE-001',
    );
  });

  test.each([
    ['EXAMPLE-DETAIL-001', source],
    ['EXAMPLE-001', 'openspec/specs/example-detail/spec.md'],
  ])('production CLI refuses identifier %s in namespace %s', (id, eventSource) => {
    const journal: ScenarioJournal = {
      schemaVersion: 1,
      events: [{ kind: 'import', id, source: eventSource, title: 'First case' }],
    };
    const repository = repositoryWith(identified, JSON.stringify(journal));
    const invocation = runScenarioCli(['validate', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain(
      `scenario identifier does not match ${eventSource}`,
    );
  });

  test('production CLI refuses importing an ID already assigned another title', () => {
    const journal = importScenarioIdentifiers(empty, source, identified);
    const repository = repositoryWith(
      '### Requirement: example\n#### Scenario: [EXAMPLE-001] Other case\n',
      JSON.stringify(journal),
    );
    const invocation = runScenarioCli(['import', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain(
      'scenario identifier already reserved elsewhere: EXAMPLE-001',
    );
  });

  test.each([
    [
      'foreign source',
      {
        schemaVersion: 1,
        events: [
          {
            kind: 'import',
            id: 'EXAMPLE-001',
            source: 'openspec/changes/example-change/specs/example/spec.md',
            title: 'First case',
          },
        ],
      },
    ],
    [
      'retired ID',
      {
        schemaVersion: 1,
        events: [
          { kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' },
          { kind: 'retire', id: 'EXAMPLE-001' },
        ],
      },
    ],
  ] as const)('production CLI import refuses an ID with %s', (_case, journal) => {
    const repository = repositoryWith(identified, JSON.stringify(journal));
    const invocation = runScenarioCli(['import', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain('scenario identifier already reserved elsewhere');
  });

  test.each([
    [
      'foreign source',
      {
        schemaVersion: 1,
        events: [
          {
            kind: 'import',
            id: 'EXAMPLE-001',
            source: 'openspec/changes/example-change/specs/example/spec.md',
            title: 'First case',
          },
        ],
      },
    ],
    [
      'different title',
      {
        schemaVersion: 1,
        events: [{ kind: 'import', id: 'EXAMPLE-001', source, title: 'Other case' }],
      },
    ],
    [
      'retired ID',
      {
        schemaVersion: 1,
        events: [
          { kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' },
          { kind: 'retire', id: 'EXAMPLE-001' },
        ],
      },
    ],
  ] as const)('production CLI validate refuses an ID with %s', (_case, journal) => {
    const repository = repositoryWith(identified, JSON.stringify(journal));
    const invocation = runScenarioCli(['validate', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain(
      'scenario identifier lacks current allocator provenance',
    );
  });

  test('production CLI refuses an unknown predecessor', () => {
    const repository = repositoryWith(blank, JSON.stringify(empty));
    const invocation = runScenarioCli([
      'allocate',
      repository,
      source,
      '--predecessor',
      'EXAMPLE-999',
    ]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain(
      'unknown or inactive scenario predecessor: EXAMPLE-999',
    );
  });

  test.each([
    ['unsupported action', 'destroy', []],
    ['predecessor on import', 'import', ['--predecessor', 'EXAMPLE-001']],
    ['extra argument on validate', 'validate', ['extra']],
  ])('production CLI refuses %s', (_label, action, suffix) => {
    const repository = repositoryWith(blank, JSON.stringify(empty));
    const invocation = runScenarioCli([action, repository, source, ...suffix]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain('usage: twilight-burokrat scenario');
  });

  test('production CLI refuses allocation when every heading already has an ID', () => {
    const journal = importScenarioIdentifiers(empty, source, identified);
    const repository = repositoryWith(identified, JSON.stringify(journal));
    const invocation = runScenarioCli(['allocate', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain(`no unidentified scenarios in ${source}`);
  });

  test('production CLI refuses an absent journal with ENOENT', () => {
    const repository = repositoryWith(blank, JSON.stringify(empty));
    const journalPath = join(repository, 'openspec/scenario-allocations.json');
    rmSync(journalPath);
    const absent = runScenarioCli(['allocate', repository, source]);
    expect(absent.exitCode).toBe(1);
    expect(outputOf(absent.stderr)).toContain('ENOENT');
  });

  test('production CLI refuses an unreadable journal path with EISDIR', () => {
    const repository = repositoryWith(blank, JSON.stringify(empty));
    const journalPath = join(repository, 'openspec/scenario-allocations.json');
    rmSync(journalPath);
    mkdirSync(journalPath);
    const unreadable = runScenarioCli(['allocate', repository, source]);
    expect(unreadable.exitCode).toBe(1);
    expect(outputOf(unreadable.stderr)).toContain('EISDIR');
  });

  test('production CLI allocates an ordinary constructor title without a predecessor', () => {
    const repository = repositoryWith('#### Scenario: constructor\n', JSON.stringify(empty));
    const invocation = runScenarioCli(['allocate', repository, source]);
    expect(invocation.exitCode, outputOf(invocation.stderr)).toBe(0);
    const proposal = JSON.parse(outputOf(invocation.stdout)) as ScenarioProposal;
    expect(proposal.events).toEqual([
      { kind: 'allocate', id: 'EXAMPLE-001', source, title: 'constructor' },
    ]);
  });

  test.each(['import', 'validate'])(
    'production CLI %s refuses a specification with no scenario heading',
    (action) => {
      const repository = repositoryWith('### Requirement: example\n', JSON.stringify(empty));
      const invocation = runScenarioCli([action, repository, source]);
      expect(invocation.exitCode).toBe(1);
      expect(outputOf(invocation.stderr)).toContain('specification has no scenario headings');
    },
  );

  test('production CLI refuses a journal event with a malformed scenario title', () => {
    const journal: ScenarioJournal = {
      schemaVersion: 1,
      events: [{ kind: 'import', id: 'EXAMPLE-001', source, title: 'First\ncase' }],
    };
    const repository = repositoryWith(identified, JSON.stringify(journal));
    const invocation = runScenarioCli(['validate', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain('malformed scenario journal');
    expect(outputOf(invocation.stderr)).toContain('scenario identifier does not match');
  });

  test.each([
    [
      'inactive',
      'EXAMPLE-001',
      [
        { kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' },
        { kind: 'retire', id: 'EXAMPLE-001' },
      ],
    ],
    [
      'foreign',
      'EXAMPLE-DETAIL-001',
      [
        {
          kind: 'import',
          id: 'EXAMPLE-DETAIL-001',
          source: 'openspec/specs/example-detail/spec.md',
          title: 'First case',
        },
      ],
    ],
  ] as const)('production CLI refuses %s predecessor', (_kind, predecessor, events) => {
    const journal: ScenarioJournal = { schemaVersion: 1, events };
    const repository = repositoryWith(blank, JSON.stringify(journal));
    const invocation = runScenarioCli([
      'allocate',
      repository,
      source,
      '--predecessor',
      predecessor,
    ]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain(
      `unknown or inactive scenario predecessor: ${predecessor}`,
    );
  });

  test('production CLI refuses a rename that names the wrong prior title', () => {
    const journal: ScenarioJournal = {
      schemaVersion: 1,
      events: [
        { kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' },
        {
          kind: 'rename',
          id: 'EXAMPLE-001',
          priorTitle: 'Other case',
          title: 'Renamed case',
          priorRevision: 'abc123',
        },
      ],
    };
    const repository = repositoryWith(identified, JSON.stringify(journal));
    const invocation = runScenarioCli(['validate', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain('scenario rename requires exact prior title');
  });

  test('production CLI refuses a second retirement of one scenario', () => {
    const journal: ScenarioJournal = {
      schemaVersion: 1,
      events: [
        { kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' },
        { kind: 'retire', id: 'EXAMPLE-001' },
        { kind: 'retire', id: 'EXAMPLE-001' },
      ],
    };
    const repository = repositoryWith(identified, JSON.stringify(journal));
    const invocation = runScenarioCli(['validate', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain('unknown or inactive scenario: EXAMPLE-001');
  });

  test.each([
    ['wrong version', { schemaVersion: 2, events: [] }],
    [
      'wrong event field type',
      { schemaVersion: 1, events: [{ kind: 'import', id: 'EXAMPLE-001', source, title: 42 }] },
    ],
  ])('production CLI refuses journal schema with %s', (_kind, journal) => {
    const repository = repositoryWith(identified, JSON.stringify(journal));
    const invocation = runScenarioCli(['validate', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain('malformed scenario journal');
  });

  test('production CLI refuses journal bytes that are invalid UTF-8', () => {
    const repository = repositoryWith(identified, JSON.stringify(empty));
    writeFileSync(join(repository, 'openspec/scenario-allocations.json'), Buffer.from([0xff]));
    const invocation = runScenarioCli(['validate', repository, source]);
    expect(invocation.exitCode).toBe(1);
    expect(outputOf(invocation.stderr)).toContain('cannot read scenario journal');
    expect(outputOf(invocation.stderr)).toContain('encoded data was not valid');
  });
});
