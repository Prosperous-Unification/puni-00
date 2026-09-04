import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import {
  allVocabularies,
  checkArtifact,
  COVERED_ARTIFACTS,
  EXCLUDED_SHAPES,
  FIXTURE_TAG,
  NEIGHBOUR_VOCABULARIES,
  report,
  scanEnumerations,
  TABLE_VOCABULARIES,
  UNCOVERED_ARTIFACT,
  wireVocabularies,
} from './wire-vocabulary';

/**
 * 2.1's "prose is descriptive only" claim, turned from a prototype run once at
 * `af05ead1` into a check that runs at every head.
 *
 * The file is in two halves. The unit half proves each rule fires and, more
 * importantly, proves the two places where 2.1's literal definitions do **not**
 * fire — those are the reason this module reads "only by commas" as "containing
 * a comma" and treats `{ a, b, c }` as a list. The repository half runs the
 * check over the three covered artifacts, which is the assertion that goes red
 * when somebody amends a field list in prose and not in the schema.
 */

const repoRoot = new URL('../../../../', import.meta.url);
const schema = JSON.parse(
  readFileSync(new URL('libs/contracts/solver/solver-wire.v1.json', repoRoot), 'utf8'),
) as unknown;

/**
 * 2.1's negative fixture, verbatim. It was live in spec.md until Sol r9
 * Critical 1, against design.md's and 2.2's `key`.
 *
 * It is held here rather than scanned out of tasks.md because tasks.md quotes it
 * **in order to** reject it; the quote there carries a `wire-fields:fixture` tag
 * so the artifact does not fail the check for containing its own counterexample.
 */
const SUPERSEDED_SLICE_SENTENCE =
  'Each slice SHALL carry its `sliceKey`, an integer `durationUnits`, `width`, ' +
  '`personId`, set-valued `poolIds`, a resolved `priorityWeight`, and a resolved `notBeforeUnits`.';

describe('the wire vocabularies come from the schema, not from prose', () => {
  it('parses the four wire sets out of solver-wire.v1.json', () => {
    const wire = wireVocabularies(schema);
    expect([...(wire.get('slice') as { members: Set<string> }).members].sort()).toEqual([
      'deadlineUnits',
      'durationUnits',
      'key',
      'notBeforeUnits',
      'personId',
      'poolIds',
      'priorityWeight',
      'width',
    ]);
    expect([...(wire.get('objective-term') as { members: Set<string> }).members].sort()).toEqual([
      'bound',
      'stageValue',
      'status',
      'value',
    ]);
    expect((wire.get('request') as { members: Set<string> }).members.has('fastHint')).toBe(true);
  });

  /**
   * The response vocabulary is a union across a conditional, and the `else`
   * branch names the same two fields as prohibitions. Taking the union is only
   * sound while the prohibited names are a subset of the required ones, so that
   * coincidence is asserted rather than relied on — a schema change that
   * prohibits a name it never requires throws instead of quietly admitting the
   * prohibition into the vocabulary.
   */
  it('reads the response as the union of every required array under it', () => {
    const wire = wireVocabularies(schema);
    expect([...(wire.get('response') as { members: Set<string> }).members].sort()).toEqual([
      'objectiveValues',
      'offsets',
      'status',
      'wireVersion',
    ]);
  });

  it('throws when a prohibited response member is not also a required one', () => {
    const forked = JSON.parse(JSON.stringify(schema)) as {
      $defs: { response: { allOf: { else: { not: { anyOf: { required: string[] }[] } } }[] } };
    };
    forked.$defs.response.allOf[0].else.not.anyOf[0] = {
      required: ['neverRequiredAnywhere'],
    };
    expect(() => wireVocabularies(forked)).toThrow(/neverRequiredAnywhere/);
  });

  /**
   * Four of the eight vocabularies have no schema because they have no table
   * yet. They are here so rule (b) can attribute a table tuple to its table:
   * without them a `projectId, inputHash, objective` run overlaps the wire sets
   * on `objective` alone and gets attributed to the wire.
   */
  it('knows the four table and DTO vocabularies that have no schema yet', () => {
    expect(TABLE_VOCABULARIES.map((v) => v.name).sort()).toEqual([
      'cache-key',
      'optimization-generation',
      'plan-read-optimization',
      'solver-queue',
    ]);
    expect(TABLE_VOCABULARIES.every((v) => v.source.includes('tasks.md'))).toBe(true);
    expect(NEIGHBOUR_VOCABULARIES.map((v) => v.name).sort()).toEqual([
      'canonical-row',
      'domain-slice',
      'fencing',
      'objective-term-name',
    ]);
    expect(allVocabularies(schema).size).toBe(15);
  });
});

