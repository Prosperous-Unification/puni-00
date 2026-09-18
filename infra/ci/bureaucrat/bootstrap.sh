#!/usr/bin/env bash
# The inline Bun programs are single-quoted on purpose: their `${...}` are JavaScript templates.
# shellcheck disable=SC2016
# Installs the base-owned Twilight Bureaucrat pin into a fresh runner scratch directory, before any
# candidate byte is read. Usage: bootstrap.sh <base-owned bootstrap directory> <new scratch path>.
# Stdout is `key=value` lines for `$GITHUB_OUTPUT`; every diagnostic goes to stderr.
# Contract and staging: docs/runbook-tool-wiki-activation.md, "Package-backed admission".
set -euo pipefail

bootstrap_input=${1:?base-owned bootstrap directory is required}
scratch_input=${2:?bootstrap scratch directory is required}

refuse() {
  printf 'twilight-bureaucrat bootstrap: %s\n' "$1" >&2
  exit 78
}

if ! bun_path=$(command -v bun); then
  refuse 'bun is not installed'
fi
trusted_path=$(dirname -- "$bun_path"):/usr/bin:/bin
if ! bootstrap=$(realpath -- "$bootstrap_input") || [[ ! -d $bootstrap ]]; then
  refuse "bootstrap directory is not a readable directory: $bootstrap_input"
fi
# Proof: consumer-bootstrap.test.ts reruns the adapter over an existing scratch path; with this
# refusal removed (and the child mkdir made tolerant) the rerun installed over it at exit 0, so a
# reused directory could carry an earlier install's node_modules forward.
if [[ -e $scratch_input ]]; then
  refuse "scratch directory already exists: $scratch_input"
fi
mkdir -p -- "$scratch_input"
chmod 0700 -- "$scratch_input"
scratch=$(realpath -- "$scratch_input")
case "$scratch/" in
  "$bootstrap/"*) refuse 'scratch directory must be outside the bootstrap directory' ;;
esac
mkdir -m 0700 -- "$scratch/consumer" "$scratch/home" "$scratch/cache"

# Every Bun below runs with an empty environment from an empty directory, so no inherited
# BUN_OPTIONS, registry variable, bunfig.toml or .npmrc can steer it.
# Proof: with `env -i` replaced by `env`, consumer-bootstrap.test.ts's inherited BUN_OPTIONS
# preload wrote its sentinel, and the CI-gated gate-entrypoints.test.ts literal check failed.
trusted_bun() {
  env -i PATH="$trusted_path" HOME="$scratch/home" BUN_INSTALL_CACHE_DIR="$scratch/cache" \
    "$@"
}

config="$bootstrap/consumer.json"
if [[ ! -e $config ]]; then
  refuse "consumer configuration is absent: $config"
fi
if [[ ! -f $config ]] || [[ ! -r $config ]]; then
  refuse "consumer configuration is unreadable: $config"
fi
# Proof: consumer-bootstrap.test.ts supplies an unknown admission value, an extra key and a
# non-loopback plain-HTTP registry; with these field checks removed the unknown admission value
# fell through to the package route and exited 0 instead of 78.
if ! selection=$(
  trusted_bun CONFIG="$config" "$bun_path" --cwd "$scratch/home" --no-env-file -e '
    const value = JSON.parse(await Bun.file(process.env.CONFIG).text());
    const keys = Object.keys(value).sort();
    const registry = /^(https:\/\/[a-z0-9.-]+(:[0-9]+)?\/([a-z0-9._-]+\/)*|http:\/\/127\.0\.0\.1:[0-9]+\/)$/;
    if (JSON.stringify(keys) !== JSON.stringify(["admission", "registry", "schemaVersion"]) ||
        value.schemaVersion !== 1 ||
        !["archive-launcher", "installed-package"].includes(value.admission) ||
        typeof value.registry !== "string" || !registry.test(value.registry)) process.exit(1);
    process.stdout.write(`${value.admission}\n${value.registry}\n`);
  '
); then
  refuse "consumer configuration is malformed: $config"
