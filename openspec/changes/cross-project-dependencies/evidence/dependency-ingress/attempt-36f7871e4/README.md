# Actual disposable Caddy ingress acceptance

Exact source: `36f7871e463e18f64900b883c2fdc7ab6d49345e`, Linux x64,
Bun 1.4.2. The independently reviewed fixture ran under the canonical h2 heavy
lock with only its invocation-owned labelled container, private configuration
directory and ephemeral loopback TLS listener. The wrapper exited **0** and
reported the heavy lock free afterward. Locked dependencies were reused only
after exact `bun.lock` and `package.json` comparison; no fresh install is claimed.

Actual Caddy adaptation/admin reload equality, selected-host 503, unchanged
unselected WBS/registry/AIVN fixture HTTP responses and restart persistence all
passed. The actual loopback mapping changed from **33139** to **33140** after
restart; both values are retained in the raw acceptance receipt. This confirms
the earlier failed run's fixture-port hypothesis. All HTTP assertions passed
again using the freshly ownership-validated mapping.

The runner validated its full container ID/name/label before exact-ID removal
with anonymous volumes, then required empty label membership. A separate
post-run query also returned zero containers for that exact fixture label.
Private configuration and owner evidence remain retained on the host. Neither
production routes nor production owner state were a mutation target.

The earlier `d16c5d980` run's post-restart connection failure is retained here;
its cleanup also completed and it is not a passing acceptance result. Raw JSON
bytes use `.log` filenames so formatting does not rewrite the receipts.

| Receipt                          | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `acceptance.log`                 | `bc7d22910df5497fe8ba847551f110d8f8d490d88a1c23532e2f0fa4f047d755` |
| `cleanup.log`                    | `3b7e71990d8d65f2882df3246cebab19bb959ca78f61ab97835522da64a44f42` |
| `exit.log`                       | `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa` |
| `fixture-intent.log`             | `e5490682979e6dcdf83e51e632d7882132bcf745e560520419b0241f2daceb06` |
| `previous-d16c5d980-failure.log` | `9e3b8aebcbe4aa542f72a4fb39c8dce69c2a416a21d3c8a5d376bb9375c758e7` |
| `run.log`                        | `108df89c545d24b5e4180aea3c76e40ee471b141d5916d908cabf59ad340465e` |

This closes only the bounded actual ingress fixture acceptance. Complete
participant exclusion, installed legacy-process adoption, solver/service drain,
MCP/background ownership, atomic activation consumption, compatible restoration,
final integrated host gate/CI and live deployment remain outside this result.
