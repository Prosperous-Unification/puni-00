# Hosted explicit estimate TS6 proof

This temporary integration proof branch runs the previously retained estimate
TypeScript 6 scope, independently of the frontend target's TypeScript 7 driver.
Its source checkout is pinned to `d7f2129598af7a3cb7ed3c7161e06d504b586891`;
the workflow checkout identifies this proof adapter separately.

A fresh frozen Bun 1.4.2 installation and all compiler preparation commands use
the unchanged retained `mounted-ts6-guard.py.txt`: 2 GiB process-tree RSS,
360 seconds, and at least 12 GiB available memory. A preparation or compiler
refusal fails the job. The adapter requires child exit zero and no guard stop,
since the historical guard itself also permits child exit one.

The exact retained config is copied to `.estimate-recovery-scope.tsconfig.json`.
The compiler command is:

```sh
bun node_modules/typescript/bin/tsc6 -p .estimate-recovery-scope.tsconfig.json --noEmit
```

The actual `--version` output must equal `Version 6.0.3`. Module resolution from
the real entry and facade identifies the compiler actually invoked; its entry,
facade, resolved `lib/tsc.js` and `lib/_tsc.js` hashes must match the historical
public `ts6-identity.json.txt`. Before/after records bind the source revision,
selected source/config bytes and compiler chain; tracked source changes or
unexpected untracked files refuse acceptance. The exact guard, config and
historical identity receipt are uploaded, along with every invocation's raw
stdout/stderr and receipts, even when the job fails.

`prove-adapter.py` watches altered receipt, version, compiler identity, source,
input and after-comparison assertions refuse, then restores their inputs. These
include five calls through the actual acceptance orchestration, with only
external observations and command invocation substituted: wrong source, wrong
compiler, child one, guard failure and after-source drift must refuse without
writing acceptance. Restored inputs must publish acceptance. These are
proof-adapter integrity checks, not compiler negatives or a substitute for the
real hosted typecheck. No local compiler execution is claimed. The full CI,
all-rule survey, browser and h2puni obligations remain separate.
