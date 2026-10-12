# Activation fixtures

Fixtures that pin the observation store's on-disk identity across the activation controller's
move from Twilight Burokrat to Twilight Dash. Each was produced once by the pre-relocation code at
source commit `802c26bd8`, the S0 split of WBS a81d93a0 and the last whose Burokrat package held
`activation-controller/observation-state.ts`. Tests never regenerate them. The dumps are not
named `.sql`: every tracked `.sql` file is a migration, and migration lint refuses one outside a
migration tree.

| File                               | What it is                                                                                          | Read by                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------- |
| `activation.v10.sqlite-dump`       | `sqlite3 .schema` of a store the pre-relocation code initialized and migrated, plus `user_version`  | `schema-golden.test.ts` |
| `burokrat-written-v10.sqlite-dump` | `sqlite3 .dump` of a v10 store with one complete and one provider-failure attempt, plus the version | `schema-golden.test.ts` |
| `burokrat-written-v10.state.json`  | that store's observation rows and the bootstrap, binding and policy it was written under            | `schema-golden.test.ts` |
| `pre-relocation-activation.tar`    | the pre-relocation observation store and controller source, for the rollback proof                  | `rollback.db.test.ts`   |

`sqlite3 .dump` omits `user_version`, so both dumps end with an appended
`PRAGMA user_version=10;`. They were produced with SQLite 3.45.1 and Bun 1.4.2 as follows, from
the repository root. The output directory must be `0700` and its ancestors not
group- or world-writable, because the store refuses a replaceable ancestor.

```sh
git worktree add --detach /tmp/claude-1000/s3/pre 802c26bd8
ln -s "$PWD/node_modules" /tmp/claude-1000/s3/pre/node_modules
# Write the producer from the change's verify record to
# apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/produce-activation-fixture.ts
# inside that worktree, then:
mkdir -m 0700 -p /tmp/claude-1000/s3/out
cd /tmp/claude-1000/s3/pre/apps/twilight-structure/twilight-burokrat/cli
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT GOLDEN_OUTPUT=/tmp/claude-1000/s3/out \
  bun src/activation-controller/produce-activation-fixture.ts
cd /tmp/claude-1000/s3/out
sqlite3 fresh/activation.sqlite .schema > activation.v10.sqlite-dump
printf 'PRAGMA user_version=10;\n' >> activation.v10.sqlite-dump
sqlite3 written/activation.sqlite .dump > burokrat-written-v10.sqlite-dump
printf 'PRAGMA user_version=10;\n' >> burokrat-written-v10.sqlite-dump
```

The producer writes `burokrat-written-v10.state.json` itself. Its source and the SHA-256 of each
file are in
[the change's verify record](../../../../../../openspec/changes/dash-activation-relocation/verify.md).

## Rollback archive

`pre-relocation-activation.tar` has SHA-256
`3c0ee3fecd16a45e47b97b190db3debce02b40d3bed8ad894848c424501a3c2d` (696,320 bytes, 33 files).
`rollback.db.test.ts` refuses any other digest and any missing archive. It is the exact output of
this command, run from the repository root:

```sh
B=apps/twilight-structure/twilight-burokrat/cli/src
A=$B/activation-controller
git archive --format=tar 802c26bd8579f61134545ef4832d759c151bf9fa -- \
  $A/bootstrap.ts $A/check-launch.ts $A/check-manifest.ts $A/check-stage.ts $A/controller.ts \
  $A/github-reader.ts $A/github-source.ts $A/ingress.ts $A/observation-state.ts $A/request.ts \
  $B/admission-judge/authority-identities.ts $B/admission-judge/integration-candidate.ts \
  $B/admission-judge/packet-codec.ts $B/admission-judge/packet-judgment.ts \
  $B/contracts/canonical.ts $B/contracts/decode-record.ts $B/contracts/navigator-records.ts \
  $B/contracts/records.ts $B/evidence/content-manifest.ts $B/inventory/classify-entries.ts \
  $B/inventory/read-candidate.ts $B/judge-facade.ts $B/relationships/declarations.ts \
  $B/relationships/index.ts $B/relationships/nx.ts $B/relationships/typescript.ts \
  $B/review/audit.ts $B/review/exhaustive-coverage.ts $B/review/invocation-journal.ts \
  $B/review/protocol.ts libs/shared/domain/validation/src/core.ts \
  libs/shared/domain/validation/src/errors.ts libs/shared/domain/validation/src/index.ts \
  > pre-relocation-activation.tar
```

The paths are the runtime import closure of the old `activation-controller/observation-state.ts`
and `activation-controller/controller.ts` (type-only imports elided, as Bun elides them), plus
`@shared/validation` at the same commit. At `802c26bd8` the controller imports `../judge-facade`,
so the closure holds the facade and every judge module it re-exports; no narrower set loads. Only
`arktype`, `typescript`, `yaml` and Bun's built-ins resolve from the workspace. The archive is
vendored so the proof needs no repository history: a squash, rebase or garbage collection of the
source commit cannot break it.
