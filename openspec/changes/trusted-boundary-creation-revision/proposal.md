# Trusted boundary creation revision

## Problem

Every Tool Wiki pilot boundary's `baselineEntries` must be real tuples at the pilot's frozen
`sourceRevision` (`7851161b`), reached through a `sourceSelector` naming a predecessor. Plan import
and Plan document were created after that freeze and were never renamed from anything, so no
predecessor exists. An empty baseline is refused (`trusted boundary baseline is empty`) and a
baseline built from current content fails the frozen-revision comparison. Both modules stayed
unregistered (WBS 080.21, triage 080.22), and any later module would hit the same block.

## Outcome

A trusted boundary may declare `creationRevision`, the commit that first added its files, instead
of a `sourceSelector`. Its baseline is the selector's tuples at that commit. The trusted loader
refuses a creation revision that is absent or not a commit, selects nothing, is not the first
commit to add the files, or disagrees with the baseline. It also refuses a boundary whose files
existed at the freeze, which must name a predecessor instead, a boundary that declares both, and
a creation revision without a pilot. A valid new module receives the same observe-mode admission
as every other pilot boundary. Plan import and Plan document register this way, and the
module-label check's unregistered list becomes empty.

## Non-goals

- Certification. A creation boundary's baseline is not in the authority's reviewed snapshot at
  `sourceRevision`, so `reviewedBinds` stays false and the policy cannot certify. The pilot is
  observe-only today.
- Relocation. `prepare-relocation-activation` still reconciles every baseline against the reviewed
  snapshot, so by reading it refuses a policy that carries a creation boundary with `R8` until
  relocation learns creation revisions. No test exercises that path yet.
- Changing existing predecessor registrations.

## Constraints

Admission reads Git history from the candidate repository, so the creation revision, its parents
and `sourceRevision` must be present there. The pilot test's full clone and CI's checkout already
need `sourceRevision`.
