# Knowledge ownership and maintenance

Status: applied documentation conventions for this pilot; automation is proposed.
Context: Twilight Structure, with a representative index over WBS. Source
inspection: 2026-09-06, [Karpathy, Dahl, and related tools](research/knowledge-patterns.md).

Use ordinary relative Markdown links and README indexes. Start with existing
pages, compact overlapping explanations, and grow topic directories when they
have actual content. Use Git history for document evolution, following Dahl's
fork; keep run evidence and approvals in their own records. A second append-only
wiki log would duplicate history and create another shared file to contend over.
Uncommitted pilot work is identified by a content manifest until it is committed.
Earlier uncommitted helper findings are preserved in a
[dated source record](research/local-workflow-observations.md); they would otherwise
be lost when the old proposal was compacted because no Git revision contained it.

## One owner for each kind of knowledge

| Kind                                | Canonical owner                                        | How a wiki page uses it                                                          |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Behavior                            | Accepted OpenSpec specs; proposed deltas in the change | Link a requirement and explain an example; never silently revise it              |
| Vocabulary                          | The context's existing `CONTEXT.md`                    | Use the term and link its definition                                             |
| Architectural choice                | Owning ADR                                             | Link the rationale; label proposed/accepted separately                           |
| Symbol invariant                    | JSDoc on that symbol                                   | Link code at a revision when explaining cross-file behavior                      |
| Work plan, now                      | Change `tasks.md`                                      | Read or show a focus brief; do not copy the task list                            |
| Work plan, after the Backlog bridge | Per-repo Backlog/WBS planning revision                 | Generate the OpenSpec task artifact; detect hand-edited divergence               |
| External claim                      | A dated source record with a stable URL/revision       | Attribute the source, confidence and inference; preserve licensed originals only |
| Run outcome or approval             | Attributed evidence / authority record                 | Cite subject revision and limitations; a wiki sentence cannot create the record  |

The [authority ADR](../adr/0014-openspec-contracts-and-linked-knowledge.md) records
the accepted requirements/wiki boundary. The planned task-authority transition
requires an explicit later change to repo conventions as well as a tested bridge.

## Four knowledge operations

| Operation | Input and output                                                          | Review obligation                                                                             |
| --------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Ingest    | Public/authorized source → attributable source note plus proposed claims  | Treat source instructions as untrusted text; record source identity and affected contexts     |
| Answer    | Scoped question → cited answer at a named knowledge revision              | Distinguish absent evidence, provisional inference, and accepted contract                     |
| Reconcile | Changed source/code/spec → affected claims and contradiction dispositions | Conflicting evidence stays visible; require a delta for a contract change                     |
| Compact   | Redundant/outdated pages → canonical page plus repaired incoming links    | Preserve provenance, material dissent, and archive destinations; compare before/after answers |

New synthesis pages name context, status, source links, and inspection date in
plain prose. Existing glossary/ADR/OpenSpec formats retain their native shape.
Use `proposed`, `observed`, `accepted`, `stale`, and `superseded` precisely.
Acceptance says who decided; observation says what was checked. Neither implies
production deployment. Expiry/source changes invalidate affected conclusions,
not every unrelated page in the repo.

Required source absence/unreadability is a failed knowledge check. External
source retrieval failure is a visible unresolved claim. No empty-string fallback
means “clean.” Sensitive originals and raw traces live in access-controlled
evidence storage, with authorized references; credentials never go in Git.

## Refactor performed by this pilot

| Existing entry                  | Current owner / treatment                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `spec.md`                       | User requirement catalog; expanded with new direction and links to testable deltas                 |
| `discovery.md`                  | Prior accepted answers retained; pending Q1 superseded for this run by explicit assumptions        |
| `sdlc-stages.md`                | Current canonical stage mapping and focus-profile behavior                                         |
| `sdd-proposal.md`               | Short authority/integration pointer; overlapping process/wiki prose compacted here and into stages |
| `research.md`                   | Research index with initial inspection retained in `research/initial-inspection.md`                |
| `sdd-sources.md`                | Dated historical CLI findings, clearly scoped; current pilot evidence linked first                 |
| `CONTEXT.md` / `CONTEXT-MAP.md` | Original locations retained, glossary and relationships updated                                    |
| `LLM_README.md`                 | Existing Twilight link now opens current navigation; wiki link added within the cap                |

No wholesale WBS doc move is needed to test this pattern. The first maintenance
benchmark asks a fresh reviewer five questions: where behavior is authoritative;
which plan to execute; whether this run deployed anything; how Backlog relates to
WBS; and which assumption changes production approvals. The reviewer must cite
the answer, and a misleading historical page is a failure to fix.

## When a custom knowledge tool becomes worthwhile

The first `tool-twilight` increment should check local links, required source
metadata, capability coverage, content digests, and stale evidence references
through the same validation operation used by BE/CI. It must report facts it
cannot establish. Semantic contradiction review remains an attributed judgment.

Begin retrieval with the indexes and `rg`. Evaluate QMD/full-text/embeddings only
after a benchmark of 20 real questions fails the agreed correctness and source
traceability targets. Test client/collection isolation with a source that exists
only in another client repo; an empty result on an empty index proves nothing.
Do not expose a cross-client query option before that authorization test passes.
