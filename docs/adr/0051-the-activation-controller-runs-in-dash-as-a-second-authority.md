---
status: accepted
---

# The activation controller runs in Twilight Dash as a second authority and keeps the observation store identity

The activation controller, its observation tick and service, review retrieval, selection and
attestation, and the review invoker's runtime moved from Twilight Burokrat to Twilight Dash
(`apps/twilight-structure/twilight-dash/cli/src/{activation,review}`). They poll GitHub, spawn
review harnesses, hold a token and read clocks, which a static judge must not do. Dash reaches
Burokrat only through `@twilight-burokrat/judge`.

The controller is Dash's second authority, beside the admission authority of
[ADR 0050](0050-the-admission-authority-keeps-its-on-disk-identity-in-dash.md). The two are two
processes with two stores in two trust domains: a service account with a provider token against a
per-clone operator. They share no table, no lock and no account. Their only shared code is
`src/clock.ts` and the refusal line in `entrypoint.ts`.

The observation store kept its identity byte for byte: `<stateDirectory>/activation.sqlite`, the
`activation_*` tables at `user_version 10`, and `observation.lock`. Creation and migration happen
only through `twilight-dash bootstrap-observation` and `migrate-observation`, which refuse an
absent, unreadable, existing, current or unsupported store by type before taking the lock. We kept
the identity so that relocation needs no data migration and a revert restores code that opens
every store Dash wrote. The case `the pre-relocation controller opens a Dash-written v10 store and
continues its attempt sequence` proves the second half against a vendored archive of the
pre-relocation source.

The `prepare-activation` check runners stay in Burokrat. The packed suite runs them from the
installed `bin.mjs`, so a released binary must prepare the archive, and moving them needs a
receipt protocol for recorded check instants first. The observation launcher is a second
composition root that `twilight-dash:build` bundles, not a `runDash` command, because systemd pins
one launcher file and an `env -i` argv. Details:
[design](../../openspec/changes/dash-activation-relocation/design.md).

## Considered options

- **One Dash daemon owning both stores.** It merges a service token and a per-clone operator into
  one trust domain, and couples the controller's polling cadence to admission's lock.
- **Merge the observation tables into the admission authority's store.** One store lives in each
  clone's Git common directory, the other in the service's state directory; a merge forces a data
  migration and breaks rollback by revert.
- **A Dash-named store with an adoption step.** It renames a store no host has, and turns
  rollback into a second migration.
- **Move the `prepare-activation` runners too.** The packed suite would lose the commands it
  runs from the released binary, before any receipt protocol records their instants.
- **A `twilight-dash observe-activation` command as the launcher.** systemd would then pin the
  whole Dash CLI and its argv grammar instead of one bundled file.

## Consequences

- Burokrat holds no clock read outside the two `prepare-*` runners, and its npm surface is
  unchanged, including `validate-review-provenance`.
- An observation install now runs `twilight-dash:build` for the launcher digest,
  `render-observation-units`, then `bootstrap-observation`. The units are named
  `twilight-dash-observation.{service,timer}`.
- The strict schema comparison in the observation store stays the writer fence for any future
  version, so a schema change needs a new golden fixture and a new rollback proof.
