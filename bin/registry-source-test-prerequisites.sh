#!/usr/bin/env bash
set -euo pipefail

# Proof: removing package setup failed both actual-workflow toolchain fixture consumers.
sudo apt-get update
sudo apt-get install --yes --no-install-recommends gcc libc6-dev
# Proof: missing render/load/probe or the helper itself failed both jobs before runtime-started.
printf '%s\n' 'abi <abi/4.0>,' 'include <tunables/global>' \
  'profile unshare /usr/bin/unshare flags=(unconfined) {' '  userns,' '}' |
  sudo tee /etc/apparmor.d/unshare > /dev/null
sudo apparmor_parser --replace /etc/apparmor.d/unshare
unshare --user --map-root-user --fork true
