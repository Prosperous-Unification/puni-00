# Private launch-authority discovery

The user explicitly approved a private read-only capture on 2026-10-23. The
mode-0600 local record is `/tmp/puni-h2-authorities-20261023.jsonl`; its payload
is deliberately excluded from Git and public PR text.

Discovery captured the user cron entries, selected system/user unit definitions
and effective metadata, selected same-user processes, container launch/restart
metadata, selected installed launcher hashes/bytes and checkout identities. It
read no process environments or application configuration bytes. Thirteen
selected file paths were checked: ten read, three absent, none unreadable.

Five initial Docker projections failed because the optional `Init` map entry was
absent. The failures remain in the private record; all five corrected projections
passed using explicit optional-key observation. A file-read diagnostic initially
compared access time, which reading can change. That partial failure is retained;
the corrected pass binds device, inode, mode, size, modification and change times.

The installed poller/helper and supervisor unit still use the earlier launch
contracts. The selected retained-owner markers and policy document were absent
at capture time. These observations establish an adoption prerequisite; they do
not authorize activation or prove that all installed launchers are guarded.

No controller, service, container, installed artifact or application store was
changed. Root-owned cron/process completeness, loaded artifact provenance,
continuous exclusion, complete installed-authority admission and compatible
controller restoration remain unverified. A point-in-time discovery cannot
substitute for those proofs. Parent S1/S2/O4 and 10.2 remain open.
