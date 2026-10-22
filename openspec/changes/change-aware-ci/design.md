## Context

PR #621 changes eleven Markdown files yet Nx selects five project test targets. Nx collects global inputs across all targets before propagating affected projects; filtering for targets afterward does not undo this. Burokrat lint and devsync tests consume the whole tree. The measured Twilight test phase is 53m34s. Native Bun 1.4.2 change selection misses fixture, subprocess, deletion and rename failures in committed probes.

## Goals / Non-Goals

Provide fast, explainable PR feedback while preserving failures. Full event and host gates remain unchanged. No sharding, concurrency increase, result cache, blanket Markdown skip or upstream native selector assumption.

## Decisions

Use one explicit selection boundary over the existing validated merge comparison. Return a typed plan and reasons; consumers validate it before skipping work. Start with reviewed prose namespaces (findings, planning and ADR Markdown, assessment scope) rather than every Markdown file. Exclude behavior-bearing docs and authority changes; supported docs index membership edits receive actual index validation. Do not claim a named full validator test ran when only docs validation ran.

Extract actual-tree document checks from devsync's regression fixture suite into a reusable validator and CLI. Keep its existing behavioral tests as consumers of that validator. CI uses the validator directly; source changes to the validator still select its regression tests.

For code, distinguish runtime target inputs from lint-only inputs while retaining the pinned Nx dependency semantics. Select all transitive module consumers. Explicitly retain whole-module coverage for dynamic inputs and uncertain file impact. The first file-selection opt-in is website-contracts: a reviewed pure module with local static imports and explicitly allowed hash functions. Its additional test:selected target follows import/re-export consumers and tests sharing local dependencies, retains the canonical trailing TypeScript check, and verifies nonempty executed cases through the existing JUnit reader. New/deleted/renamed files, changed import declarations, external/configuration inputs, unsupported capabilities or uncovered source changes retain the complete module suite. Other modules retain their full suites. Canonical full test commands and their externally pinned identities stay unchanged. Discovery and execution use literal paths and refuse missing selections.

Runtime projection retains both normal and continuous cross-project task edges, including explicit dependsOn projects with no source-import edge. PR workspace lint runs independently: native affected lint includes Dash and excludes Burokrat's inactive global authority target; the existing Burokrat source-lint command runs explicitly for every code plan. Twilight runtime selection cannot suppress either active source linter.

Active OpenSpec change packets remain code-scope inputs. Regular added or modified `.openspec.yaml`, proposal, design, tasks, verify and capability delta-spec files are recognized workflow inputs for unknown-impact detection. Their complete paths still feed Nx affected selection, preserving explicit and universal runtime consumers. Required workspace OpenSpec and security checks run even when no runtime module consumes a packet. Recognition does not claim that OpenSpec semantically validates every artifact: the pinned validator reads change metadata, delta specs and schema-tracked tasks. Archive paths, unknown siblings, configuration, hooks, scripts and fixtures receive no packet exemption. Deletions, renames and unsupported object modes retain all runtime modules.

Integrate a docs job and scope-aware code jobs with the existing gate aggregate. Keep formatting and security checks in both paths. The browser scope consumes the same explained prose verdict. Preserve full-event branches and exact merge-base revalidation.

## Risks / Trade-offs

Static imports miss filesystem and child-process inputs; narrow execution therefore requires declared coverage, otherwise module tests run. Reviewed prose classification is intentionally narrower than all docs. Full main and merge-group runs remain expensive. Central CLI imports may legitimately select many tests; report that instead of claiming a reduction. No live external policy activation is performed.

## Migration Plan

Land the selector and validator with failing-path proofs, then wire PR jobs to their plan. Re-run the actual assessment diff as a regression case, a bad-doc case, source/fixture/delete/rename cases and the workflow reducer fault matrix. Compare selected work and measured hosted duration. Keep default full commands available throughout.
