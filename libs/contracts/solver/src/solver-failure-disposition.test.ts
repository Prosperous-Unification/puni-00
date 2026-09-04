import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import { SOLVER_PARSE_FAILURES } from './parse-solver-response';
import { SOLVER_PREFLIGHT_FAILURES } from './solver-preflight';
import { SOLVER_REVALIDATION_FAILURES } from './revalidate-solver-result';
import {
  SOLVER_FAILURE_DISPOSITIONS,
  SOLVER_FAILURE_REASONS,
  dispositionOfParseFailure,
  dispositionOfPreflightFailure,
  dispositionOfRevalidationFailure,
} from './solver-failure-disposition';

/**
 * 2.5's remaining clause: "each violation in 2.4 is rejected as
 * **invalid-output**". The violations themselves are cased one-by-one in
 * `revalidate-solver-result.test.ts`; what was untestable until now is the
 * *disposition*, because `invalid-output` existed only in doc comments.
 *
 * The vocabulary is not asserted against a second hand-written list here. It is
 * read out of `design.md`'s CHECK constraint, which is the text the migration
 * will carry, so this file cannot agree with a constant that has drifted from
 * the column that stores it — the same non-circularity argument the golden
 * corpus makes for the wire schema.
 */

const DESIGN = readFileSync(
  new URL('../../../../openspec/changes/dual-optimized-scheduler/design.md', import.meta.url),
  'utf8',
);

/** The `failureReason` CHECK constraint's own list, in its own order. */
const checkConstraintVocabulary = (): readonly string[] => {
  const match = DESIGN.match(/failure_reason IS NULL OR failure_reason IN \(([^)]*)\)/);
  if (!match) throw new Error('design.md no longer declares a failure_reason CHECK constraint');
  return match[1].split(',').map((token) => token.trim().replace(/^'|'$/g, ''));
};

describe('the failure-reason vocabulary is the column the row is written into', () => {
  it('matches design.md CHECK constraint exactly, in order', () => {
    expect([...SOLVER_FAILURE_REASONS]).toEqual([...checkConstraintVocabulary()]);
  });

  it('carries no duplicate', () => {
    expect(new Set(SOLVER_FAILURE_REASONS).size).toBe(SOLVER_FAILURE_REASONS.length);
  });
});

describe('every failure this directory can produce has exactly one disposition', () => {
  it('covers all fifteen tokens across the three seams', () => {
    expect(SOLVER_FAILURE_DISPOSITIONS).toHaveLength(
      SOLVER_PARSE_FAILURES.length +
        SOLVER_PREFLIGHT_FAILURES.length +
        SOLVER_REVALIDATION_FAILURES.length,
    );
  });

  it('maps every one of them into the CHECK constraint vocabulary', () => {
    const admitted = new Set<string>(SOLVER_FAILURE_REASONS);
    for (const { seam, failure, reason } of SOLVER_FAILURE_DISPOSITIONS) {
      expect(admitted.has(reason), `${seam}/${failure} -> ${reason}`).toBe(true);
    }
  });
});

describe('framing is always invalid-output', () => {
  it('gives every one of the four the same disposition', () => {
    for (const failure of SOLVER_PARSE_FAILURES) {
      expect(dispositionOfParseFailure(failure)).toBe('invalid-output');
    }
  });
});

describe('re-validation is invalid-output except on our own side of the seam', () => {
  it('rejects every solver-authored violation as invalid-output', () => {
    for (const failure of SOLVER_REVALIDATION_FAILURES) {
      if (failure === 'malformed-request') continue;
      expect(dispositionOfRevalidationFailure(failure), failure).toBe('invalid-output');
    }
  });

  it('sends an unjudgeable request to internal-error, not to the solver', () => {
    expect(dispositionOfRevalidationFailure('malformed-request')).toBe('internal-error');
  });

  it('leaves exactly one code on our side, so the rule stays a rule', () => {
    const ours = SOLVER_REVALIDATION_FAILURES.filter(
      (failure) => dispositionOfRevalidationFailure(failure) !== 'invalid-output',
    );
    expect(ours).toEqual(['malformed-request']);
  });
});

describe('pre-spawn failures are the recorded reason verbatim', () => {
  it('passes both tokens through unchanged', () => {
    for (const failure of SOLVER_PREFLIGHT_FAILURES) {
      expect(dispositionOfPreflightFailure(failure)).toBe(failure);
    }
  });
});

/**
 * The reason this module exists rather than a switch at the call site. Both
 * assertions read `objective-overflow`; they disagree, and a mapping that
 * matched the token to the column's vocabulary would pass the first and fail
 * the second while looking correct in both places.
 *
 * WATCHED RED: change `dispositionOfRevalidationFailure` to pass
 * `objective-overflow` through the way the preflight's does — the single most
 * plausible edit, since the token is a legal `failureReason` — and only the
 * second assertion here fails. Nothing else in the suite notices: the
 * re-validator's own tests assert the *diagnosis* token, which is unchanged.
 */
describe('the same token means opposite things on either side of the spawn', () => {
  it('records objective-overflow before the spawn and invalid-output after it', () => {
    expect(dispositionOfPreflightFailure('objective-overflow')).toBe('objective-overflow');
    expect(dispositionOfRevalidationFailure('objective-overflow')).toBe('invalid-output');
  });

  it('is the only token two seams share, so nothing else needs the pair', () => {
    const counts = new Map<string, number>();
    for (const { failure } of SOLVER_FAILURE_DISPOSITIONS) {
      counts.set(failure, (counts.get(failure) ?? 0) + 1);
    }
    const shared = [...counts.entries()].filter(([, n]) => n > 1).map(([token]) => token);
    expect(shared).toEqual(['objective-overflow']);
  });
});
