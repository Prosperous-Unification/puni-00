# SDD and knowledge structure: source findings

Inspected 2026-09-06. This is research for the documentation/workflow pilot,
not an accepted design or an activated schema. The original findings below
compare the former **1.3.0** repository pin with upstream `main`. The first
docs-only commit excluded the separately prepared upgrade; the work branch now
includes the [1.12.0 CI/skill upgrade](../2026-09-06-openspec-upgrade.md).
The pilot explicitly invokes 1.12.0 as recorded below.

Historical record: current schema behavior is freshly exercised in
[pilot verification](../../openspec/changes/twilight-sdlc-pilot/verify.md).
The requirements/wiki authority split is accepted; older text below calling it
unresolved describes the earlier research stage. Flat capability recommendations
apply to the former 1.3.0 pin, not the current nested pilot. The pattern identities
are verified in [knowledge research](research/knowledge-patterns.md).

## Upgrade follow-up

OpenSpec 1.12.0 now discovers nested spec IDs and changes without requiring a
`proposal.md` file. A disposable CLI probe verified validation, archive-driven
spec synchronization, listing, and subsequent main-spec validation for
`factory/discovery`. The flat-directory restriction below describes the old
version and no longer constrains the pilot. Existing schemas retain
`proposal.md` and existing capability paths for compatibility with their own
templates and historical changes.
[1.12.0 discovery](https://github.com/Fission-AI/OpenSpec/blob/v1.12.0/src/utils/item-discovery.ts),
[1.12.0 spec application](https://github.com/Fission-AI/OpenSpec/blob/v1.12.0/src/core/specs-apply.ts)

Artifact existence still does not establish human approval or verified runtime
evidence; the version upgrade changes discovery, not authority.

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
for this repo's newer versions. The [stage design](sdlc-stages.md) adapts the
schema-instruction pattern while retaining the single-plan requirement and
adding the user's discovery, DDD knowledge, and deployment stages.

OpenSpec supports project-owned schemas under `openspec/schemas/`, with
artifact IDs, output paths or globs, templates, instructions, and `requires`
dependencies. `apply.requires` selects the prerequisite artifacts;
`apply.tracks` selects a checkbox file. This is an appropriate extension point
for combining discovery and execution practices into one change workflow.
Project context and rules are prompt inputs; current documentation explicitly
distinguishes advisory operation guidance from enforceable checks.
[Customization documentation](https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md)

The pinned schema model accepts custom artifact IDs and generated filenames;
the graph validates duplicate IDs, dependency references, and cycles. A schema
DAG represents document dependencies, not a resource-aware task scheduler or
human approval record.
[1.3.0 artifact types](https://github.com/Fission-AI/OpenSpec/blob/v1.3.0/src/core/artifact-graph/types.ts),
[schema validation](https://github.com/Fission-AI/OpenSpec/blob/v1.3.0/src/core/artifact-graph/schema.ts)

In 1.3.0, `detectCompleted` considers an artifact complete when its output file
exists; for globs, one matching file suffices. It does not parse a review
verdict or verify an approver. The current upstream implementation still
describes completion in terms of output existence.
[1.3.0 completion detection](https://github.com/Fission-AI/OpenSpec/blob/v1.3.0/src/core/artifact-graph/state.ts),
[current completion detection](https://github.com/Fission-AI/OpenSpec/blob/main/src/core/artifact-graph/state.ts)

The pinned apply-instruction generator checks required outputs and parses the
tracking file. Missing artifacts or absent/empty task lists produce a blocked
state; completed checkboxes produce `all_done`. This is guidance for an agent,
not execution of tests, review acceptance, or prevention of direct file edits.
The validation command validates specs and delta specs; it does not establish
those external outcomes.
[1.3.0 apply instructions](https://github.com/Fission-AI/OpenSpec/blob/v1.3.0/src/commands/workflow/instructions.ts),
[validation command](https://github.com/Fission-AI/OpenSpec/blob/v1.3.0/src/commands/validate.ts)

**Design implication:** use OpenSpec for artifact structure and progression.
If the pilot requires approval or evidence gates, define their records and
implement separate checks on the operation they control. An `approved.md`
artifact alone does not enforce approval. A real gate would bind the decision
to the reviewed revision and reject missing, stale, or unsuccessful evidence.
These are proposed requirements, not existing capabilities.

## Paths and monorepo contexts

The installed 1.3.0 discovery code looks for `proposal.md` to discover active
and archived changes. Renaming its artifact ID to `intent` is compatible with
keeping that output filename, which this repository already does.
Renaming the file itself would hide the change from that discovery path.
[1.3.0 change/spec discovery](https://github.com/Fission-AI/OpenSpec/blob/v1.3.0/src/utils/item-discovery.ts),
[repository configuration](../../openspec/config.yaml)

The same version discovers main specs one directory below `openspec/specs/`.
Its `findSpecUpdates` scans `changes/<change>/specs/<capability>/spec.md` and
maps each to `openspec/specs/<capability>/spec.md`. A custom artifact glob does
not make that merger recursive: `specs/<context>/<capability>/spec.md` is
outside the layout that this code discovers.
[1.3.0 spec application](https://github.com/Fission-AI/OpenSpec/blob/v1.3.0/src/core/specs-apply.ts)

Current upstream source has recursive capability discovery and paths relative
to the specs root. Current agent workflow documentation also identifies the
artifact named `specs` as the source of spec-sync outputs. These newer surfaces
must not be assumed to exist in the pinned CLI or generated local skills.
[Current spec application](https://github.com/Fission-AI/OpenSpec/blob/main/src/core/specs-apply.ts),
[current sync input contract](https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md#archive-and-spec-sync-input-safety)

**Pilot recommendation:** retain flat, context-prefixed capability IDs such as
`wbs-resource-planning` and `twilight-agent-sessions`, with DDD context pages
linking to them. Keep the artifact ID `specs` and the existing `proposal.md`
output. A nested spec layout requires an explicit upgrade/adapter decision and
compatibility checks across discovery, validation, sync, and archive.

## LLM Wiki interpretation

Karpathy's note is an adaptable knowledge-management pattern, not an installed
product or a prescribed DDD directory tree. It separates preserved source
material, an agent-maintained Markdown wiki, and rules governing maintenance.
Ingestion updates source summaries and related pages; queries produce cited
answers that can become knowledge pages; maintenance checks contradictions,
staleness, missing links, and gaps. `index.md` is a content catalog;
`log.md` is an append-only chronology of operations. Exact directories and
page formats are intentionally left to the implementation.
[Original LLM Wiki note](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

**Proposed adaptation:** organize wiki knowledge by bounded context and use
context-qualified vocabulary. Preserve source provenance, distinguish
assumptions from accepted decisions and verified findings, and link to
canonical specs instead of copying contracts into wiki summaries. Reconcile
contradictions through an explicit change; an ingestion should not silently
revise an accepted requirement. DDD ownership and these authority rules are
our additions, not claims made by the original note. The exact `llm-wiki`
reference intended by the user remains unconfirmed.

## Original research verification limits

Read current primary documentation and inspected the cached installed
`@fission-ai/openspec@1.3.0` implementation for each pinned behavior above.
Two bounded Bun scratch probes failed before execution with
`bun is unable to write files to tempdir: EROFS`; they establish no runtime
compatibility result. No dependency upgrade, schema activation, spec sync,
archive, agent execution, or application test was performed in this research.
