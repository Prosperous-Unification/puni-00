## Why

The repository's rules are judged in many places, so an agent cannot ask one tool whether an artifact is allowed. A new rule also has no single home or stated mode.

## What Changes

Twilight Burokrat gains `check` and `explain`. A rule's mode comes from the consumer's trusted policy rather than code, and four checks the package already performs become registered rules with stable identifiers. A rule that could not be evaluated disallows the verdict in every mode. The sixteen existing routes remain unchanged, and a verdict never certifies.

## Non-Goals

This change adds no new rule family, template registry, candidate record for Twilight Dash, certification, or `ratchet` mode. It does not change how any existing check signals a violation.

## Constraints

A candidate cannot select the policy that judges it, and containment is measured from the resolved Git worktree root. `lint-local` and `lint-ci` keep their arguments, report shape, and certification behavior. Because no check distinguishes a violation from an unusable input by type, only the two checks with structured output can report debt in this slice.

## Capabilities

### New Capabilities

- `burokrat-rules`: Registers existing checks as rules and reports policy-governed explanations and verdicts.

### Modified Capabilities

None.

## Domain Terms

Rule, finding, verdict, rule mode, and rule policy. Glossary entries are deferred because the Twilight glossary already defines Finding and Verdict for the runtime; reconciling those meanings is a separate documentation task.

## Decisions Recorded

None.

## Impact

Only the `twilight-burokrat` project changes.
