# Participant TCP close observation deadline

This packet reconciles only the four endpoint/TCP leaf files from frozen
`139be3bd6090a6bba39fe9ba3bc0131ff4e96261` onto reviewed integration
`376e78c7f3b607d97f9203c9b1172f61d7b2db40`, then corrects the blocking late-close
finding. It copies no old product runtime, listener repair or coordinator draft.
The two existing readiness drafts were explicitly copied for later reconciliation
but remain untracked and excluded from this packet. Canonical reviewed product
observer, validation and host reader remain unchanged from the root integration.

The original actual close observation time is retained once. After close
settlement, before either ordinary outcome, it must precede the immutable
first-destroy cleanup cutoff. This check runs outside the conditional wait, so an
already-observed close also requires timely observation. A delayed timer cannot
let a late close win the race and become connected/pending. Late cleanup remains
terminal cleanup-unproved even when the exact socket eventually closed. Existing
connect/error deadlines, original deadline, first-refusal cutoff, listeners and
real close joining remain unchanged. No deadline, retry or readiness authority is
added.

## Production-path proof

The added isolated child uses the actual Node Socket and an owned loopback server.
Its connected case is the reviewer's failure: real destroy/close waits 1500ms and
approximately one-second timer delivery is delayed another 1200ms. The pending
case connects to an actual closed owned port and verifies ECONNREFUSED; only the
actual close callback delivery is delayed 1500ms. The latter models delayed
observation, rather than claiming that the kernel FD itself stayed open. Native
destroy arguments, including destroy(error), are forwarded unchanged. Every case
requires exact actual close and the injected latency before checking the terminal
outcome; server/child cleanup is joined. The existing timely connected/refused
control remains intact.

- Original candidate RED: `late close became ordinary connected:connected`,
  1.59s, `/tmp/puni-tcp-close-red.log`.
- Strengthened late-close pair GREEN: 1 test, 2 assertions, 3.09s,
  `/tmp/puni-tcp-close-green.log`.
- Full close-time guard omission RED at connected:connected;
  `/tmp/puni-tcp-close-watch-omitted.log`.
- Independently restricting the guard to connected only RED at
  pending:not-listening; `/tmp/puni-tcp-close-watch-pending-omitted.log`.
- `/tmp/puni-watch-tcp-close.py` restored the source in `finally`;
  `/tmp/puni-tcp-close-watches.log` records both intended nonzero outcomes.

An initial pending-fixture attempt dropped native destroy(error)'s error argument,
which converted the real refusal into an errorless close. Its different sanitized
refusal was not accepted as proof. The raw IO wrapper was corrected before the
GREEN and watched runs above; diagnostic output is retained in
`/tmp/puni-tcp-close-pending-diagnostic.log`.

## Limits

This is a timing IO leaf and pure endpoint comparison. Neither constructs a live
context, observer result or readiness grant. Once-only start, private 30-second /
120-attempt timing loop, phase opener census and observer/HTTP composition remain
coordinator obligations. Source four-role profile/B2 and native image acceptance
remain unmeasured and unsupported. No Docker, host, SSH, sudo, namespace, CI or live
action was run. The parent owns full gate and integration approval.

## Restored verification

Bun 1.4.4 (`38afee6c8`), original absolute deadlines and fixed limits:

```sh
FORCE_COLOR=1 bun test tools/tool-remote-scripts/src/lib/dependency-participant-endpoint.test.ts tools/tool-remote-scripts/src/lib/dependency-participant-tcp.test.ts tools/tool-remote-scripts/src/lib/dependency-participant-listener.test.ts
NX_DAEMON=false bun x nx run-many -t lint,typecheck,build -p tool-remote-scripts --skip-nx-cache --output-style=static
bun build tools/tool-remote-scripts/src/lib/dependency-participant-tcp.ts --target=bun --outfile /tmp/puni-participant-tcp-close-bundle.js
bun -e 'await import("/tmp/puni-participant-tcp-close-bundle.js"); process.stdout.write("TCP timing bundle import safe\n");'
```

- Actual local socket/listener group: **8 pass, 0 fail, 36 assertions, 12.13s**,
  `/tmp/puni-tcp-close-focused-final.log`. Existing timely connected/refused,
  cancellation, timeout, late-connect/refused, no-closure and endpoint joins passed.
- Configured uncached Nx graph lint/type/build: **8 tasks passed, 18.8s**,
  `/tmp/puni-tcp-close-static-final.log`. These checks also saw the two untracked
  readiness drafts; neither is imported by this leaf or included in the commit.
- Actual TCP bundle/import: **20 modules**, import-safe,
  `/tmp/puni-tcp-close-bundle.log`.
- Prettier passed all five packet files. Normal repository commit hooks apply.

Endpoint source/tests are byte-identical to exact139. Only TCP source/test change
from that reviewed candidate: retain/check close observation time plus the new
actual-socket regression and its adjacent Proof comment. The root's reviewed
product observer/validation/host reader and listener files are unchanged.
