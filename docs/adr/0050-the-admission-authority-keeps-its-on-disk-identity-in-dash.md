---
status: accepted
---

# The admission authority keeps its on-disk identity in Twilight Dash; absence is refused

The runtime lease authority moved from Twilight Burokrat to Twilight Dash
(`apps/twilight-structure/twilight-dash/cli/src/authority`). It kept Burokrat's on-disk identity
byte for byte: `<git common dir>/module-wiki/authority.sqlite`, schema `module-wiki-authority.v5`,
its generation and token identities, and the marker namespace `refs/module-wiki/publications/`.
Opening an absent store is a typed refusal that names `twilight-dash bootstrap-authority`, kept
distinct from an unreadable or corrupt store. Creation happens only through that command.

We kept the identity so that relocation needs no data migration, and so that a revert restores
code that opens every store Dash wrote. The case `the pre-relocation authority opens a
Dash-written store with identical state and continues its generations` proves the second half
against the pinned pre-relocation commit. We refuse absence because
generations are unique only within one store's lifetime. A store silently recreated after loss,
or opened in the wrong clone, restarts at generation 1, and an old `(session, generation)` token
could then match a new one: that would defeat every old-writer fence without touching the
database. Details: [design](../../openspec/changes/dash-authority-relocation/design.md).

## Considered options

- **A Dash-named store path with an adoption step.** This forces an adoption migration nobody
  needs yet, renames a store no host has, and turns rollback into a second migration.
- **A schema bump to v6 with a writer field, to fence the published Burokrat 0.1.0 binary.** This
  breaks rollback by revert and the identity promise. Its only beneficiary is a binary no host
  runs as an admission writer.

## Consequences

- A Dash-owned store is spelled `module-wiki`, and the Burokrat 0.1.0 `submit-admission` can still
  create a v5 store until a later Burokrat release drops the command. The strict schema
  comparison stays the writer fence for any future version.
