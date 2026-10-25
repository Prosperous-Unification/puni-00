#!/bin/sh
set -eu
exec python3 - "$@" <<'PY'
import grp
import os
import pwd
import sys

uid = int(sys.argv[1])
name = 'puni-registry-authority'
if not 1 <= uid < 61184:
    raise RuntimeError('Authority UID must be outside the systemd dynamic-user range')
# Proof: registry-hosts.test.ts supplies the occupied controller UID and observes
# refusal before writes; removing this command admits the foreign UID configuration.
for lookup, key, attribute in ((pwd.getpwuid, uid, 'pw_name'), (grp.getgrgid, uid, 'gr_name')):
    try:
        account = lookup(key)
    except KeyError:
        continue
    if getattr(account, attribute) != name:
        raise RuntimeError('Foreign authority UID/GID is already occupied')
try:
    account = pwd.getpwnam(name)
except KeyError:
    account = None
if account is not None and (account.pw_uid != uid or account.pw_gid != uid or
                           account.pw_shell != '/usr/sbin/nologin' or
                           account.pw_dir != '/nonexistent' or os.getgrouplist(name, uid) != [uid]):
    raise RuntimeError('Existing authority account differs from enrollment')
try:
    group = grp.getgrnam(name)
except KeyError:
    group = None
if group is not None and (group.gr_gid != uid or group.gr_mem):
    raise RuntimeError('Existing authority group differs from enrollment')
PY
