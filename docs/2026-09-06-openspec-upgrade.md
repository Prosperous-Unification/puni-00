# OpenSpec 1.12.0 upgrade

Upgraded on 2026-09-06 from 1.3.0 to **1.12.0**, the stable version returned by
the official package registry and GitHub's latest release at the time.
[Release notes](https://github.com/Fission-AI/OpenSpec/releases/tag/v1.12.0)

## Repository changes

- Pin CI and documented Bun invocations to `@fission-ai/openspec@1.12.0`.
- Run `openspec update` using that exact package version. Refresh the ten
  existing workflows for Claude Code and the shared `.agents` skill location.
- Refresh the ten `source-command-opsx-*` wrappers from the new command bodies,
  after checking that each old wrapper matched its previous generated source.
- Preserve the existing workflow selection. The CLI migrated its user-level
  configuration to a custom profile with the existing ten workflows; the new
  `propose` and `update` workflows were not added automatically.
- Keep `sdd-lean` active and retain `sdd-plus-superpowers` for existing changes.
  Update obsolete comments about `proposal.md` being required for discovery.
- Correct stale CI wording and gate commands in the active schema's rules and
  templates. This is a tooling upgrade, not activation of the proposed factory
  workflow or acceptance of its approval/knowledge policies.

No application dependency, application source, existing delta specification,
or archived change was altered. The repository continues to invoke the CLI
with Bun rather than relying on a global `openspec` installation:

```sh
bunx @fission-ai/openspec@1.12.0 --version
bunx @fission-ai/openspec@1.12.0 validate --all --json
bunx @fission-ai/openspec@1.12.0 schema validate sdd-lean
bunx @fission-ai/openspec@1.12.0 schema validate sdd-plus-superpowers
```

## Compatibility evidence

| Check                                   | Observed result                                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Old CLI baseline                        | 37 active changes passed; 0 failed; 0 main specs were present                                                                                |
| New CLI validation                      | The same 37 active changes passed; 0 failed                                                                                                  |
| Custom schema validation                | Both `sdd-lean` and `sdd-plus-superpowers` passed                                                                                            |
| Nested delta in a disposable repository | `specs/factory/discovery/spec.md` validated                                                                                                  |
| Nested spec synchronization and archive | Archive created the main spec at the same nested path and moved the change to the archive                                                    |
| Nested main-spec discovery              | Listing returned `factory/discovery`; main-spec validation passed                                                                            |
| Validator failure proof                 | Replacing `#### Scenario` with `### Scenario` produced exit 1 and one failed item; restoring the heading produced exit 0 and one passed item |

The archive probe operated only on a temporary repository. None of this
repository's changes were archived or synchronized as part of the upgrade.
Application tests and deployment checks were not run: the changed surfaces are
CLI configuration, generated agent instructions, and documentation.

## Implications for the documentation pilot

Nested context/capability paths are now available for the future pilot schema.
The existing schema's templates still describe its established paths; changing
the layout remains an explicit pilot decision, not an automatic migration.

Superpowers' task-format mismatch and progress-directory collision are
separate integration issues. Updating OpenSpec does not change those helpers.
The [workflow proposal](twilight-structure/sdd-proposal.md) records that work.
