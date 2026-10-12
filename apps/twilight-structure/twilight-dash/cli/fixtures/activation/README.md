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