fi
admission=${selection%%$'\n'*}
registry=${selection#*$'\n'}
registry=${registry%$'\n'}

if [[ $admission == archive-launcher ]]; then
  printf 'route=archive-launcher\n'
  exit 0
fi

manifest="$bootstrap/package.json"
lock="$bootstrap/bun.lock"
if [[ ! -f $manifest ]] || [[ ! -r $manifest ]]; then
  refuse "base-owned bootstrap manifest is absent or unreadable: $manifest"
fi
# Proof: with this refusal removed `bun install --frozen-lockfile` resolved the pin from the
# loopback registry with no lock and exited 0 (consumer-bootstrap.test.ts); in the CI-gated
# gate-entrypoints.test.ts it reached npmjs and failed on the wrong refusal instead.
if [[ ! -e $lock ]]; then
  refuse "base-owned bootstrap lock is absent: $lock (publish, then pin, then flip)"
fi
if [[ ! -f $lock ]] || [[ ! -r $lock ]]; then
  refuse "base-owned bootstrap lock is unreadable: $lock"
fi

# Proof: consumer-bootstrap.test.ts gives the base manifest a `preinstall` sentinel; with this
# refusal removed the frozen install exited 0, and with `--ignore-scripts` also removed below the
# sentinel was written.
if ! pin=$(
  trusted_bun MANIFEST="$manifest" "$bun_path" --cwd "$scratch/home" --no-env-file -e '
    const value = JSON.parse(await Bun.file(process.env.MANIFEST).text());
    const keys = Object.keys(value).sort();
    const dependencies = value.dependencies;
    if (JSON.stringify(keys) !== JSON.stringify(["dependencies", "name", "private"]) ||
        value.private !== true || typeof value.name !== "string" ||
        typeof dependencies !== "object" || dependencies === null ||
        JSON.stringify(Object.keys(dependencies)) !== JSON.stringify(["twilight-bureaucrat"]) ||
        typeof dependencies["twilight-bureaucrat"] !== "string" ||
        !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(dependencies["twilight-bureaucrat"])) process.exit(1);
    process.stdout.write(dependencies["twilight-bureaucrat"]);
  '
); then
  refuse "base-owned bootstrap manifest must pin exactly twilight-bureaucrat and nothing else"
fi
# Proof: consumer-bootstrap.test.ts supplies a lock resolving from another registry; with the
# registry-prefix condition removed that registry's same-version tarball was installed and executed
# by the version check below. Reading the lock from the step's cwd instead of the base checkout, the
# malicious matrix installed the candidate's lock the same way.
if ! integrity=$(
  trusted_bun LOCK="$lock" PIN="$pin" REGISTRY="$registry" "$bun_path" --cwd "$scratch/home" \
    --no-env-file -e '
    const lock = Bun.JSONC.parse(await Bun.file(process.env.LOCK).text());
    const pin = process.env.PIN;
    const workspaces = lock.workspaces;
    const root = workspaces?.[""];
    const entry = lock.packages?.["twilight-bureaucrat"];
    if (JSON.stringify(Object.keys(workspaces ?? {})) !== JSON.stringify([""]) ||
        JSON.stringify(Object.keys(root ?? {}).sort()) !== JSON.stringify(["dependencies", "name"]) ||
        JSON.stringify(root.dependencies) !== JSON.stringify({ "twilight-bureaucrat": pin }) ||
        JSON.stringify(Object.keys(lock.packages)) !== JSON.stringify(["twilight-bureaucrat"]) ||
        !Array.isArray(entry) || entry[0] !== `twilight-bureaucrat@${pin}` ||
        typeof entry[1] !== "string" ||
        (entry[1] !== "" && !entry[1].startsWith(process.env.REGISTRY)) ||
        typeof entry[3] !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry[3])) process.exit(1);
    process.stdout.write(entry[3]);
  '
); then
  refuse "base-owned bootstrap lock does not pin twilight-bureaucrat@$pin from $registry"
fi

install -m 0444 -- "$manifest" "$scratch/consumer/package.json"
install -m 0444 -- "$lock" "$scratch/consumer/bun.lock"
# Lifecycle scripts stay disabled even though the manifest check above already forbids them: the
# two are independent, and dependency scripts need a `trustedDependencies` key it also forbids.
if ! (cd -- "$scratch/consumer" &&
  trusted_bun "$bun_path" install --frozen-lockfile --ignore-scripts --registry "$registry" >&2); then
  refuse "frozen install of twilight-bureaucrat@$pin failed"
fi

installed="$scratch/consumer/node_modules/twilight-bureaucrat"
if ! installed_root=$(realpath -- "$installed") ||
  [[ $installed_root != "$scratch/consumer/node_modules/"* ]]; then
  refuse "installed package does not resolve inside the scratch consumer: $installed"
fi
executable="$installed_root/dist/bin.mjs"
if [[ ! -f $executable ]] || [[ ! -r $executable ]]; then
  refuse "installed package has no readable executable: $executable"
fi
if ! version=$(cd -- "$scratch/home" && trusted_bun "$bun_path" --no-env-file "$executable" --version) ||
  [[ $version != "$pin" ]]; then
  refuse "installed executable does not report the pinned version $pin"
fi
install -m 0555 -- "$bootstrap/admit.sh" "$scratch/admit.sh"

printf 'route=installed-package\n'
printf 'package=twilight-bureaucrat@%s\n' "$pin"
printf 'integrity=%s\n' "$integrity"
