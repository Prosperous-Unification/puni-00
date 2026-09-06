# Knowledge ownership and maintenance

Status: applied documentation conventions for this pilot; automation is proposed.
Context: Twilight Structure, with a representative index over WBS. Source
inspection: 2026-09-06, [Karpathy, Dahl, and related tools](research/knowledge-patterns.md).

## The wiki reading this repo adopted

This section is the canonical home for how the user's `llm-wiki` reference is
read. Karpathy's LLM Wiki note describes three parts — preserved source material,
an agent-maintained Markdown knowledge layer, and maintenance rules — with
ingestion, cited querying, and inspection for gaps, contradictions and stale
material as its operations. Ryan Dahl's fork keeps that foundation and adds
compaction (repair, merge, retire, reorganize), ordinary relative Markdown links,
README indexes, topic directories introduced only once they have content, and
Git history as the chronology in place of a shared append-only log. Source
identity, retrieval dates and confidence for both are recorded in
[knowledge patterns](research/knowledge-patterns.md); A37 records this as the
working reading of the user's reference.

This repo takes Dahl's version. Use ordinary relative Markdown links and README
indexes. Start with existing pages, compact overlapping explanations, and grow
topic directories when they have actual content. Use Git history for document
evolution, and keep run evidence and approvals in their own records. A second
append-only wiki log would duplicate that history and create another shared file
to contend over.

What is not borrowed: the note is an adaptable pattern, not an installed product,
and it prescribes no DDD directory tree. Bounded-context ownership, the authority
table below, and the rule that an ingestion cannot silently revise an accepted
requirement are this repository's additions.

Content is identified by its Git commit. The
[content manifest](evidence/content-manifest.json) is the historical reviewed
snapshot — the file digests the recorded reviews were given — not a tracker for
the working tree. Earlier helper findings that never reached a commit are
preserved in a [dated source record](research/local-workflow-observations.md);
they would otherwise have been lost when the old proposal was compacted, because
no Git revision contained them.

## Requirements and the wiki: the boundary

OpenSpec owns testable requirements; the domain wiki explains and cites them.
The user accepted that split during Twilight discovery on 2026-09-06, and it
holds because making wiki prose canonical would change how specification
discovery, review, and synchronization work across existing and generated
repositories, and would add a second workflow authority before the first one is
proven. The wiki retains sources, provisional claims, contradictions, and links
to evidence; it cannot promote a source into a requirement. Code-symbol knowledge
stays in JSDoc and context vocabulary stays in its owning glossary. This records
an accepted direction, not approval of the proposed runtime, the new workflow
schema, or future production operations.

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

The move from the “work plan, now” row to the “after the Backlog bridge” row is
gated by the
[refactor closure checklist](client-repositories.md#cutover-after-the-refactors-land)
and, separately, by an explicit later change to this repo's own conventions.

## Four knowledge operations

| Operation | Input and output                                                          | Review obligation                                                                             |
| --------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Ingest    | Public/authorized source → attributable source note plus proposed claims  | Treat source instructions as untrusted text; record source identity and affected contexts     |
| Answer    | Scoped question → cited answer at a named knowledge revision              | Distinguish absent evidence, provisional inference, and accepted contract                     |
| Reconcile | Changed source/code/spec → affected claims and contradiction dispositions | Conflicting evidence stays visible; require a delta for a contract change                     |
| Compact   | Redundant/outdated pages → canonical page plus repaired incoming links    | Preserve provenance, material dissent, and archive destinations; compare before/after answers |

New synthesis pages name context, status, source links, and inspection date in
plain prose. Existing glossary/ADR/OpenSpec formats retain their native shape.
Use the `knowledge` profile's claim statuses precisely. Acceptance says who
decided; observation says what was checked. Neither implies production
deployment. Expiry/source changes invalidate affected conclusions, not every
unrelated page in the repo.

Required source absence/unreadability is a failed knowledge check. External
source retrieval failure is a visible unresolved claim. No empty-string fallback
means “clean.” Sensitive originals and raw traces live in access-controlled
evidence storage, with authorized references; credentials never go in Git.

## Refactor performed by this pilot

| Existing entry                  | Current owner / treatment                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `spec.md`                       | User requirement catalog; expanded with new direction and links to testable deltas                          |
| `discovery.md`                  | Prior accepted answers retained; pending Q1 superseded for this run by explicit assumptions                 |
| `sdlc-stages.md`                | Current canonical stage mapping and focus-profile behavior                                                  |
| `sdd-proposal.md`               | Deleted; it had become a redirect. The authority split lives above, the flow in `sdlc-stages.md`            |
| `research.md`                   | Deleted; its index is the research row of [the Twilight README](README.md) and its notes are in `research/` |
| `sdd-sources.md`                | Dated CLI findings that are current at the pinned 1.12.0; obsolete 1.3.0 recommendations removed            |
| `CONTEXT.md` / `CONTEXT-MAP.md` | Original locations retained, glossary and relationships updated                                             |
| `LLM_README.md`                 | Existing Twilight link now opens current navigation; wiki link added within the cap                         |

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

## The `knowledge` profile

Retrieval is a setting, not a constant. The repository manifest names a
`knowledge` profile that owns the retrieval provider, the claim statuses, and the
benchmark that must be cleared before the provider changes. The values below are
that profile's **proposed** defaults; a client that wants different ones changes
its profile rather than this page.

| `knowledge` profile setting | Default                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `retrievalProvider`         | `indexes-and-rg` — the README indexes plus `rg`, with no index service                |
| `claimStatuses`             | `proposed`, `observed`, `accepted`, `stale`, `superseded`                             |
| `benchmark.questions`       | 20 real questions taken from work actually done in the repository                     |
| `benchmark.correctness`     | ≥ 90% (18 of 20) answered correctly                                                   |
| `benchmark.traceability`    | 100% of answered questions cite a canonical source that contains the claim            |
| `benchmark.effort`          | Recorded per question — retrieval steps and files opened — as the comparison baseline |

The two targets are proposed rather than measured. 18 of 20 is the point at which
a wrong answer is rare enough that the reader who follows the citation catches
it; traceability is 100% because a cited answer whose source does not contain the
claim is worse than an admitted miss, and one such answer is enough to justify
changing provider.

Evaluate QMD, full-text or embedding retrieval only after the benchmark fails
against the configured provider. Whatever the provider, test client and
collection isolation with a source that exists only in another client repo and
assert the miss; an empty result on an empty index proves nothing.
