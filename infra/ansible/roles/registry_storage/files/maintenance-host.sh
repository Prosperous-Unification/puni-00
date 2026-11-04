#!/bin/sh
set -eu
# The sudo command accepts no arguments. FD0 is the private socket; the root helper
# receives the existing authority description before authenticating any action.
test "$#" -eq 0
exec /usr/bin/env -i PATH=/usr/bin:/bin LANG=C \
  /usr/local/libexec/puni-registry-authority/bun \
  /usr/local/libexec/puni-registry-maintenance/host.js
