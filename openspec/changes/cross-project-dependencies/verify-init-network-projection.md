# Init network projection verification

## Scope

This packet implements the fixed `created-v3` network observation contract in
the sealed `/tmp/puni-init-network-projection-plan.md`. It changes the production
packet to v2 with a required profile, the production receipt to v3, and the
configuration pin to exclude exactly top-level membership and runtime Status.
The independent factory supplies raw native-shaped Status and a separately
authored configuration pin. A separate sealed UID ruling is implemented in
isolated synthetic-host children, and the Init CLI restores plain refusal JSON lines
under `FORCE_COLOR=1`. No Docker, SSH, native Init or host action ran.

## Fresh checks

| Check                                                                                                | Outcome                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bun test` network, observer, CLI component files                                                    | 117 pass, 0 fail; `/tmp/puni-init-components-a.log`                                                               |
| `bun test` operation file                                                                            | 129 pass, 0 fail after refreshing its synthetic network shape; `/tmp/puni-init-operation-full.log`                |
| Actual factory created network faults for configuration, IPAM, missing Status and unsafe raw counter | 4 pass, 0 fail; `/tmp/puni-init-factory-network-faults.log`                                                       |
| Actual factory extra Status-field fault                                                              | 1 pass, 0 fail after fixture injection; `/tmp/puni-init-status-extra-green.log`                                   |
| All five actual-entry network faults after synthetic UID correction                                  | 5 pass, 0 fail; `/tmp/puni-init-factory-network-final.log`                                                        |
| `bunx tsc --build --force tools/tool-remote-scripts/tsconfig.json`                                   | 0 exit after test fixture correction; `/tmp/puni-init-types-final.log`                                            |
| `bunx nx run tool-remote-scripts:lint --skip-nx-cache`                                               | 0 exit; `/tmp/puni-init-lint.log`                                                                                 |
| `bunx openspec validate cross-project-dependencies --json`                                           | 0 exit; `/tmp/puni-init-openspec.log`                                                                             |
| Network, observer, operation, CLI fixture and owner adapter component files after UID model          | 247 pass, 0 fail; `/tmp/puni-init-components-final.log`                                                           |
| Full Init CLI source and bundled contract tests under `FORCE_COLOR=1`                                | 21 pass, 0 fail; `/tmp/puni-init-cli-final.log`                                                                   |
| Factory prepare, execute and expired-history recovery positives                                      | 3 pass, 0 fail; `/tmp/puni-init-uid-three-positives.log`                                                          |
| Factory raw UID1001 modeled prepare positive and early UID negatives                                 | positive and 4 early faults passed; `/tmp/puni-init-uid-1001-final.log`, `/tmp/puni-init-uid-early-negatives.log` |
| TLS/WSS semantics and closed credential-owner negative                                               | 1 focused test passed; `/tmp/puni-init-uid-tls-owner-negative.log`                                                |
| Isolated read-only v3 recovery chain plus directory-owner negative                                   | 1 parent test passed, two child paths; `/tmp/puni-init-uid-recovery-negative.log`                                 |
| Real byte and inode drift after ownership modeling                                                   | 2 pass, 0 fail; `/tmp/puni-init-uid-real-identity-negatives.log`                                                  |

## R5 faults and watched omissions

- The exact raw counter token guard rejected fractional, exponent, unsafe
  uint64 and rounded-fraction inputs. Removing it accepted `1.0` in the pure
  boundary; substituting ordinary JSON parsing in either Engine ID/name path
  or CLI pin parsing admitted a rounded fractional counter and failed their
  respective negatives.
- Removing safe-integer admission accepted a fractional synthetic counter.
  Removing the mapped-CIDR guard accepted compressed and expanded mapped
  IPv6 subnet spellings. Removing the exact Status key guard accepted an
  extra field in the actual factory entry: its required refusal test failed
  with exit 0 (`/tmp/puni-init-status-extra-watch-red.log`); the restored
  guard gave the required refusal.
- Omitting IPAM from the configuration projection preserved a pin despite
  an independent IPAM configuration change. Hashing runtime Status made the
  unchanged-configuration positive refuse on valid counter drift.
- Omitting packet version or profile admission let legacy/missing declarations
  pass decode; production entry negatives verified zero Engine effects. Omitting
  the v3 receipt version guard accepted a self-consistently rehashed v2 chain
  in read-only recovery.
- The independent factory Status/config/unsafe-counter negatives reached the
  actual production entry and refused before original stop. The factory's
  corrected raw executable opener was separately required to pass the new
  collector FD/inode guard; the former inherited memfd failed the baseline
  genuine prepare before network reads.
- Removing the JavaScript named-owner projection made the injected raw UID1001
  prepare positive refuse before reads. Removing the Python mapped-resource
  projection made that same positive refuse after collection. The restored
  model retains real dev/inode/mode/size and opened descriptors; pure number,
  bigint, method, unknown-path/FD and close-retirement checks passed. The
  close-retirement omission made the closed-FD test fail.
- Omitting the production private-file held-FD owner comparison made the
  packet-descriptor UID1001 negative succeed (exit 0 rather than 2). Omitting
  the production named-owner comparison made the credential UID1001 negative
  reach authenticated registry HTTP. Both checks were restored; independent
  credential pin, operation pin, operator UID/eUID, receipt parent and receipt
  directory mismatches refused without effects.
- `FORCE_COLOR=1` caused the source CLI refusal JSON parse oracle to fail on
  actual ANSI bytes before the bounded stderr producer correction. Both source
  and bundled refusal contracts then emitted a complete plain JSON line and
  passed; no parser stripping was added. The source success branch's existing
  stdout producer also passed an actual CLI child exact-line test under color;
  a temporary `console.log` substitution still passed, so stdout was left
  unchanged and no false R5 claim is made for it.

## Limits

The controlled native lifecycle evidence establishes configuration equality
for its retained twenty raw reads, not a direct field-level comparison of the
earlier refused native attempt. This packet has no native acceptance result.
The complete factory composition remains pending one root-owned replay from a
frozen SHA. The local synthetic UID1001 injection proves the fixture boundary;
it does not substitute for a hosted UID1001 CI execution.
