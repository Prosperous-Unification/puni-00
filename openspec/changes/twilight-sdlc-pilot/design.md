# Twilight SDLC pilot design

This is the design of the repository trial, not the runtime implementation.
The [assumptions](../../../docs/twilight-structure/assumptions.md) record this
request's autonomous discovery. The current user instruction supersedes earlier
interview pauses and skill defaults for separate plan paths or design approvals.

## Shape

Bootstrap under `sdd-lean`, author and validate `twilight-v1`, then select it only
for this trial and the new product proposal. Keep the repository default intact.
The new schema invokes brainstorming, grilling, and domain-modeling within intent;
planning uses writing-plans but redirects its output into `tasks.md`. Discovery
notes, source records, and a focus brief are linked supporting knowledge, not
additional required artifacts. A non-trivial change carries `design.md`.

The [stage guide](../../../docs/twilight-structure/sdlc-stages.md) owns the stage
mapping. Its lifecycle policy is descriptive in this pilot. OpenSpec owns its
artifact graph; a future `tool-twilight` compiler and BE transition operation will
enforce content, approvals, budgets, and evidence. No prose file is an authority
boundary. [The ADR](../../../docs/adr/0014-openspec-contracts-and-linked-knowledge.md)
records the settled split between contracts and knowledge.

## Tests and the counterexamples they need

Use the actual pinned OpenSpec 1.12.0 CLI in an isolated temporary repository.
Copy the schema and operate on disposable changes. Record argv, exit status,
stdout/stderr, time, and selected assertions. Prove missing intent/specs block
apply; then remove their direct `apply.requires` entries and observe that exact
assertion fail. Prove structural validation rejects malformed scenarios, cycles,
and missing templates. Exercise nested capability discovery and archive in the
temporary repository only. Probe empty files, checked tasks, and instruction
generation while blocked to delimit what the CLI does not enforce.

Check the actual pilot docs for local links, intent size, and the existing index
cap. Inject a broken link in a disposable copy to establish that the navigation
probe can detect it. A human/agent navigation review supplies semantic judgment;
the link parser proves only that destinations exist.

Review the product plan for requirement coverage, authority boundaries, failure
windows, and a first slice that can ship independently. Record the review's
author, findings, disposition, and limitations. No production runtime tests can
be claimed from this tabletop review.

## Knowledge refactor

Add `docs/wiki/README.md` as a context-oriented entry point over existing files.
Give `docs/twilight-structure/README.md` a short current-work entry point. Retain
`spec.md` as the user-requirement catalog; retain prior discovery answers and
dated research, labeling obsolete conclusions. Replace overlapping process
prose with navigation to the stage guide and knowledge-maintenance page.
Source notes stay under `docs/twilight-structure/research/`. Do not move glossary,
runbooks, ADRs, or WBS contracts merely to populate a wiki directory.

## Scope and review

The initial checkout is dirty, including untracked Twilight docs and workflow
upgrade edits. Snapshot pre-existing Twilight files before changes and preserve
unrelated edits. No blanket formatting or staging. Application tests/builds,
provider sessions, cloud browsers, and deployments are outside this docs/schema
trial and must be listed as unrun. The first product plan remains unchecked.

## Return paths

Broken CLI assumptions revise the schema or custom-tool plan. Broken navigation
revises wiki ownership. A review finding about authority or cost revises product
spec/design before tasks. Finish by reconciling links and recording exactly what
the trial proved; leave real change synchronization/archive to a later accepted
integration so existing work is not silently published as the main contract.
