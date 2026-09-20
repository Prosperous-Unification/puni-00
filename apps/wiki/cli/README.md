# Twilight Bureaucrat

<!-- module-index {"schemaVersion":1,"moduleId":"module.infra.tool-wiki","memberships":[{"kind":"directory-prefix","prefix":"src","exclusions":[]},{"kind":"directory-prefix","prefix":"fixtures","exclusions":[]},{"kind":"path","path":"project.json"},{"kind":"path","path":"package.json"},{"kind":"path","path":"NOTICE"},{"kind":"path","path":"tsconfig.json"},{"kind":"path","path":"tsconfig.lib.json"},{"kind":"path","path":"tsconfig.spec.json"}],"relationshipSelectors":["declarations.facts","typescript.imports","typescript.reverse-edges"],"applicableChecks":["check.wiki-cli.test","check.wiki-cli.lint-source","check.wiki-cli.typecheck"],"inapplicableSections":[],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"bin/tool-wiki-lint.sh"},{"kind":"path","path":"bin/h2puni-gate.sh"},{"kind":"path","path":".github/workflows/trusted-wiki.yml"},{"kind":"path","path":".github/workflows/ci.yml"},{"kind":"path","path":"lefthook.yml"},{"kind":"path","path":"nx.json"}],"knowledgeLimit":"Only the launcher, host gate, trusted workflow, candidate CI workflow, hook, and Nx callers needed by the bootstrap activation are declared; their surrounding directories are not claimed as reviewed."}} -->

This project owns the finite Twilight Bureaucrat ledger, trusted policy and activation logic, review
provenance, and admission coordinator. The index covers source, tests, fixtures, and project
configuration as one initial enforced tooling boundary. It does not claim exhaustive repository
coverage; the six historical pilot modules remain named review debt outside this boundary.

Version-1 record IDs, module IDs, role filenames, and `TOOL_WIKI_*`
environment variables retain their legacy spelling so existing evidence and
immutable activations keep their identity.

## Checks

The bootstrap obligation requires the uncached `twilight-bureaucrat:test`,
`twilight-bureaucrat:lint:source`, and `twilight-bureaucrat:typecheck` Nx
targets declared in [project.json](project.json). The diagnostic
`twilight-bureaucrat:lint` target cannot certify itself and is not one of
these receipts.

## Rules

`check` evaluates the registered rules over one candidate and prints a verdict. `explain` prints a
rule's registry record and, when given a rule policy, its stated mode. A rule policy is read from
outside the candidate's Git worktree so the candidate cannot select the policy that judges it. A
verdict never certifies. In slice B0, a rule that cannot be evaluated disallows the verdict in every
mode.

The package installs two commands for the same program: `twilight-bureaucrat`, which documentation
uses, and the short form `twib`.

## Trust boundary

Candidate changes can propose future validator or policy bytes, but they cannot select the
activation that evaluates the same candidate. Immutable activation packages and final integration
bindings are created and retained outside the candidate tree.

## Package release

`twilight-bureaucrat-vMAJOR.MINOR.PATCH` tags drive the protected package-release workflow. It
tests the installed tarball outside this checkout, records its SHA-256 and npm integrity, transfers
the same file between jobs, verifies it again, and runs a registry dry run before publication. The
registry name, protected environment, token and repository license are external prerequisites; the
current `UNLICENSED` package is prepared but not authorized for publication. Operational details
live in [the activation runbook](../../../docs/runbook-tool-wiki-activation.md#release).

## Experiment evidence

`experiments/export.ts` accepts a complete journal and its reconciled report, then emits canonical
JSONL observations followed by two RFC 4180-compatible tables. JSONL uses one object per trial,
session, outcome, attempt, invocation receipt, elapsed receipt, and infrastructure allocation; every
object carries `trialId`, `manifestId`, `manifestIdentity`, `corpusId`, and `acceptanceId`. The trial
observation embeds the strict manifest, so its canonical identity and pinned conditions remain
resolvable without a separate Tool Wiki installation. The outcome CSV columns are
`trial_id,outcome_id,title,status,attempt_count,defect_count`. The trial CSV columns are
`trial_id,manifest_id,manifest_identity,corpus_id,acceptance_id,concurrency,status,accepted_outcome_count,outcome_count,total_elapsed_ms,aggregate_session_elapsed_ms,currency_charges`;
charges are sorted `CURRENCY:micros` pairs separated by semicolons. The raw observations let an
independent reader recompute accepted outcomes, trial and session elapsed totals, phase totals, and
verified charges, including failed and censored work.

## Exhaustive census

`freeze-exhaustive` derives file, ancestor-directory, Nx/non-Nx project, and documentation
obligations from an immutable commit after exact inventory, classification, relationship, mapping,
model/context, protocol, and evidence-graph joins. `verify-exhaustive` independently rereads that
commit; `evaluate-exhaustive-coverage` replaces submitted population claims with the frozen full
set before audit evaluation. Evidence payload bytes remain confined to evidence-graph validation,
and any declared Gitlink that is still inaccessible is retained in the coverage report and blocks
acceptance. These commands validate a proposed sweep record. They do not run reviews, activate
policy, or certify the still-pending operational sweep.
