#!/usr/bin/env bash
# The precondition `steps-schema-rename`'s migration rests on: no prod release
# exists, so there is no outgoing colour to stay backward-compatible with.
#
# `20260831120000_rename_role_to_step` renames tables and columns. Blue and
# green share one SQLite file mid-swap (`AGENTS.md`, "Migrations"), so that
# migration is only safe while nothing is deployed. Once a colour is serving,
# the change this script refuses is the expand/contract pair recorded in
# `openspec/changes/steps-schema-rename/design.md` D2 — seven views and
# twenty-one triggers, not a rename.
#
# **What "the recorded release state" is here.** One state directory holding one
# `<tier>.json` per deployed tier (`tools/tool-remote-scripts/src/lib/env.ts`,
# `stateDir`). A tier's file is written by the swap and names the colour that is
# serving; a tier that was never deployed has no file. So the directory itself
# is the state, and reading it has exactly three answers:
#
#   - the directory is readable and holds no tier file -> nothing is deployed;
#   - a tier file is present -> a colour is recorded, refuse;
#   - the directory is missing or unreadable, or a tier file is present but
#     unreadable -> refuse as unreadable.
#
# The last arm is the point of the script and not a nicety. `swap.js`'s
# `readRecordedColor` shipped reading an unreadable state file as
# never-deployed on 2026-08-05, and `remote-state.ts` shipped the same fault
# with a `|| true` — `chmod 000` on one file was enough to disable a migration
# gate. Repeating it here would make this change's whole safety argument
# unfalsifiable: the migration would be allowed precisely when nobody could
# tell whether it was safe.
#
# **Absent directory refuses rather than passes**, which is the same rule one
# level up. A path that does not exist is not evidence that nothing is
# deployed; it is evidence that this script was pointed somewhere wrong, and
# reading a typo as "prod is empty" is how the migration would run against a
# live schema. The operator's fix is to name the real state directory.
#
# Prod's state lives on the deploy host, so the prod reading is taken there:
#
#   ssh h2puni 'cd /home/puni1/wbs-build && bin/assert-no-prod-release.sh /home/puni1/wbs/state'
#
# **The one override: `--override-with-ledger=<file>`.** A recorded release is
# safe for the rename only when that release predates every table the rename
# touches, which is true of exactly one ledger: the skeleton release whose
# database applied only `20260426171432_talented_smiling_tiger`. The operator
# dumps the live ledger (`SELECT name FROM __drizzle_migrations`, one name per
# line) and names the file; the override is accepted only when that file is
# readable and lists that migration and nothing else. It never excuses an
# unreadable state directory or file. docs/runbook-prod-deploy.md
# ("First product deploy") has the procedure.
#
# Proof: assert-no-prod-release.test.ts, `refuses a recorded colour`,
# `refuses an unreadable state file`, `refuses a missing state directory`,
# `passes on a never-deployed state`, and the `--override-with-ledger` cases.
# See that file for the injected faults.
set -euo pipefail

STATE_DIR=${1:?usage: assert-no-prod-release.sh <state-dir> [--override-with-ledger=<ledger-dump>]}
TIERS='be gw fe'
SKELETON_MIGRATION='20260426171432_talented_smiling_tiger'

OVERRIDE_LEDGER=''
case "${2:-}" in
  '') ;;
  --override-with-ledger=?*) OVERRIDE_LEDGER=${2#--override-with-ledger=} ;;
  *)
    printf 'assert-no-prod-release: unknown argument %s; the only option is --override-with-ledger=<ledger-dump>.\n' "$2" >&2
    exit 2
    ;;
esac
if [ "$#" -gt 2 ]; then
  printf 'assert-no-prod-release: too many arguments.\n' >&2
  exit 2
fi

if [ ! -d "$STATE_DIR" ]; then
  printf 'assert-no-prod-release: %s is not a readable state directory, so whether a prod release is deployed could not be read.\n' "$STATE_DIR" >&2
  printf '  Refusing rather than treating it as never-deployed. Name the state directory the swap writes (env.ts: stateDir).\n' >&2
  exit 1
fi
if [ ! -r "$STATE_DIR" ] || [ ! -x "$STATE_DIR" ]; then
  printf 'assert-no-prod-release: %s exists but could not be listed, so whether a prod release is deployed could not be read.\n' "$STATE_DIR" >&2
  printf '  Refusing rather than treating it as never-deployed. Fix the directory ownership/mode.\n' >&2
  exit 1
fi

recorded=''
for tier in $TIERS; do
  state_file="$STATE_DIR/$tier.json"
  if [ ! -e "$state_file" ]; then
    continue
  fi
  if [ ! -r "$state_file" ]; then
    printf 'assert-no-prod-release: %s is present but could not be read.\n' "$state_file" >&2
    printf '  Refusing rather than treating it as never-deployed: an unreadable state file would disable this gate. Fix the file ownership/mode.\n' >&2
    exit 1
  fi
  printf 'assert-no-prod-release: %s records a deployed release, so the role -> step rename must not be applied.\n' "$state_file" >&2
  printf '  %s\n' "$(cat "$state_file")" >&2
  recorded="$recorded $tier"
done

if [ -z "$recorded" ]; then
  printf 'assert-no-prod-release: %s holds no release record for be, gw or fe -- nothing is deployed.\n' "$STATE_DIR"
  exit 0
fi

if [ -z "$OVERRIDE_LEDGER" ]; then
  printf '  20260831120000_rename_role_to_step is not backward-compatible, and blue and green share one SQLite file during a swap.\n' >&2
  printf '  The change that is safe here is the expand/contract pair in openspec/changes/steps-schema-rename/design.md D2:\n' >&2
  printf '    expand  - rename, then a view per old name with INSTEAD OF triggers writing through to the new table;\n' >&2
  printf '    contract - a later release drops the views and triggers once no colour reads them.\n' >&2
  printf '  If the deployed release is the pre-product skeleton, see --override-with-ledger in docs/runbook-prod-deploy.md.\n' >&2
  exit 1
fi

if [ ! -f "$OVERRIDE_LEDGER" ] || [ ! -r "$OVERRIDE_LEDGER" ]; then
  printf 'assert-no-prod-release: override ledger %s is missing or unreadable; refusing.\n' "$OVERRIDE_LEDGER" >&2
  exit 1
fi
ledger_names=$(sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' "$OVERRIDE_LEDGER")
if [ "$ledger_names" != "$SKELETON_MIGRATION" ]; then
  printf 'assert-no-prod-release: override refused: %s must list exactly %s, the only ledger the rename cannot break.\n' "$OVERRIDE_LEDGER" "$SKELETON_MIGRATION" >&2
  printf '  It lists:\n' >&2
  sed 's/^/    /' "$OVERRIDE_LEDGER" >&2
  exit 1
fi

printf 'assert-no-prod-release: OVERRIDE ACCEPTED for recorded tier(s):%s.\n' "$recorded"
printf '  %s lists only %s: the deployed release predates every table the rename touches.\n' "$OVERRIDE_LEDGER" "$SKELETON_MIGRATION"
printf '  Keep this output and the ledger dump with the deploy record.\n'