describe('the watched red — 2.1 names one sentence the check SHALL reject', () => {
  it('rejects the superseded slice sentence, naming sliceKey', () => {
    const divergences = checkArtifact(
      SUPERSEDED_SLICE_SENTENCE,
      'fixture.md',
      allVocabularies(schema),
    );
    expect(divergences).toHaveLength(1);
    const only = divergences[0] as {
      rule: string;
      vocabulary: string;
      unexpected: string[];
      message: string;
    };
    expect(only.rule).toBe('b');
    expect(only.vocabulary).toBe('slice');
    expect(only.unexpected).toEqual(['sliceKey']);
    expect(only.message).toContain('sliceKey');
  });

  /**
   * The refinement this fixture forces, stated as a test rather than as a
   * comment. 2.1 defines an enumeration as identifiers "joined only by commas,
   * `and` or `/`". The gap between `sliceKey` and `durationUnits` in 2.1's own
   * fixture is `, an integer `, which is not only a comma — so under the literal
   * reading the run breaks at length one, the sentence is not an enumeration at
   * all, and the check 2.1 requires to reject it cannot see it.
   */
  it('reads "joined only by commas" as "the gap contains one", or the fixture is invisible', () => {
    const [found] = scanEnumerations(SUPERSEDED_SLICE_SENTENCE, 'fixture.md');
    expect((found as { members: string[] }).members).toEqual([
      'sliceKey',
      'durationUnits',
      'width',
      'personId',
      'poolIds',
      'priorityWeight',
      'notBeforeUnits',
    ]);
  });

  it('still stops a run at a sentence boundary, so two lists never merge', () => {
    const text = '`alpha`, `beta`, `gamma`. And separately `delta`, `epsilon`, `zeta`.';
    const found = scanEnumerations(text, 'fixture.md');
    expect(found.map((f) => f.members)).toEqual([
      ['alpha', 'beta', 'gamma'],
      ['delta', 'epsilon', 'zeta'],
    ]);
  });

  it('stops a run at a code span that is not an identifier', () => {
    const text = '`alpha`, `beta`, `integer | null`, `gamma`, `delta`';
    expect(scanEnumerations(text, 'fixture.md').map((f) => f.members)).toEqual([]);
  });
});

describe('the brace form is the one both design.md and spec.md actually use', () => {
  /**
   * The second refinement. `{ wireVersion, status, offsets, objectiveValues }`
   * is one backticked token, not a run of them, so the literal definition finds
   * no enumeration in the sentence design.md uses to describe the response —
   * which is the same form the schema's own `$comment` uses.
   */
  it('reads a single braced code span as a list of its members', () => {
    const text =
      '<!-- wire-fields:objective-term -->reports `{ value, stageValue, bound, status }` per term.';
    const found = scanEnumerations(text, 'fixture.md');
    expect(found).toHaveLength(1);
    expect((found[0] as { members: string[] }).members.sort()).toEqual([
      'bound',
      'stageValue',
      'status',
      'value',
    ]);
    expect(checkArtifact(text, 'fixture.md', allVocabularies(schema))).toEqual([]);
  });

  it('fails rule (a) with the symmetric difference when a braced list drifts', () => {
    const text =
      '<!-- wire-fields:objective-term -->reports `{ value, stageValue, bound, proof }` per term.';
    const [only] = checkArtifact(text, 'fixture.md', allVocabularies(schema)) as {
      rule: string;
      missing: string[];
      unexpected: string[];
      line: number;
    }[];
    expect(only.rule).toBe('a');
    expect(only.unexpected).toEqual(['proof']);
    expect(only.missing).toEqual(['status']);
    expect(only.line).toBe(1);
  });

  it('does not read a braced list of fewer than three, or one holding prose', () => {
    expect(scanEnumerations('`{ value, bound }`', 'f.md')).toEqual([]);
    expect(scanEnumerations('`{ value, a bound, status }`', 'f.md')).toEqual([]);
  });
});

