#!/usr/bin/env bash
# The inline Bun program is single-quoted on purpose: its `?.[...]` is JavaScript.
# shellcheck disable=SC2016
# Compatibility route from the historical `bin/tool-wiki-lint.sh <selection> <repository>
# <revision>` interface to the root-installed `twilight-bureaucrat lint`. It replaces that path
# once the root pin lands; until then the root has no pin and this refuses (runbook, "Flip").
set -euo pipefail

if [[ -n ${TWILIGHT_BUREAUCRAT_COMPAT_ROUTE:-} ]]; then
  # Proof: consumer-bootstrap.test.ts installs a package whose lint calls this route again; with
  # this guard removed the route re-entered itself until the fixture's depth bound stopped it.
  printf 'tool-wiki lint: compatibility route re-entered itself through %s\n' \
    "$TWILIGHT_BUREAUCRAT_COMPAT_ROUTE" >&2
  exit 70
fi

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
if ! bun_path=$(command -v bun); then
  printf 'tool-wiki lint: bun is not installed\n' >&2
  exit 78
fi
if ! pin=$(
  env -i PATH="$(dirname -- "$bun_path"):/usr/bin:/bin" MANIFEST="$repo_root/package.json" \
    "$bun_path" --cwd "$repo_root" --no-env-file -e '
    const manifest = JSON.parse(await Bun.file(process.env.MANIFEST).text());
    const pin = manifest.devDependencies?.["twilight-bureaucrat"];
    if (typeof pin !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(pin)) process.exit(1);
    process.stdout.write(pin);
  '
); then
  printf 'tool-wiki lint: root package.json has no exact twilight-bureaucrat devDependency\n' >&2
  exit 78
fi
installed="$repo_root/node_modules/twilight-bureaucrat"
if ! installed_root=$(realpath -- "$installed") ||
  [[ $installed_root != "$repo_root/node_modules/"* ]]; then
  printf 'tool-wiki lint: twilight-bureaucrat is not installed; run bun install\n' >&2
  exit 78
fi
executable="$installed_root/dist/bin.mjs"
if ! version=$("$bun_path" --no-env-file "$executable" --version) || [[ $version != "$pin" ]]; then
  printf 'tool-wiki lint: installed twilight-bureaucrat is not the pinned %s\n' "$pin" >&2
  exit 78
fi
TWILIGHT_BUREAUCRAT_COMPAT_ROUTE=${BASH_SOURCE[0]} exec "$bun_path" --no-env-file "$executable" lint "$@"
