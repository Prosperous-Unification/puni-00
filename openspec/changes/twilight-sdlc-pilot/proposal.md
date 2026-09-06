## Why

Twilight's workflow is described across overlapping discovery documents, while
artifact existence can be mistaken for verified completion. We need to exercise
one concrete SDLC before building the factory that will run it for users.

## What Changes

- Add an opt-in `twilight-v1` OpenSpec schema with one plan and four required
  artifact classes, preserving explicit discovery, review, and delivery stages.
- Exercise this work request through that workflow, recording assumptions,
  primary research, adversarial review, CLI probes, and observed limitations.
- Refactor Twilight documentation into linked canonical pages and a small wiki
  index. Include an optional focus profile informed by `i-have-adhd`.
- Produce a scoped FE/BE/MCP implementation plan and dependency-ordered expansion
  backlog covering configurable policy, agents, resources, and knowledge.

## Non-Goals

Implementing or deploying Twilight, changing WBS behavior, installing personal
skills, changing the default schema, or approving any production release.

## Constraints

Bun and Nx only. Preserve existing edits and canonical knowledge locations.
Use explicit assumptions instead of blocking questions, as requested. Keep
`LLM_README.md` at most 150 lines. Record observed failures before writing
`Proof:` comments. Runtime guarantees remain proposed until executed.

## Capabilities

### New Capabilities

- `twilight/sdlc`: Opt-in artifact workflow and an attributable documentation trial.
- `twilight/knowledge`: Canonical source navigation and explicit knowledge status.

### Modified Capabilities

None.

## Domain Terms

Workflow definition, workflow run, stage, activity, assumption, approval,
finding, verdict, evidence, capacity pool, budget, knowledge claim, focus brief.
Definitions: [Twilight glossary](../../../docs/twilight-structure/CONTEXT.md).

## Decisions Recorded

See [requirements and the wiki](../../../docs/twilight-structure/knowledge.md#requirements-and-the-wiki-the-boundary).

## Impact

Repository workflow configuration and documentation only. The future product
change has its own unchecked `tasks.md`; this pilot's completion does not imply
that the product exists.
