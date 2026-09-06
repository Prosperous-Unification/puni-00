# SDD and knowledge structure: source findings

Inspected 2026-09-06 against the OpenSpec version this repo now pins, **1.12.0**,
installed by the [CI/skill upgrade](../2026-09-06-openspec-upgrade.md) on the work
branch. Findings that only held for the former 1.3.0 pin have been removed rather
than qualified; what remains is what is true of the version the pilot runs.
Current schema behavior is freshly exercised in
[pilot verification](../../openspec/changes/twilight-sdlc-pilot/verify.md).

This is research for the documentation/workflow pilot. An inspected surface is
not an activated schema, and artifact existence never establishes human approval
or verified runtime evidence.

## What 1.12.0 discovers

OpenSpec 1.12.0 discovers nested spec IDs and discovers changes without requiring
a `proposal.md` file. A disposable CLI probe verified validation, archive-driven
spec synchronization, listing, and subsequent main-spec validation for
`factory/discovery`. Existing schemas keep `proposal.md` and their existing
capability paths for compatibility with their own templates and historical
changes; nothing forces a rename.
[1.12.0 discovery](https://github.com/Fission-AI/OpenSpec/blob/v1.12.0/src/utils/item-discovery.ts),
[1.12.0 spec application](https://github.com/Fission-AI/OpenSpec/blob/v1.12.0/src/core/specs-apply.ts)

Nested `specs/<context>/<capability>/spec.md` is therefore available to this
pilot, and the pilot uses it. The version upgrade changes discovery, not
authority.

## OpenSpec customization and enforcement

The user supplied [issue #780](https://github.com/Fission-AI/OpenSpec/issues/780)
as the intended integration direction. Its discussion links a community
[superpowers-bridge schema](https://github.com/JiangWay/openspec-schemas/tree/f5d40404856ad0f4ce9eb482cbb0e28cf434411f/superpowers-bridge).
The schema invokes Superpowers methods from artifact/apply instructions and
redirects output into the OpenSpec change. Its README identifies duplication
of documentation, task fragmentation, and manual skill selection as the
integration problems it addresses.

Inspected bridge release: 1.0.0 at commit
`f5d40404856ad0f4ce9eb482cbb0e28cf434411f`. Its stated historical baseline is
OpenSpec 1.4.1 and Superpowers 5.1.0; that is not a compatibility guarantee
for this repo's newer version. The [stage design](sdlc-stages.md) adapts the
schema-instruction pattern while retaining the single-plan requirement and
adding the user's discovery, DDD knowledge, and deployment stages.

OpenSpec supports project-owned schemas under `openspec/schemas/`, with
artifact IDs, output paths or globs, templates, instructions, and `requires`
dependencies. `apply.requires` selects the prerequisite artifacts;
`apply.tracks` selects a checkbox file. This is an appropriate extension point
for combining discovery and execution practices into one change workflow.
Project context and rules are prompt inputs; current documentation explicitly
distinguishes advisory operation guidance from enforceable checks. A schema DAG
represents document dependencies, not a resource-aware task scheduler or a human
approval record.
[Customization documentation](https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md)

Current upstream completion detection still describes an artifact as complete
when its output file exists; for globs, one matching file suffices. It does not
parse a review verdict or verify an approver.
[Completion detection](https://github.com/Fission-AI/OpenSpec/blob/main/src/core/artifact-graph/state.ts)

**Design implication:** use OpenSpec for artifact structure and progression.
If the pilot requires approval or evidence gates, define their records and
implement separate checks on the operation they control. An `approved.md`
artifact alone does not enforce approval. A real gate would bind the decision
to the reviewed revision and reject missing, stale, or unsuccessful evidence.
These are proposed requirements, not existing capabilities.

## LLM Wiki interpretation

Karpathy's note and Dahl's fork were read as sources here, and the reading this
repo adopted has one home:
[the wiki reading this repo adopted](knowledge.md#the-wiki-reading-this-repo-adopted),
with source identity, retrieval dates and confidence in
[knowledge patterns](research/knowledge-patterns.md). The only observation this
note adds is scoping: the exact `llm-wiki` reference intended by the user was
never confirmed, so the reading is provisional (A37).

## Verification limits

Read current primary documentation for each behavior cited above, and ran the
disposable 1.12.0 CLI probe recorded in the pilot verification. Two bounded Bun
scratch probes from the earlier research pass failed before execution with
`bun is unable to write files to tempdir: EROFS`; they establish no runtime
compatibility result. No schema activation, agent execution, or application test
was performed in this research.
