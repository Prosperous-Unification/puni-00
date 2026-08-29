#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=bin/heavy-lock-lib.sh
source "$script_dir/heavy-lock-lib.sh"

# The path is resolved per platform rather than hardcoded to h2puni's: this
# script is the only way to serialise heavy work, and a Linux-only path made it
# exit 127 on every Mac, which is why local runs bypassed it entirely.
with_heavy_lock "$(resolve_heavy_lock_path)" "$@"
