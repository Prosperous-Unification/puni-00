# Twilight Structure

The software factory context in `puni-00`. Its vocabulary describes the work
of creating and delivering software through the factory.

## Language

**Twilight Structure**:
The software factory service that helps build the other software in this monorepo.
Its repository name is `twilight-structure`.

**Work request**:
A requested software outcome that enters the factory's discovery process.
It precedes the specifications and work plan needed to deliver that outcome.

**Work plan**:
The decomposition of specified work into tasks, dependencies, resource needs,
and decisions about which work can usefully proceed in parallel.

**Client repository**:
The client's monorepo containing its software projects and the knowledge,
requirements, and plans used to develop them. `puni-00` is the first such consumer.
_Avoid_: WBS project, tenant database

**Repository template**:
The versioned common structure and delivery conventions instantiated by client
repositories and evolved through the same workflow in `puni-00`.
_Avoid_: Golden fork, copied setup

**Planning revision**:
An identified, complete version of a repository's accepted work plan.
_Avoid_: Current files, workflow checkpoint

**Planning task**:
A stable unit of planned work that remains identifiable across display-number
changes, moves, and archival.
_Avoid_: Session, Backlog number

**Workflow definition**:
The versioned description of how a work request proceeds through stages and
which obligations govern that work.
_Avoid_: Prompt chain, work plan

**Workflow run**:
One attempt to carry a work request through a particular workflow definition.
_Avoid_: Session, project

**Stage**:
A delivery boundary with a purpose, prerequisites, and a completion decision.
_Avoid_: Step (a WBS term), agent

**Activity**:
A bounded piece of work within a stage, performed by a person, agent, or tool.
_Avoid_: Stage, session

**Assumption**:
A provisional answer used to advance work, with an owner and a condition that
requires revisiting it. It is neither an observed fact nor a person's approval.

**Approval**:
An authorized person's decision about an identified action and the exact material
that decision covers.
_Avoid_: Verdict, checkbox

**Finding**:
A reviewer's attributed concern, linked to the material reviewed and its eventual
disposition.

**Verdict**:
A judge's attributed assessment of findings against a stated rubric.
_Avoid_: Approval

**Evidence**:
An attributable observation about identified work, sufficient to inspect the
claim it supports and the circumstances in which it was observed.
_Avoid_: Assertion, progress

**Capacity pool**:
A bounded supply of an execution resource shared by competing activities.
_Avoid_: Budget, availability

**Budget**:
The authorized ceiling on consumption for a defined scope of work.
_Avoid_: Estimate, capacity

**Knowledge claim**:
A sourced statement retained for future work, with an explicit status and an
owning context.
_Avoid_: Requirement, instruction

**Focus brief**:
A compact view of the current outcome, next action, decisions, and stopping point
that helps someone start or resume work.
_Avoid_: Work plan, reduced workflow