describe('rules (b) and (c), and the tags themselves', () => {
  it('says nothing about an untagged run overlapping one vocabulary by one name', () => {
    const text = 'The row carries `objective`, `alpha` and `beta`.';
    expect(checkArtifact(text, 'f.md', allVocabularies(schema))).toEqual([]);
  });

  it('allows a partial mention — a subset is legal', () => {
    const text = 'It carries `projectId`, `inputHash` and `contractVersion`.';
    expect(checkArtifact(text, 'f.md', allVocabularies(schema))).toEqual([]);
  });

  it('rejects a run mixing a vocabulary with a name that is not in it', () => {
    const text = 'It carries `projectId`, `inputHash`, `contractVersion` and `smuggled`.';
    const [only] = checkArtifact(text, 'f.md', allVocabularies(schema)) as {
      rule: string;
      vocabulary: string;
      unexpected: string[];
    }[];
    expect(only.rule).toBe('b');
    expect(only.unexpected).toEqual(['smuggled']);
  });

  /** Rule (c): the stored shapes answer to 4.12b's codec requirement, not to the wire. */
  it('excludes the stored shapes by name', () => {
    expect(EXCLUDED_SHAPES).toEqual(['OptimizedResult', 'StoredObjectiveValue']);
    const text = 'The row stores `OptimizedResult`, `status` and `wireVersion`.';
    expect(scanEnumerations(text, 'f.md')).toEqual([]);
  });

  it('fails a tag that names no known vocabulary, so a typo cannot disable rule (a)', () => {
    const text = '<!-- wire-fields:slize -->carries `key`, `width` and `personId`.';
    const divergences = checkArtifact(text, 'f.md', allVocabularies(schema)) as {
      rule: string;
      vocabulary: string;
    }[];
    expect(divergences.some((d) => d.rule === 'tag' && d.vocabulary === 'slize')).toBe(true);
  });

  /**
   * Without this, tasks.md fails the check for quoting its own counterexample —
   * which is the artifact being correct, not the artifact drifting.
   */
  it('ignores a span tagged as a quoted negative fixture', () => {
    const text = `<!-- wire-fields:${FIXTURE_TAG} -->${SUPERSEDED_SLICE_SENTENCE}`;
    expect(scanEnumerations(text, 'f.md')).toEqual([]);
    expect(checkArtifact(text, 'f.md', allVocabularies(schema))).toEqual([]);
  });

  it('does not read a tag written inside a code span as a tag', () => {
    const text = 'A span opens with `<!-- wire-fields:<set> -->` and runs to the sentence end.';
    expect(checkArtifact(text, 'f.md', allVocabularies(schema))).toEqual([]);
  });
});

