# Agent-scalable LLM wiki

Status: proposed future work. This document records an approved direction, not
authorization to implement it.

## Outcome

Turn the repository's existing knowledge into a recursive, maintained map that
lets more agents produce more independently verified changes. A new agent starts
with a small index, reaches one relevant module without scanning the repository,
receives an enforceable write boundary, and can determine the repository-visible
consequences of changing any file in that module.

The scaling target is useful output, not edits or review reports:

```text
Q(N) = verified merge-ready task slices completed per hour by N agents

Q(2) >= 1.6 * Q(1)
Q(4) >= 3.2 * Q(1)
Q(8) >= 6.4 * Q(1)
```

This is at least 80% linear efficiency through eight concurrent agents while an
independent task frontier exists. Shared migrations, public contracts and root
configuration remain explicitly serial. Compatible completed slices are batched
so the repository gate does not erase the parallel gain.

## Source idea and repository fit

The source is
[ry's 2026-08-25 revision of the LLM-wiki pattern](https://gist.github.com/ry/c56dfa7b1b90eeff2d8d0127e45ae3bb/revisions?short_path=4c66555#diff-4c66555dd402cc5d67a52a326ac73c0e13d09c5e3e6e2e32967808d23a576025):

- `README.md` is the index;
- indexes use standard relative Markdown links;
- a coherent cluster is promoted into a subdirectory with its own `README.md`;
- Git history is the chronological log, so there is no `docs/log.md`.

This repository already has the three source layers:

- raw authority: code, tests, OpenSpec changes, configuration and Git history;
- compiled knowledge: `CONTEXT.md`, ADRs, runbooks, JSDoc and module READMEs;
- schema: `AGENTS.md` and its linked conventions.

The work adds recursive navigation, an exhaustive review protocol, freshness
evidence and temporary module ownership. It does not create a parallel `wiki/`
copy of code knowledge.

## Non-goals

- No embedding database, RAG service or third-party search dependency.
- No page-per-source-file documentation layer.
- No permanent assignment of a module to a particular agent.
- No claim about consumers that are neither represented nor declared in this
  repository.
- No automated behavioral correction by thousands of concurrent file reviewers.
- No implementation as part of the commit that introduces this plan.

## Assumptions

1. “Every file” means every entry returned by `git ls-tree -r HEAD` at a pinned
   base commit. Symlinks count as entries and are never followed.
2. “100% non-breaking” means every repository-visible relationship is current,
   applicable checks pass, and known external consumers are disclosed. An
   unregistered external consumer cannot be proved from repository evidence.
3. A fresh file reviewer receives the review protocol, pinned commit and one
   path, but no conversation history, parent-agent conclusions or directory
   summary before its cold-read judgment.
4. File-level isolation is for comprehension and review. The smallest
   independently testable module or change slice is the write-ownership unit.
5. Documentation corrections may land directly. A finding that changes
   observable behavior, a contract, deployment safety or architecture receives
   its own OpenSpec change before implementation.

## Knowledge topology

Navigation follows one direction:

```text
AGENTS.md (automatically loaded rules)
  -> LLM_README.md (task router, at most 150 lines)
    -> tree or project README.md
      -> module README.md
        -> source, test, configuration or detailed document
```

`AGENTS.md` must stop instructing an agent to load `LLM_README.md` before the
already-loaded rules. It states the traversal once. `LLM_README.md` contains only
orientation needed before a task is known: the product map, canonical gate,
current landmines, open findings and links into the recursive indexes.

### When a directory gets an index

A directory owns a `README.md` when it is:

- an Nx project root;
- a tree root outside an Nx project, such as `docs/`, `deploy/` or `openspec/`;
- a directory containing at least two non-test source files;
- a directory containing at least two qualifying child modules; or
- a boundary that owns a cross-file invariant not correctly housed elsewhere.

A directory does not get a README when it:

- contains one child that its nearest indexed ancestor can name directly;
- is test-only, fixture-only or vendored and its parent can describe the set;
- is an archived OpenSpec change whose `proposal.md` already provides its index;
- is `.github/workflows`; or
- would produce fewer than eight content lines after applying the required
  template.

An index with more than forty direct entries must group them or promote coherent
clusters into indexed subdirectories.

### Index contents

Every recursive README has:

1. one heading and one purpose paragraph;
2. `## Contents`, covering direct files and qualifying child modules in both
   directions with relative links and one-line roles;
3. `## Relationships`, naming consumed and exposed interfaces rather than
   repeating implementation;
4. `## Invariants`, containing only facts that span at least two paths and
   therefore belong to no one symbol;
5. `## Checks`, naming existing exact commands that verify this boundary;
6. `## Known external consumers` for an app or deployable boundary.

Indexes contain no dates, historical ledger, implementation walkthrough or
symbol-level behavior. Symbol knowledge remains in names and JSDoc. Cross-project
decisions remain in ADRs or runbooks. Domain vocabulary remains in `CONTEXT.md`.

For Nx project roots, machine-readable frontmatter additionally declares:

```yaml
module: domain
writes:
  - libs/domain/**
publicInterfaces:
  - libs/domain/src/index.ts
dependsOn:
  - contracts
checks:
  - bunx nx run domain:test
conflictGroup: scheduling-domain
```

The wiki lint checks frontmatter against `project.json`, Nx graph edges and the
Git tree. Nested agent modules use the same fields. Root indexes link to child
metadata; they do not copy it.

## Review inventory

The pinned starting point measured by Claude Fable was 2,379 tracked entries and
782 directories at commit `619b714b`. Counts are observations, not constants;
the implementation pins its own base SHA and derives the inventory again.

Each entry is classified before review:

| Class       | Examples                                      | Cold-read question after purpose                             |
| ----------- | --------------------------------------------- | ------------------------------------------------------------ |
| source      | non-test code                                 | What consumes and verifies its public surface?               |
| test        | `*.test.ts`, `*.spec.ts`                      | Which production behavior and target does it guard?          |
| config      | Nx, TypeScript, ESLint, compose, env examples | Which tool and workflow consume it?                          |
| script      | `bin/`, hook and deploy entrypoints           | Who invokes it, with which working directory?                |
| migration   | `apps/be-01/drizzle/**`                       | Is its down pair present, and is the applied file immutable? |
| fixture     | JSON, SQL and corpus inputs                   | Which test or runtime reader requires it?                    |
| generated   | emitted API or build input                    | What source and regeneration command own it?                 |
| vendored    | pinned external skill or source               | Which lock entry owns its exact tree hash?                   |
| symlink     | mode `120000` entries                         | Does its target exist and do tools treat it deliberately?    |
| placeholder | `.gitkeep` and equivalents                    | Does the empty directory still have a consumer?              |
| document    | guides, ADRs and plans                        | What authority does it summarize, and who links to it?       |
| OpenSpec    | active and archived artifacts                 | Is it live authority, delta, evidence or frozen history?     |

Binary entries are still reviewed individually, but the cold read judges their
declared role, format and consumer rather than pretending their bytes are prose.
Applied migrations and archived OpenSpec artifacts are reviewed but not rewritten.

### Per-file protocol

One fresh subagent is created for one tracked path:

1. Read only the assigned file.
2. Record `yes`, `partial` or `no` for:
   - purpose is clear;
   - relationships are clear;
   - a repository-scoped change can be reasoned about without unknown impact.
3. Only after recording that cold judgment, trace direct imports, reverse imports,
   tests, scripts, configuration, generated relationships, documentation links,
   runtime routes and declared external consumers.
4. Emit evidence, findings and a proposed diff. Never edit the checkout.
5. A write-owning module agent applies allowed documentation, naming and JSDoc
   corrections coherently with adjacent tests.
6. Behavioral or architectural findings are queued into an OpenSpec change.
7. A second fresh file agent re-runs the cold judgment after corrections. All
   three answers must be `yes`, or the ledger retains an explicit unresolved
   finding and the sweep remains incomplete.

The prompt template is versioned. Each ledger entry records the prompt blob so
“fresh subagent” and the questions asked are auditable rather than asserted.

### Directory, project and documentation passes

File completion is not directory completion. After all child entries are current:

1. One fresh directory agent reviews the directory tree, its README and child
   findings without inheriting conversation context.
2. One fresh boundary agent reviews every Nx app and library as a whole: purpose,
   dependency direction, public interfaces, external consumers and checks.
3. The docs pass repeats the file and directory protocol under `docs/`, active
   OpenSpec artifacts and root documentation.
4. Root navigation is reviewed last because it composes the child summaries.

Directory entries are keyed by Git tree ID. Project entries additionally capture
the ring, runtime, public surface and derived dependency graph.

## Evidence without invalidation explosion

A file blob alone proves only that the file itself has not changed. The ledger is
therefore sharded: every agent module owns `.wiki-ledger.jsonl`, sorted by path.
This prevents a central ledger from becoming a merge hotspot.

A file entry records:

```text
path, kind, class, blob, base, reviewedAt, protocolBlob, model,
coldJudgments, evidence, consumedInterfaceFingerprints,
reverseEdgeFingerprint, checks, findings, externalUnprovable
```

Freshness rules are deliberately asymmetric:

- changing the file invalidates its entry;
- changing a consumed public interface invalidates the consumer;
- adding or removing a reverse edge changes the provider's reverse-edge
  fingerprint and invalidates its relationship judgment;
- editing a caller without changing its edge does not invalidate the provider;
- editing an implementation dependency without changing its public fingerprint
  does not invalidate every transitive consumer;
- changing the review protocol invalidates entries produced by the older protocol
  only when its semantic version says the judgment changed.

This answers Claude Fable's valid evidence-closure objection without making a hub
file invalidate hundreds of attestations whenever a caller changes internally.

Import relations come from parsers and the Nx graph. Non-import relations are
explicit edge kinds:

- dynamic filesystem reads and generated files;
- shell and package-script invocation;
- Nx inputs and targets;
- CI and lefthook commands;
- deployment, compose and Caddy references;
- environment variables and ports;
- database tables and migrations;
- HTTP routes and shared contracts;
- documentation links and claims sourced from executable configuration;
- vendored tree locks and symlink targets;
- declared external consumers.

## Temporary module ownership

File isolation is a review technique. Write ownership is a temporary lease on the
smallest independently testable module or change slice.

Many agents may read a module. Exactly one session may write it while its lease is
active. A cross-module task acquires every affected module before editing. Leases
end when work is integrated or abandoned; they are not permanent team ownership.

Live leases reside below the shared Git common directory, not in tracked files.
The future Bun command must:

1. resolve requested modules and their write patterns;
2. refuse overlap with an active lease or conflict group;
3. create an isolated worktree from a pinned base;
4. emit a machine-readable work packet;
5. release only the exact lease held by that session.

Every work packet contains:

```text
objective
owned write paths
read-only dependencies
consumed public interfaces
produced public interfaces
cross-file invariants
scoped checks
integration checks
required completion evidence
```

The agent refuses a write outside the packet. Independent modules can therefore
have independent writers rather than waiting for one repository-wide serial
applier.

### Contract-changing work

A task that changes a shared public contract is sequenced differently:

```text
contract owner changes and verifies the interface
  -> interface commit is frozen
    -> consumer modules update in parallel from that commit
      -> compatible slices enter one integration batch
```

This makes the necessary serial point explicit and restores parallelism after it.

## Wiki lint

Add a `tool-wiki:lint` Nx target. It must run over the real Git tree with complete
inputs or with caching disabled, run from `bin/h2puni-gate.sh`, and run as a
whole-tree CI and pre-commit check. `{staged_files}` is insufficient for deletion
and reverse-link checks.

The lint rejects:

- uncovered, stale or orphan ledger entries;
- stale consumed-interface or reverse-edge fingerprints;
- irreproducible relationship evidence;
- missing required directory, project or documentation passes;
- a qualifying directory with no README;
- README contents disagreeing with the tree in either direction;
- missing relative targets or anchors, case mismatches, globs or ambiguous
  basenames in indexes;
- README metadata disagreeing with Nx tags, graph edges, paths or checks;
- missing declared external consumers at deployable boundaries;
- stale extracted facts such as ports, scripts, CI jobs, routes and table names;
- duplicate glossary terms or a canonical term appearing in its own `_Avoid_`;
- `AGENTS.md` above 120 lines or `LLM_README.md` above 150 lines;
- a filtered self-scope that sees fewer paths than `git ls-tree`.

Semantic contradiction detection remains a scheduled, non-gating LLM lint until
it can be made deterministic. Deterministic extracted facts are gating from the
start.

### Non-vacuous proof table

Every rule is implemented test-first and watched through the production lint
entrypoint with the named fault injected:

| Rule               | Injected fault                                | Required observed failure           |
| ------------------ | --------------------------------------------- | ----------------------------------- |
| coverage           | remove one current entry                      | `uncovered: <path>`                 |
| file freshness     | change one byte without review                | `stale: <path>`                     |
| consumed interface | change an exported signature                  | consumer becomes stale              |
| reverse relation   | add one new importer                          | provider relationship becomes stale |
| orphan             | retain an entry after deleting its path       | `orphan: <path>`                    |
| evidence           | claim an importer that has no edge            | `evidence mismatch`                 |
| directory tree     | add a child without directory review          | `stale directory`                   |
| required index     | add a qualifying two-file module              | `missing index`                     |
| contents           | omit a child and list a deleted child         | both mismatches reported            |
| links              | wrong case, missing anchor, glob and basename | each exact link refused             |
| metadata           | claim `ring:domain` for an adapter            | ring mismatch                       |
| caps               | make `AGENTS.md` 121 lines                    | `121 lines, capped at 120`          |
| facts              | change MCP port, table or CI job in prose     | each source mismatch named          |
| self-scope         | filter the inventory below 2,000 paths        | scope check fails                   |
| cache              | omit an input and change a document           | target must re-execute and fail     |
| full gate          | stale one file and run h2puni gate            | `tool-wiki:lint` fails there        |

Adjacent `Proof:` comments are written from the observed output, never predicted
before the negative is run.

## Initial corrective sweep

The pilot established real work, not hypothetical examples:

- `LLM_README.md` misstates MCP transport, local app count, CI sharding, schema
  naming, test scope, deployment authority and some open findings.
- `AGENTS.md` is 477 lines; most of it is a chronological R5 incident ledger in
  the automatically loaded context.
- `CONTEXT.md` is 1,243 lines with duplicate or conflicting terms, implementation
  detail, stale Role vocabulary and incorrect definitions.
- `docs/local-dev.md` contradicts executable scripts and refers to an absent
  observability compose file.
- `apps/be-01/src/repository/db.ts` and frontend plan-column composition contain
  stale or incomplete dependency contracts.

The sweep moves the R5 incidents into `docs/r5-fault-catalogue.md`, grouped by
fault shape with stable identifiers. It does not create a chronological log.
`AGENTS.md` retains the rules and links the catalogue. `CONTEXT.md` retains only
domain vocabulary; behavior moves to current specs and symbol mechanics to JSDoc.

Every remaining path is reviewed through the same protocol. Pilot findings do not
exempt those files from their final fresh review.

## Agentic scalability verification

The benchmark uses the same pinned repository state and representative independent
module tasks. Run cohorts of one, two, four and eight agents with equivalent work
packets. A task counts only when its scoped checks pass, its ledger is current and
its change is accepted into an integration batch.

In addition to `Q(N)`, record:

```text
merge-conflict rate          <= 5%
integration rework rate      <= 10%
median task discovery time   <= 5 minutes
ordinary invalidation gain   <= 3 reviews per changed file
lease wait time              <= 10% of aggregate agent time
```

If throughput misses the target, do not raise the threshold or exclude failed
tasks. Report the limiting serial fraction: lease contention, contract fan-out,
test duration, integration queue, root-file collision or review invalidation.

## Delivery sequence

Implementation is intentionally split so multiple agents can work without one
giant branch becoming its own serial bottleneck.

### Change A: knowledge foundation

- Create an OpenSpec change with ADDED capabilities `index-conventions`,
  `wiki-ledger` and `wiki-lint`.
- Record the hard-to-reverse deviations from the source pattern in ADR 0018: the
  repository itself is the raw layer, and knowledge is placed locally instead of
  copied into page-per-file summaries.
- Amend R1/R3, cap `AGENTS.md`, extract the R5 catalogue and define traversal.
- Implement the ledger schema, relation fingerprints, README conventions and
  complete-tree lint with its negative proofs.
- Wire the lint into Nx, lefthook, CI and `bin/h2puni-gate.sh`.

### Change B: parallel ownership

- Create an OpenSpec change for temporary module leases and work packets.
- Derive top-level modules from Nx and nested modules from README metadata.
- Implement overlap/conflict-group refusal and isolated-worktree creation.
- Prove lease acquisition, overlap refusal, exact release, stale-session recovery
  and out-of-packet write refusal through the production command.

### Change C: exhaustive sweep

- Pin the base commit and derive the complete path/directory/project inventory.
- Dispatch one fresh propose-only reviewer per tracked path.
- Apply corrections with one write owner per non-overlapping module.
- Run fresh post-correction file reviews, then directory, project and docs passes.
- Rebase and run catch-up rounds until the branch has zero stale entries.
- Run a second fresh review over a 5% sample; re-run any shard with more than 10%
  disagreement.

### Change D: scalability measurement

- Define representative independent work packets and a reproducible runner.
- Measure one, two, four and eight agent cohorts.
- Fix identified serial hotspots rather than excluding them from the measure.
- Record results and limiting factors in `verify.md`.
- Batch compatible slices, run the full repository gate and land through the
  merge queue.

Each implementation change has its own intent-first OpenSpec artifacts and review.
The exhaustive sweep may open additional changes for behavioral findings; it is
not allowed to hide them as documentation corrections.

## Completion evidence

The future implementation is complete only when all of the following are true:

1. Every path at the final merge commit has a current, fresh-agent ledger entry
   and all three post-correction judgments are `yes`.
2. Every directory, Nx project, app, library and documentation tree has a current
   aggregate review and every qualifying boundary has a compliant README.
3. The complete-tree wiki lint passes and every rule's named fault has been
   observed failing through its production call path.
4. The full repository gate and OpenSpec validation pass at the final commit.
5. The measured throughput meets the 80% linear-efficiency targets through eight
   agents, or the change remains incomplete with its bottleneck named.

## Review record

Claude Fable 5 independently reviewed the first proposal at repository commit
`619b714b` and returned `REQUEST CHANGES`. This plan incorporates its five
critical findings: evidence closure, the uncapped automatically loaded rules,
unsafe concurrent correction, missing directory/project/doc review kinds, and
gate placement. It also replaces the proposed repository-wide serial applier with
temporary per-module write leases and batched integration, which is required for
the stated scaling function.

The review report was generated outside the repository and is not an authority;
the claims accepted here were rechecked against the repository before inclusion.

## Delivery handoff

Paused on 2026-09-08 after the plan-only branch was committed and pushed.

- Branch: `change/agent-scalable-llm-wiki`
- First plan commit: `f0d2c2e454ffb7b2ba9d0b70ca16982e817948c7`
- Isolated worktree: `.worktrees/agent-scalable-llm-wiki`
- `bun run test:unit`: passed (`be-01`: 886 passed, 1 skipped; all seven
  configured library targets succeeded).
- Prettier and the commit hooks passed.
- `bin/h2puni-gate.sh`: started but did not complete. The unchanged local
  environment lacked the solver's `ortools` and `jsonschema` Python packages,
  two macOS launcher checks failed at `RLIMIT_AS`, and the full `be-01` run
  reported 1,952 passed, 2 skipped, 0 failed and 2 runtime errors. The command
  then produced no output for more than four minutes and was interrupted at the
  user's pause request (exit 130).
- Merge status: not merged and no checks bypassed. Resume by opening or locating
  the GitHub pull request, use CI as the clean-host gate, and merge only after
  required checks pass.
