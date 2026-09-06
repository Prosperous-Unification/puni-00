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
The [SDLC stage map](twilight-structure/sdlc-stages.md) records that work; the
pre-pilot `sdd-proposal.md` it used to point at was deleted as a redirect.

## Reproducing the repository workflows

The [review hardening change](../openspec/changes/twilight-review-hardening/proposal.md)
adds `tool-workflows`. Its sources are the existing ten
`.agents/skills/openspec-*/SKILL.md` files and ten
`.agents/skills/source-command-opsx-*/SKILL.md` wrappers. These two forms have
intentional differences in prompts and examples. There is no second template
corpus. The archive-input block in `openspec-archive-change` owns archive and bulk
archive policy; the required-artifact loop in `openspec-ff-change` owns fast-forward
traversal guidance. Generation propagates those blocks into the other forms.

```sh
bunx nx run tool-workflows:generate
bunx nx run tool-workflows:check
bunx nx run-many -t test lint typecheck --projects=tool-workflows
```

Generation normalizes Markdown and renders all 40 installed paths, preserving
Claude's `/opsx:*` invocations and shared skills' `/openspec-*` invocations. Much of
the initial generated diff is formatting. `skills-lock.json` has no OpenSpec
entries and remains unchanged. Other vendored skills are outside this tool.

Every generated copy carries one line under its frontmatter naming the file to
edit instead — `<!-- Generated by tool-workflows from <source>; edit that file,
not this copy. -->`. Twenty of the forty paths are canonical sources as well as
outputs, so without it a reasonable person edits the copy and the next generation
run silently reverts the edit. The line is stripped when a source is read and
re-added when it is written, so it does not accumulate. The four `.agents` files
that carry one are the three archive-policy recipients and the fast-forward
wrapper; the twenty `.claude` paths carry one because they are wholly generated.
The archive skill itself carries none: it owns the block.

### The skill and the command are different documents

`.claude/skills/openspec-<name>/SKILL.md` and `.claude/commands/opsx/<name>.md`
are **not** two renderings of one text. Upstream OpenSpec ships them as two source
forms — `openspec-*` and `source-command-opsx-*` — with intentionally different
prompts and examples, and `tool-workflows` preserves that split rather than
collapsing it. Measured on 2026-09-06 (`wc -l`, and `comm` over the heading sets):

| Workflow        | Skill lines | Command lines | Headings in one and not the other                                                               |
| --------------- | ----------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `explore`       | 349         | 231           | skill only: `## Handling Different Entry Points` (108 lines), `## What We Figured Out`          |
| `archive`       | 194         | 239           | command only: `## Archive Complete`, `## Archive Complete (with warnings)`, `## Archive Failed` |
| the other eight | 88-583      | 83-579        | none; the bodies still differ in wording                                                        |

So `/opsx:explore` does not get the skill's entry-point handling, and the archive
skill does not get the command's output templates. **This is upstream's shape and
this change does not alter it**: generation propagates only the two shared policy
blocks (archive inputs, fast-forward traversal). An earlier claim that the two
forms were at parity compared the renamed invocations, not the behaviour; that
claim is corrected in
[the hardening change's verification](../openspec/changes/twilight-review-hardening/verify.md).
Bringing the two into alignment would be a change to the upstream sources and
needs its own review, not a generator flag.

Edit the owning `.agents` source, then regenerate. For a future upstream upgrade,
run the pinned OpenSpec update in a disposable checkout, review its changes into
these sources, and regenerate here. Running upstream update directly here can
overwrite repository policy; the consistency check is not a semantic policy review.
New workflow names require an explicit inventory entry and reviewed provider
metadata in `tools/tool-workflows/src/generate.ts`; unknown source names fail, and
so does any file added under a generated output root that the generator did not
compute. Formatting comes from the repository's own `.prettierrc.json`, read at
generation time — an absent, unreadable or malformed one stops the run rather than
falling back to defaults that would then disagree with `nx format:check`.

The uncached `lint` target depends on the uncached `check` target, so CI's existing
`run-many -t test lint typecheck build` checks the actual files on every gate.
Missing and unreadable sources fail before generation writes. Checking also fails
on absent, unreadable or divergent installed variants. The typecheck compiles both
source and test files. Ordinary tests use local fixtures and require no OpenSpec
installation or network access.

The separate integration target requires `OPENSPEC_CLI` to name an already installed
**1.12.0** `bin/openspec.js`; it verifies the version and invokes that CLI in a
disposable repository. CI runs it as its own step (`OpenSpec schema graph (pinned
CLI)`), which installs the pin into a scratch directory first, because
`run-many` cannot reach a target that refuses to start without that variable.
Locally, install the pinned package explicitly with
`bunx @fission-ai/openspec@1.12.0 --version` if necessary, then run:

```sh
OPENSPEC_CLI=/absolute/path/to/@fission-ai/openspec/bin/openspec.js bunx nx run tool-workflows:integration
```

The integration cases probe the pinned CLI's answers rather than the schema file.
With `design` removed from twilight-v1's `tasks.requires`, `status --json` reported
the tasks artifact `ready` where the test expects `blocked` (`Expected: "blocked" /
Received: "ready"`). With `verify` added to `apply.requires`, `instructions apply
--json` reported `blocked` where the test expects `ready` (`Expected: "ready" /
Received: "blocked"`) — verify.md is a handoff and archive obligation under
twilight-v1, not an apply prerequisite. Under twilight-v1 `design.md` is always
present; for a mechanically obvious change it is an `## Applicability` section and
nothing else, and the CLI accepts that. The generator regression failed with its
comparison removed (`expected exit 1, received 0`); restored checks reject
corrupted, deleted and chmod-000 fixtures. These are workflow tooling results, not
runtime acceptance or authorization to archive or deploy.
