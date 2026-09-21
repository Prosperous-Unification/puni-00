#!/usr/bin/env bash
# The inline Bun programs are single-quoted on purpose: their `${...}` are JavaScript templates.
# shellcheck disable=SC2016
# Required admission through the package bootstrap.sh installed. Usage:
# admit.sh <bootstrap scratch> <candidate checkout> <candidate sha>, with TOOL_WIKI_ACTIVATION_ROOT
# naming the externally provisioned activation. The activation still supplies the reviewed
# validator; the package supplies the launcher and must be the toolkit that activation was
# prepared from. On certification it writes <scratch>/admission.json for deployment preparation.
set -euo pipefail

scratch_input=${1:?bootstrap scratch directory is required}
candidate_input=${2:?candidate checkout is required}
revision=${3:?candidate revision is required}

refuse() {
  printf 'twilight-burokrat admission: %s\n' "$1" >&2
  exit 78
}

if ! bun_path=$(command -v bun); then
  refuse 'bun is not installed'
fi
trusted_path=$(dirname -- "$bun_path"):/usr/bin:/bin
[[ $revision =~ ^[0-9a-f]{40}$ ]] || refuse "candidate revision must be a full commit SHA: $revision"
activation_input=${TOOL_WIKI_ACTIVATION_ROOT:-}
if [[ -z $activation_input ]]; then
  refuse 'required admission has no external activation root'
fi
if ! activation_root=$(realpath -- "$activation_input") || [[ ! -d $activation_root ]]; then
  refuse "external activation root is not a readable directory: $activation_input"
fi
if ! scratch=$(realpath -- "$scratch_input") || [[ ! -d $scratch ]]; then
  refuse "bootstrap scratch is not a readable directory: $scratch_input"
fi
if ! candidate=$(realpath -- "$candidate_input") || [[ ! -d $candidate ]]; then
  refuse "candidate checkout is not a readable directory: $candidate_input"
fi
for trusted in "$activation_root" "$scratch"; do
  case "$trusted/" in
    "$candidate/"*) refuse "trusted input resolves inside the candidate checkout: $trusted" ;;
  esac
done

installed="$scratch/consumer/node_modules/twilight-burokrat"
if ! identity=$(
  env -i PATH="$trusted_path" HOME="$scratch/home" CONSUMER="$scratch/consumer" \
    INSTALLED="$installed" "$bun_path" --cwd "$scratch/home" --no-env-file -e '
    const read = async (path) => JSON.parse(await Bun.file(path).text());
    const pin = (await read(`${process.env.CONSUMER}/package.json`)).dependencies["twilight-burokrat"];
    const installed = await read(`${process.env.INSTALLED}/package.json`);
    const packaged = await read(`${process.env.INSTALLED}/dist/package-manifest.json`);
    if (typeof pin !== "string" || installed.name !== "twilight-burokrat" ||
        installed.version !== pin || packaged.packageVersion !== pin ||
        typeof packaged.toolkitIdentity !== "string" ||
        !/^[0-9a-f]{64}$/.test(packaged.toolkitIdentity)) process.exit(1);
    process.stdout.write(`twilight-burokrat-v${pin} ${packaged.toolkitIdentity}`);
  '
); then
  refuse "installed package does not carry the base-owned pin: $installed"
fi

release="$activation_root/toolkit-release"
if [[ ! -e $release ]]; then
  refuse "activation names no toolkit release, so no package can be compatible with it: $release"
fi
if [[ ! -f $release ]] || [[ ! -r $release ]]; then
  refuse "activation toolkit release is unreadable: $release"
fi
# Proof: consumer-bootstrap.test.ts rewrites a certified activation's toolkit release to another
# toolkit identity; with this comparison removed the adapter certified the candidate at exit 0.
activation_release=$(head -n 1 -- "$release")
if [[ $activation_release != "$identity" ]]; then
  refuse "activation was prepared from another toolkit ($activation_release), not the installed package ($identity); prepare and select a new activation"
fi

report="$scratch/admission-report.json"
# Proof: consumer-bootstrap.test.ts sets a BUN_OPTIONS preload sentinel on the step; with this
# empty environment replaced by the inherited one the sentinel file was written, and the
# CI-gated gate-entrypoints.test.ts literal check failed.
if env -i PATH="$trusted_path" HOME="$scratch/home" TOOL_WIKI_ACTIVATION_ROOT="$activation_root" \
  TOOL_WIKI_REQUIRE_CERTIFIED=1 "$bun_path" run --cwd "$scratch/home" --no-env-file \
  "$installed/dist/bin.mjs" lint committed "$candidate" "$revision" >"$report"; then
  status=0
else
  status=$?
fi
cat -- "$report"
if [[ $status != 0 ]]; then
  exit "$status"
fi

env -i PATH="$trusted_path" HOME="$scratch/home" CONSUMER="$scratch/consumer" \
  INSTALLED="$installed" ACTIVATION="$activation_root" REVISION="$revision" \
  OUTPUT="$scratch/admission.json" "$bun_path" --cwd "$scratch/home" --no-env-file -e '
  const read = async (path) => JSON.parse(await Bun.file(path).text());
  const lock = Bun.JSONC.parse(await Bun.file(`${process.env.CONSUMER}/bun.lock`).text());
  const packaged = await read(`${process.env.INSTALLED}/dist/package-manifest.json`);
  const selected = await read(`${process.env.ACTIVATION}/selected.json`);
  const manifest = await read(`${process.env.ACTIVATION}/${selected.directory}/manifest.json`);
  const record = {
    schemaVersion: 1,
    sourceSha: process.env.REVISION,
    package: {
      name: "twilight-burokrat",
      version: packaged.packageVersion,
      integrity: lock.packages["twilight-burokrat"][3],
      toolkitIdentity: packaged.toolkitIdentity,
    },
    activation: { version: manifest.sourceRevision, manifestIdentity: selected.identity },
  };
  await Bun.write(process.env.OUTPUT, `${JSON.stringify(record)}\n`);
'
