# Knowledge patterns and the SDLC interaction layer

Researched 2026-09-06. This note identifies primary sources and recommends a
documentation pilot. It does not activate skills, change approval policy,
install services, or establish runtime compatibility. The proposed flow remains
in [SDLC stages](../sdlc-stages.md); earlier findings remain in
[SDD sources](../sdd-sources.md).

Recommendation: use `i-have-adhd` as the SDLC's human interaction convention;
borrow Ryan Dahl's repository-oriented refinement of Karpathy's wiki pattern;
keep OpenSpec requirements authoritative. Evaluate Claw Patrol separately as
an execution boundary when the factory needs external service access.

## Source identities

All sources below were retrieved through the browser on **2026-09-06**.
Retrieval dates describe this inspection, not proof that every upstream page
was published or refreshed that day.

| Reference          | Identified primary source                                                                                                                                                   | Attribution and confidence                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i-have-adhd`      | [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd), especially [the skill](https://raw.githubusercontent.com/ayghri/i-have-adhd/main/skills/i-have-adhd/SKILL.md)  | High confidence that this is the maintained project matching the name. Its own history records the original skill and subsequent changes. User intent still cannot be established solely from a matching name.    |
| Karpathy LLM Wiki  | [Original gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)                                                                                          | High confidence; published under Karpathy's account, created 2026-04-04. Retrieved raw revision: `ac46de1ad27f92b28ac95459c782c07f6b8c964a`.                                                                      |
| Ryan Dahl LLM Wiki | [Dahl's gist](https://gist.github.com/ry/c56dfa7b1b90eeff2d8d0127e45ae3bb) and [revision comparison](https://gist.github.com/ry/c56dfa7b1b90eeff2d8d0127e45ae3bb/revisions) | High confidence. GitHub explicitly identifies the fork from Karpathy, and the revision comparison attributes edits dated 2026-08-25 to `ry`. This is a modified idea file, not a separate installed wiki product. |
| Claw Patrol        | [denoland/clawpatrol](https://github.com/denoland/clawpatrol), [official announcement](https://deno.com/blog/clawpatrol)                                                    | High confidence. The 2026-05-21 announcement names Ryan Dahl alongside Bert Belder, Divy Srivastava, Arnau Orriols, Yusuke Tanaka, and Josh Collinsworth. Attribute it to the Deno team, not Dahl alone.          |
| QMD                | [tobi/qmd](https://github.com/tobi/qmd), [upstream README](https://raw.githubusercontent.com/tobi/qmd/main/README.md)                                                       | High confidence in project identity and documented interface. No local compatibility or retrieval-quality experiment was performed.                                                                               |

The inspected `i-have-adhd` [file history](https://github.com/ayghri/i-have-adhd/commits/main/skills/i-have-adhd/SKILL.md)
lists `4542715f583f78a71975172e23d96522d5dcca31`, dated 2026-08-10,
as its latest displayed modification. That is a file-history observation,
not an independently resolved pin for the entire repository's current `main`.

The similarly named [Enkrypt AI ClawPatrol](https://www.enkryptai.com/clawpatrol)
is a different vendor's project. Its existence does not establish a Dahl
connection. Secondary directories and reposted skills were used only to find
primary sources; their compatibility and authorship claims were not adopted.

## What the sources actually propose

### `i-have-adhd`

The current skill's frontmatter sets `disable-model-invocation: true`; its
description names `/i-have-adhd` as the invocation and provides an explicit
off switch. Once invoked, it requests session-long persistence. Its rules
favor immediate actions, numbered steps, visible progress, remembered state,
bounded lists, concrete estimates, and direct error reporting. It also
explicitly yields to the task and harness when a formatting rule would
interfere. Thus copying an older description that promises automatic
activation would misdescribe the inspected version.
[Current skill](https://raw.githubusercontent.com/ayghri/i-have-adhd/main/skills/i-have-adhd/SKILL.md)

Treat this as an interaction design reference. Its generalized statements
about ADHD are not evidence about this user's cognition, a diagnosis, or a
measured clinical effect. The project's own README says a diagnosis is not
needed to use the output style.
[Project README](https://github.com/ayghri/i-have-adhd#readme)

### Karpathy and Dahl

Karpathy proposes preserved source material, an agent-maintained Markdown
knowledge layer, and maintenance instructions. The operations are ingestion,
cited querying, and inspection for gaps, contradictions, or stale material.
His `index.md` catalogs content and `log.md` records operations. Exact layouts
and tools remain adaptable. This is a pattern description, not evidence that
any generated claim is correct or that maintenance is reliable without checks.
[Original note](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

Dahl's fork retains that foundation and adds explicit compaction: repairing,
merging, retiring, and reorganizing pages. It favors ordinary relative
Markdown links, README indexes, topic directories introduced as needed,
sources inside `raw/`, and Git commits as the chronology instead of a shared
append-only log. The changes also remove reliance on Obsidian-specific
navigation. These additions are visible in his revision comparison, so they
can be attributed to the fork rather than inferred from his other work.
[Dahl's revisions](https://gist.github.com/ry/c56dfa7b1b90eeff2d8d0127e45ae3bb/revisions)

### Claw Patrol

Claw Patrol is an external traffic gateway with credential injection and
policy decisions over parsed protocols. Its security model distinguishes
remote host separation from local UNIX-user separation. It explicitly
excludes readable pre-existing host secrets from its control and states that
root-equivalent agent access defeats local isolation. These are material
limits on the claimed boundary, not installation details to skip.
[Security model](https://clawpatrol.dev/docs/security-model/)

Its policy replay command documents expected verdicts, rule matches, and
endpoint dispatch. Fixtures can come from recorded actions; mismatches fail
the run. However, `approve` only means routing to an approver, not the human's
eventual decision. Fixture request bodies are not automatically redacted.
Neither a replay pass nor a recorded approval route proves a successful live
deployment or complete secret removal.
[Testing contract](https://clawpatrol.dev/docs/clawpatrol-test/)

## Proposed SDLC interaction convention

This section is our adaptation to the existing stage design, not an upstream
feature claim. Apply the convention across stages rather than inventing a
separate ADHD stage or task plan. The user's request authorizes incorporating
the convention into the design; installing or changing skill distribution
is a separate implementation task.

| Situation                      | Human-facing behavior                                                                                                       | Durable record                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Discovery needs a decision     | Present the decision's consequence, recommend an option, and ask one unresolved question. Keep additional questions queued. | The canonical discovery record or decision map; distinguish answers from proposals.                         |
| Work is running                | Show the current stage, the concrete outcome just established, and the next action the agent is taking.                     | Existing task and run evidence, with a small resumable cursor.                                              |
| A task is interrupted          | On resumption, identify the pending decision or task without requiring the person to reconstruct the chat.                  | Task ID, last verified revision, blocker, and next action; references into `tasks.md`, never a second plan. |
| A required approval is reached | Present the artifact revision, consequence, relevant unresolved risk, and one decision.                                     | An attributable decision associated with the reviewed revision, according to the selected approval policy.  |
| A check fails                  | Show the observed failure, its effect on progress, and the next diagnostic action.                                          | Evidence retains the exact command and output; a short interface must not omit a material failure.          |

Use estimates only when there is a basis for them. Distinguish human effort
from agent or infrastructure elapsed time; say what is unknown instead of
inventing minute counts. Keep optional detail behind links. Completion should
show the supported outcome and stop; do not manufacture another user task.
Authorized work continues automatically until a real dependency or policy
requires input. A brief presentation must preserve alternatives when choosing
among them is the task.

Evaluate this convention with task examples: an interrupted discovery,
a running implementation, a failed gate, and a completed docs change. Check
that each gives an accurate state and an actionable continuation without
forcing a redundant confirmation. These are future evaluation scenarios;
no such evaluation was run in this research.

## Proposed knowledge authority and maintenance

The repository already places behavior in OpenSpec, terms in `CONTEXT.md`,
cross-file decisions in ADRs, symbol knowledge in JSDoc, and orientation in
`LLM_README.md`. The wiki should make those sources easier to reach and
reconcile, while retaining their ownership.
[Repository rules](../../../AGENTS.md), [stage design](../sdlc-stages.md)

| Knowledge kind                        | Authority                                                         | Wiki treatment                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Required behavior                     | The accepted OpenSpec requirement and its approved change context | Link the requirement and its scenarios; explain context without introducing a competing contract.        |
| Domain term or architectural decision | Owning context glossary or accepted ADR                           | Link the canonical definition or decision; qualify terms whose meanings differ across contexts.          |
| Implementation fact                   | The named symbol or configuration at an identified revision       | Cite the code and applicable evidence; separate observed behavior from intended behavior.                |
| External claim                        | The identifiable primary source at a version or retrieval date    | Preserve attribution and a licensed snapshot or stable source pointer; mark synthesis as interpretation. |
| Run outcome or human decision         | Its attributable evidence or decision record                      | Link it; an agent-written summary cannot create an approval or turn unexecuted checks green.             |

For newly synthesized pages, start with only the metadata needed to use them:
owning context, knowledge kind, status, source references, and last verification
date plus relevant revision. Use explicit statuses such as proposed,
accepted, observed, stale, and superseded. Do not apply generic frontmatter
blindly to existing OpenSpec, glossary, or ADR formats.

When evidence disagrees with a requirement, record the discrepancy and route
it into discovery or a change. When two primary sources disagree, preserve
both claims with their dates and scopes; do not let the newer prose silently
win. A wiki editor can repair a misleading summary, but changing a behavioral
contract follows the existing OpenSpec workflow.

Mark dependent claims stale when their referenced revision or source changes.
Re-check volatile external claims when a decision needs them, with expiry
intervals chosen for that source's volatility. Stale material remains visible
as history; it must not be presented as current verified evidence. Missing or
unreadable required sources produce an explicit failure, not a clean report.

Treat source contents as evidence to interpret, not instructions to execute.
Use public or explicitly authorized material only. Preserve external originals
when retention is permitted; otherwise retain a precise pointer and concise
notes. Corrected captures become a new source revision. Never ingest whole
private agent transcripts or credential-bearing logs merely because a wiki
can index them.

Use Git for document evolution, but keep operation evidence and human
decisions in their canonical records. A commit records what was written;
it does not prove who approved it or which live system was tested. Reserve
rewrites and page deletion for material whose canonical claims and incoming
links have been accounted for. Compaction should preserve source lineage.

## Borrow, build, or defer

| Decision                                                  | Recommendation and trigger                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Borrow now: interaction convention                        | Carry the adapted output rules through the SDLC instructions and future interface. Keep the current `tasks.md` and stage records as the state source.                                                                                                                                                                                                                                                                  |
| Borrow now: portable wiki conventions                     | Use ordinary Markdown, small directory indexes, existing Git history, and deliberate cleanup. Keep the root orientation index small; introduce context directories where domain ownership already justifies them.                                                                                                                                                                                                      |
| Build only the missing checks                             | After an inventory, add Bun/Nx checks for broken local links, missing source metadata, unresolved required references, and stale revision references where existing checks do not cover them. Keep semantic contradiction review explicitly separate from structural validation.                                                                                                                                       |
| Defer QMD until retrieval misses justify it               | QMD documents local BM25, vector retrieval, reranking, CLI/JSON output, collection scoping, and MCP. Start with the index and `rg`; benchmark representative questions before adding models or an index service. Its README warns that unknown MCP parameters are ignored, so collection isolation needs a negative test before relying on it. [QMD README](https://raw.githubusercontent.com/tobi/qmd/main/README.md) |
| Defer Claw Patrol deployment; borrow its boundary pattern | Keep privileged policy and credentials outside the worker's control. Later evaluate a pinned release against actual factory protocols, isolation, credential exposure, approval delivery, and failure recovery. This research provides no runtime security assurance. [Security model](https://clawpatrol.dev/docs/security-model/)                                                                                    |

The first wiki pilot should inventory the Twilight Structure documents and
choose a small useful question set, such as: who owns a requirement, which
decision selected the flow, what is still unresolved, and which evidence
supports a completed stage. Assign one canonical location per claim; update
links as pages move; preserve historical research as dated evidence. Compare
answer correctness, source traceability, retrieval effort, and stale-claim
handling before extending the pattern across all repo documentation.

For every future safety check, exercise the production call path with a
deliberate fault: remove a required linked file, make its read fail, change a
referenced revision, or introduce a scoped contradiction as appropriate.
Record which assertion actually failed before writing its `Proof:` comment.
An LLM review finding is useful evidence of a review, but it is not a
deterministic guarantee that all contradictions were found.

## Verification and limits

Read `LLM_README.md`, the existing SDD source note, and the SDLC stage design;
searched only project documentation and skill directories for the named
references. Read the primary pages and the Dahl gist's revision comparison.
No private session history, secrets, or account services were inspected.

A read-only shell request to GitHub's public commit API failed because
`api.github.com` could not resolve; its JSON parser then failed on empty input.
Browser API and some revision-specific URLs also returned cache misses.
Consequently, this note does not claim a freshly resolved current repository
HEAD for the external projects. The browser did expose the original
Karpathy raw revision and the ADHD skill's file-history commit above.

No dependency installation, skill modification, application change, Claw
Patrol run, QMD run, browser acceptance scenario, or full repository gate was
performed. Those checks are outside this documentation research task.
