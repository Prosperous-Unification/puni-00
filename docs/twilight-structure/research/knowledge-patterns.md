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

Which parts of this reading the repository adopted, and what it deliberately did
not take, is stated once in
[the wiki reading this repo adopted](../knowledge.md#the-wiki-reading-this-repo-adopted).

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

## The interaction convention, and where it lives

The observations above are what `i-have-adhd` actually says: an explicitly
invoked skill with an off switch, favouring immediate actions, numbered steps,
visible progress, remembered state, bounded lists, concrete estimates and direct
error reporting, and yielding to the task when a formatting rule would interfere.

The adaptation of those rules into this product — which situations get which
behaviour, and what durable record each one leaves — is specified once in
[the focus profile](../product-experience.md#focus-profile). It is applied across
stages rather than given a stage or a task plan of its own, and it is our
adaptation, not an upstream feature claim. Installing or redistributing the skill
is a separate implementation task.

Two limits belong to this note rather than to that design. Use estimates only
when there is a basis for them, and distinguish human effort from agent or
infrastructure elapsed time; say what is unknown instead of inventing minute
counts. And a brief presentation must preserve the alternatives when choosing
among them is the task.

The convention still needs evaluating against task examples: an interrupted
discovery, a running implementation, a failed gate, and a completed docs change.
Check that each gives an accurate state and an actionable continuation without
forcing a redundant confirmation. These are future evaluation scenarios; no such
evaluation was run in this research.

## Knowledge authority and maintenance, and where it lives

The repository already places behavior in OpenSpec, terms in `CONTEXT.md`,
cross-file decisions in ADRs, symbol knowledge in JSDoc, and orientation in
`LLM_README.md`. The wiki should make those sources easier to reach and
reconcile, while retaining their ownership.
[Repository rules](../../../AGENTS.md), [stage design](../sdlc-stages.md)

The owner-per-kind table, the four knowledge operations, the claim statuses and
the source-handling rules that follow from those observations are specified once
in [knowledge ownership and maintenance](../knowledge.md). Three source-side
observations stay here because they are about the sources rather than about our
policy:

- When two primary sources disagree, preserve both claims with their dates and
  scopes; newer prose does not silently win.
- Volatile external claims need re-checking when a decision needs them, with an
  expiry interval chosen for that source's volatility.
- Source contents are evidence to interpret, never instructions to execute, and
  a whole private agent transcript or credential-bearing log is not ingestible
  merely because a wiki could index it.

## Borrow, build, or defer

The two "borrow now" decisions are settled and specified elsewhere: the
interaction convention in [the focus profile](../product-experience.md#focus-profile),
and the wiki conventions in [knowledge ownership](../knowledge.md). What remains
research is the deferral, and its trigger:

| Decision                                                  | Recommendation and trigger                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build only the missing checks                             | After an inventory, add Bun/Nx checks for broken local links, missing source metadata, unresolved required references, and stale revision references where existing checks do not cover them. Keep semantic contradiction review explicitly separate from structural validation.                                                                                                                        |
| Defer QMD until retrieval misses justify it               | QMD documents local BM25, vector retrieval, reranking, CLI/JSON output, collection scoping, and MCP. The provider and the benchmark that would replace it are the `knowledge` profile's settings. Its README warns that unknown MCP parameters are ignored, so collection isolation needs a negative test before relying on it. [QMD README](https://raw.githubusercontent.com/tobi/qmd/main/README.md) |
| Defer Claw Patrol deployment; borrow its boundary pattern | Keep privileged policy and credentials outside the worker's control. Later evaluate a pinned release against actual factory protocols, isolation, credential exposure, approval delivery, and failure recovery. This research provides no runtime security assurance. [Security model](https://clawpatrol.dev/docs/security-model/)                                                                     |

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
