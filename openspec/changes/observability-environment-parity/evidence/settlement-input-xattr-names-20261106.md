# Fixed-input xattr-name observations

Status: **not operationally qualified**. Same-user host observation over the existing88fixed paths only; original launch facts remain unchanged.

Used installed Python with `-I -B -S` for this metadata-only collector, suppressing automatic site hooks. This is no production launch or compatibility test. No input payload or xattr value was opened/read, and no inode ioctl, service/request execution or new runtime was used.

Fresh counts: {"acceptedEncodedNameBytesIncludingNul": 0, "acceptedNames": 0, "fixedPaths": 88, "identityChanges": 0, "listxattrDenials": 0, "malformed": 0, "missingBefore": 4, "observedEmptyRegularNameSets": 81, "observedNonemptyRegularNameSets": 0, "observedRegularNameSets": 81, "otherNonregularNotQueried": 1, "overflows": 0, "securityEvmPresent": 0, "symlinksNotQueried": 2, "unavailable": 7}.

Each selected regular path used `os.listxattr(path, follow_symlinks=False)`, bounded to256names and4096encoded bytes including NUL separators. Exact lstat device/inode/uid/gid/full mode/size/link/atime/mtime/ctime/blocks tuples were compared before and after. Missing, denial, nonregular selection, change, malformed names and overflow remain unavailable instead of becoming an empty set.

| Unavailable path                     | Stage                  | Reason                   |
| ------------------------------------ | ---------------------- | ------------------------ |
| /usr/bin/python3                     | regular-path-selection | NotSelectedRegularPath   |
| /usr/lib/python3.12/sitecustomize.py | regular-path-selection | NotSelectedRegularPath   |
| /usr/pyvenv.cfg                      | lstat-before           | FileNotFoundError:errno2 |
| /usr/bin/pyvenv.cfg                  | lstat-before           | FileNotFoundError:errno2 |
| /usr/lib/python312.zip               | lstat-before           | FileNotFoundError:errno2 |
| /etc/ld.so.preload                   | lstat-before           | FileNotFoundError:errno2 |
| /etc/ld.so.conf.d                    | regular-path-selection | NotSelectedRegularPath   |

Symlinks are not queried as regular inputs: their own no-follow identity and target spelling are recorded, with targets observed separately only when already among the88paths. Directory inputs are explicitly unavailable for this regular-input-only collection.

Nonempty accepted name sets:

None among the accepted regular paths at this observation.

This cannot retroactively qualify interpreter/loader/source inputs or earlier diagnostic opens. Exact before/after identity equality does not prove no concurrent mutation, first-use xattr history, quiescence, startup closure or causal consumer/allocation bounds. No boot arguments, attribute values, secrets, global scan, privileged retry, source edit, tests or subagent were used.
