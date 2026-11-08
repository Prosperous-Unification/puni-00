#!/bin/sh
set -eu
# The authenticated operator can supply only bounded JSON on stdin. Neither the
# executable, enrollment directory nor service UID comes from the caller.
# Proof: the native fixture refuses an extra executable argument; removing this check admits that invalid request.
test "$#" -eq 0
test "$(id -u)" -eq 0
exec /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin \
  /usr/bin/setpriv --reuid=59001 --regid=59001 --clear-groups --no-new-privs \
  /usr/local/libexec/puni-registry-authority/bun \
  /usr/local/libexec/puni-registry-authority/authority.js \
  /var/lib/puni-registry/journal/contents