describe('the repository check — three of four descriptive artifacts', () => {
  const vocabularies = allVocabularies(schema);

  it.each(COVERED_ARTIFACTS.map((f) => [f]))('%s: every tagged span equals its set', (file) => {
    const text = readFileSync(new URL(file, repoRoot), 'utf8');
    const divergences = checkArtifact(text, file, vocabularies, ['a']);
    expect(report(divergences, [file as string])).toContain('no divergent enumeration');
  });

  /**
   * Rule (b) is not the gate, and this pins why rather than leaving it to the
   * module header. It reported seventeen sentences while six tuples were
   * unnamed; run 23 named seven of them from their defining artifacts and
   * measured **twelve**, so five were attribution failures and are now gone.
   *
   * The twelve that remain are one finding: each is a run spanning two
   * vocabularies that are BOTH named now, and `attribute` picks one winner, so
   * no further naming can lower this number. Only 2.1 can — by rewriting those
   * sentences, or by taking rule (b)'s subset test against the union of the
   * vocabularies a run overlaps. See the module header.
   *
   * The number is asserted so it can only move deliberately. Naming a tuple
   * a sentence draws from ALONE SHALL lower it; a new mixed sentence SHALL
   * raise it. Either way somebody reads this comment before editing the number,
   * which is the whole point of writing it down instead of filtering it out.
   */
  it('records what rule (b) costs while its mixed runs are unresolved', () => {
    const ruleB = COVERED_ARTIFACTS.flatMap((file) =>
      checkArtifact(readFileSync(new URL(file, repoRoot), 'utf8'), file, vocabularies, ['b']),
    );
    expect(ruleB).toHaveLength(12);
    expect(ruleB.every((d) => d.rule === 'b')).toBe(true);
  });

  /**
   * The five naming closed, named individually so a regression says which.
   * Each was a sentence drawn from one tuple that had no name, attributed to
   * whichever named tuple it happened to overlap.
   */
  it.each([
    [COVERED_ARTIFACTS[0], 64],
    [COVERED_ARTIFACTS[1], 62],
    [COVERED_ARTIFACTS[1], 69],
    [COVERED_ARTIFACTS[2], 207],
    [COVERED_ARTIFACTS[2], 257],
  ])('%s line %s no longer diverges once its tuple is named', (file, line) => {
    const divergences = checkArtifact(
      readFileSync(new URL(file, repoRoot), 'utf8'),
      file,
      vocabularies,
      ['b'],
    );
    expect(divergences.map((d) => d.line)).not.toContain(line);
  });

  /**
   * The three schema-parsed additions are parsed, not restated — the same rule
   * the four wire sets already follow. A literal here would be 2.1's own defect
   * in a new place.
   */
  it('parses objectiveValues and both status enums out of the schema', () => {
    const parsed = wireVocabularies(schema);
    expect([...(parsed.get('objective-values')?.members ?? [])].sort()).toEqual([
      'makespan',
      'movement',
      'priority',
    ]);
    expect([...(parsed.get('response-status')?.members ?? [])].sort()).toEqual([
      'feasible',
      'infeasible',
      'unknown',
    ]);
    expect([...(parsed.get('objective-term-status')?.members ?? [])].sort()).toEqual([
      'feasible',
      'optimal',
      'unknown',
    ]);
  });

  /**
   * The union reading 2.1 offers as the alternative to rewriting twelve
   * sentences, measured rather than argued: it takes the count from 12 to 9.
   * Not to zero, so it does not by itself let rule (b) gate.
   */
  it('measures what the union reading of rule (b) would cost', () => {
    const union = COVERED_ARTIFACTS.flatMap((file) =>
      checkArtifact(
        readFileSync(new URL(file, repoRoot), 'utf8'),
        file,
        vocabularies,
        ['b'],
        'union',
      ),
    );
    expect(union).toHaveLength(9);
  });

  /**
   * 2.1's falsifier for the union reading, as a test rather than a sentence:
   * a real drift whose stale name is a legitimate member of some OTHER named
   * tuple. `resultJson` is a cache column, and a response enumeration that
   * names it is drift.
   *
   * The naive union admits it, because `cache-key` also carries `status` and so
   * clears a bare two-name overlap **on the strength of the drifting name
   * itself**. That is why admission excludes the member being judged: a
   * vocabulary must contribute `MIN_OVERLAP` names BESIDES it. Delete the `- 1`
   * in `checkArtifact` and this test goes green while the artifact is wrong,
   * which is the whole reason it is here.
   */
  it('catches drift into another named tuple under the union reading', () => {
    const drift = 'The response carries `wireVersion`, `status`, `offsets` and `resultJson`.';
    for (const mode of ['best', 'union'] as const) {
      const divergences = checkArtifact(drift, 'f.md', vocabularies, ['b'], mode);
      expect(divergences).toHaveLength(1);
      expect((divergences[0] as { unexpected: string[] }).unexpected).toEqual(['resultJson']);
    }
  });

  /** 2.1's watched red survives the union reading; `sliceKey` is nobody's member. */
  it('still rejects the superseded slice sentence under the union reading', () => {
    const divergences = checkArtifact(
      SUPERSEDED_SLICE_SENTENCE,
      'fixture.md',
      vocabularies,
      ['b'],
      'union',
    );
    expect(divergences).toHaveLength(1);
    expect((divergences[0] as { unexpected: string[] }).unexpected).toEqual(['sliceKey']);
  });

  /** Every added tuple says where it was read from; a nameless source is memory. */
  it('gives every neighbour vocabulary a source that names an artifact', () => {
    for (const vocabulary of NEIGHBOUR_VOCABULARIES) {
      expect(vocabulary.members.size).toBeGreaterThanOrEqual(3);
      expect(vocabulary.source).toMatch(/\.ts:\d|\.md|\.json/);
    }
  });

  /**
   * The one thing 2.1 asks the reporter to do on a pass as well as a failure:
   * name the artifact it did not read, so "3 of 4" is never read as "4 of 4".
   */
  it('names the uncovered artifact whether it passes or fails', () => {
    expect(report([], [...COVERED_ARTIFACTS])).toContain(UNCOVERED_ARTIFACT);
    expect(
      report(
        [
          {
            file: 'f.md',
            line: 1,
            rule: 'a',
            vocabulary: 'slice',
            missing: [],
            unexpected: ['x'],
            message: 'm',
          },
        ],
        [...COVERED_ARTIFACTS],
      ),
    ).toContain(UNCOVERED_ARTIFACT);
    expect(report([], [...COVERED_ARTIFACTS])).toContain('3 of 4');
  });
});
