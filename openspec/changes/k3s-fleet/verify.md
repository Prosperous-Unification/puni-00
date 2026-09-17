# Verification

## Commands and results

- `bunx nx run tool-fleet:test --skip-nx-cache` with Nx daemon/plugin isolation disabled (2026-09-17): 6 passed, 0 failed.
- `bunx nx run tool-fleet:typecheck --skip-nx-cache` (2026-09-17): exit 0.
- Official release, chart-index, Snap Store, Galaxy, and OCI registry lookups on 2026-09-17 produced `infra/versions/toolchain.json`.
- `docker buildx build --output type=oci ...` built the controller manifest `sha256:6d063abc13ee0393fbc98298de7464ad311bf8f6ec376bcdc2d8746c0a3c199b` with Python 3.14.6, ansible-core 2.21.3, community.general 13.4.0, hetzner.hcloud 7.0.1, and kubernetes.core 6.6.0. Registry publication remains pending.

## Failure proofs

| Check                    | Injected fault                                           | Production-path test                        | Observed result                                                                                             |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Toolchain checksum       | Replaced the SHA-256 schema with an accepting expression | `readToolchain rejects an invalid checksum` | Failed because the malformed checksum resolved; restored the exact SHA-256 guard and the full target passed |
| Observation completeness | Pending                                                  | Pending                                     | Pending                                                                                                     |
| Identity recheck         | Pending                                                  | Pending                                     | Pending                                                                                                     |
| Lease ownership          | Pending                                                  | Pending                                     | Pending                                                                                                     |
| Retirement de-enrollment | Pending                                                  | Pending                                     | Pending                                                                                                     |
