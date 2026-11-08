# Private main integration — 2026-11-05

This checkpoint combines published PR862 and PR861 with exact main
`ef860787320c888c1e308ba64c19c6636b21d01b`. It does not adopt the proposed
architecture on main. The main merge is
`930d621f425652e27f01f07e0b1c387fd85b3e94`, with source parent
`f739300f2afd5ec5ba5dd051c5be84fbade4cf77` (the sibling-fix merge plus the
five-document fourth-epoch contract). No force push or primary-workspace switch
occurred. Source was clean when the mechanical integration receipt was frozen;
the later five-path frontend correction has its own evidence epoch.

## Exact integration and dependencies

The two conflicts were `docs/wiki-policy/bootstrap-policy.json` and
`docs/wiki-policy/policy.json`. Each retains all ten incoming Postgres and nine
dependency evidence declarations, with495/515 unique paths respectively.
Feature content rules and boundaries remain. All other incoming paths merged
without manual source edits. Main's CTT0.13 caller API migration and exact pin/
lock update remain together; the feature's independent @ark/schema patch remains.

Measured resolved inputs:

- `package.json`: 4992 bytes, SHA256 `0b635ebde6513e9bce36d000bbd04fc3cc817ff49074af8e5e3219910a97f131`.
- `bun.lock`: 534113 bytes, SHA256 `48b5cea4e2ac740d300f4e41cc705dfb5213210c4db378f8cdf65640fb695adb`.

The prior node_modules was only a symlink to the older install. Only that link
was removed; its target remained untouched. An owned real directory was installed
with pinned Bun1.4.4 and `bun install --frozen-lockfile`: exit0,1498 packages,
actual CTT0.13.0. Both input identities above remained unchanged afterward.
The first normal commit-hook attempt failed lint while it still saw old0.12
API types. After the owned frozen install the normal hooks passed; no source
suppression, bypass or stale dependency substitution was used. Tool Wiki's
external activation remained inactive; that hook did not certify activation.

## Focused actual commands

Child umask022; PATH pins Bun and Node24.20 before system binaries; owned TMPDIR
is `tmp/puni-delivery-evidence/20261105/main-union-install`. The install used a
private cache beneath it and a cleared environment retaining actual HOME/PATH.
Test commands below use that controlled environment and actual installed Bun.
The60000ms default is the existing Dash/Burokrat project test contract; individual
case allocations remain unchanged.

```sh
env -i PATH=/home/df/.bun/bin:/home/df/.volta/tools/image/node/24.20.0/bin:/usr/bin:/bin HOME=/home/df TMPDIR=$PWD/tmp/puni-delivery-evidence/20261105/main-union-install BUN_INSTALL_CACHE_DIR=$PWD/tmp/puni-delivery-evidence/20261105/main-union-install/bun-cache /home/df/.bun/bin/bun install --frozen-lockfile
```

```sh
bun test --no-env-file --config=/tmp/puni-initial-empty-bunfig.toml --preload ./tools/test/scratch/preload.ts tools/tool-devsync/src/toolchain-pins.test.ts --test-name-pattern=the owner-maintained libraries
```

```sh
bun test --no-env-file --config=/tmp/puni-initial-empty-bunfig.toml --preload ./tools/test/scratch/preload.ts --preload ./apps/twilight-structure/twilight-dash/cli/src/runs/testing/format4-lifetime-preload.ts --preload ./apps/twilight-structure/twilight-dash/cli/src/runs/testing/format5-lifetime-preload.ts apps/twilight-structure/twilight-dash/cli/src/coordination/topology.test.ts apps/twilight-structure/twilight-dash/cli/src/coordination/run-coordinator.test.ts apps/twilight-structure/twilight-dash/cli/src/coordination/run-coordinator.db.test.ts apps/twilight-structure/twilight-dash/cli/src/runs/postgres/deadline.test.ts apps/twilight-structure/twilight-dash/cli/src/runs/postgres/session.test.ts --timeout=60000
```

```sh
bun test --no-env-file --config=/tmp/puni-initial-empty-bunfig.toml --preload ./tools/test/scratch/preload.ts apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts apps/twilight-structure/twilight-burokrat/cli/src/inventory/classification.test.ts --timeout=60000
```

Observed terminal receipts:

- `toolchain_pins`: 5 pass, 0 fail, 6 assertions, 1 files.
- `dash_focused`: 97 pass, 0 fail, 337 assertions, 5 files.
- `wiki_policy_focused`: 60 pass, 0 fail, 840 assertions, 2 files.

The policy run took222.57s and joined naturally. No real PostgreSQL URL or
external database tests ran; the new deadline/session controls above are the
non-database consumers. These focused checks do not qualify the full new
PostgreSQL integration or replace required project/gate checks.

## Retained receipts and limits

Local mechanical receipt `/tmp/puni-main-union-implementation-20261105.json`,
SHA256 `1f7398c9b2c60c27aa81aea1ec2cf89d7cbdf97b5df21965d4b4969f5e668b65`.
Raw log SHA256 values, independently checked while writing this record:

- `first_normal_hook_attempt`: `b365306efb2eee7a0f68a7160eff875f85f9ef354ddb686442feb3d15be7714c`.
- `frozen_install`: `4b528fe1aba0ea3baf3a030503f19f3a47140b2e90225a9ba3db02ce6feb02fd`.
- `normal_hook_commit_after_install`: `656288a92249a603816e23a522dc5a7561cebd06827f1aa60eda515a91169779`.
- `toolchain_pins`: `8c9ce689cb8f81628187577591a3751f0be0cdfc88d2667d63119d0bc126465a`.
- `dash_focused`: `6187f6a6324d892150988615a90f04d2f5794e193c21fdccb3d3f5ed51cd286c`.
- `wiki_policy_focused`: `31e964ee6be97ee14c5e1633229af99abc5bd8a200f433bde4141ae8440de9d2`.

These private local paths are not committed logs or promises of availability on
another host. Architecture reviews are local preparation:
`/tmp/puni-main-union-architecture-review-20261105.md` and
`/tmp/puni-main-ctt13-architecture-review-20261105.md`.

The exact five frontend compatibility paths still require their actual current
pair correction and independently reviewed proofs. Current-response qualification
requires the hosted actual Vite producer/captured bytes/canonical manifest and
unchanged inspectors; none ran here. Full same-head storage69/rest/peers/aggregate,
remaining configured remote checks, canonical h2 gate, separate private acceptance,
architectural main adoption and deployment remain open. Existing UC2 owner-drop
failures are not repaired by integrating main or splitting CI capacity.

## Configured project statics

On the owned CTT0.13 installation, Root ran the unchanged configured targets:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false node node_modules/nx/dist/bin/nx.js run-many -p twilight-dash,twilight-burokrat -t typecheck,lint --parallel=2 --skip-nx-cache
```

Bun/Node PATH and umask022 as above; independent owned
`main-union-statics/nx-workspace` and `main-union-statics/nx-cache` directories.
Original session82364 terminal exit0: all four type/lint targets passed uncached
in43.6s. No source edit was made by these checks. This was independent of Sol's
separate five-path frontend work; it is not final remote-source qualification.
Log `tmp/puni-delivery-evidence/20261105/main-union-statics/configured.log`,
SHA256 `2169c2015fea1fff1f9d93c96185bb3fa9d4bd116a27f93c812afefb34baf000`.
