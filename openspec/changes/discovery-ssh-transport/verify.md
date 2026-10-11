# Verification

All runs were on the lane worktree `batch-10/070-05-discovery-transport` on the operator
workstation and contacted no real host, cluster or cloud API. Bun tests ran under
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## Tests

| Command                                                             | Result                         |
| ------------------------------------------------------------------- | ------------------------------ |
| `bunx nx run tool-fleet:test --skip-nx-cache` (after A28)           | 405 tests across 34 files pass |
| `bunx nx run twilight-dash:test --skip-nx-cache`                    | 56 tests pass                  |
| `bunx nx run tool-fleet:lint:fast`                                  | pass                           |
| `bunx nx run tool-fleet:typecheck --skip-nx-cache`                  | pass                           |
| `bunx @fission-ai/openspec@1.12.0 validate discovery-ssh-transport` | valid                          |

## Fault injection

Each fault was applied alone to the production source, `ssh-transport.test.ts`,
`discover.test.ts` and `lab-provider.test.ts` were run, and the source was restored. Every row
failed at least one test; none passed.

| Check                                                                                                | Injected fault                           | Observed                                                                     |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| unreadable transport / known_hosts                                                                   | read error swallowed (`source = ''`)     | absent cases surfaced raw `ENOENT … stat` instead of the typed refusal       |
| owner-only files                                                                                     | permission check `if (false)`            | 0644 transport negative returned a transport                                 |
| user pattern                                                                                         | pattern dropped / whole check off        | `-oProxyCommand=sh` user and missing-user negatives returned a transport     |
| jump shape                                                                                           | only `isRecord` kept                     | `port: 2222` jump negative returned a transport                              |
| jump address pattern                                                                                 | pattern dropped                          | `-oProxyCommand=sh` jump refused as `host-unpinned`, not `jump-invalid`      |
| truncated known_hosts line                                                                           | check off                                | truncated-line negative returned a transport                                 |
| empty known_hosts                                                                                    | check off                                | comment-only negative reported `host-unpinned` for 10.1.0.4                  |
| marker lines pin nothing                                                                             | `@revoked` hosts added to the pinned set | revoked-only negative returned a transport                                   |
| agent path alphabet                                                                                  | check off                                | `agent:1.sock` negative returned a transport                                 |
| agent is a socket                                                                                    | check off                                | regular-file `SSH_AUTH_SOCK` negative returned a transport                   |
| unknown transport field                                                                              | check off                                | `sshArgs: -o StrictHostKeyChecking=no` negative returned a transport         |
| transport is an object                                                                               | check off                                | `[]` reported `user-invalid` instead of `transport-malformed`                |
| absolute known_hosts path                                                                            | pattern dropped                          | relative path reported `known-hosts-unreadable`                              |
| every address pinned                                                                                 | check off                                | unpinned-target negative returned a transport                                |
| `UserKnownHostsFile`, `GlobalKnownHostsFile=/dev/null`, `StrictHostKeyChecking=yes`, `BatchMode=yes` | each option removed in turn              | render, jump and production CLI tests failed for each                        |
| jump ProxyCommand pinned                                                                             | inner ssh without the strict options     | `pins the jump host …` failed                                                |
| `known_hosts` mount, agent mount, agent env, `ANSIBLE_HOST_KEY_CHECKING=True`                        | each removed in turn                     | `mounts known_hosts read-only …` and the production CLI test failed for each |
| `transport-required`                                                                                 | refusal off                              | observer issued the provider command; CLI negative reached Docker            |
| `transport-conflict`                                                                                 | refusal off                              | production CLI test failed (lab case read the transport)                     |
| rendered extra vars                                                                                  | dropped from the SSH fact command        | observer and production CLI tests failed                                     |
| controller transport arguments                                                                       | not pushed                               | production CLI test failed                                                   |

### Decision A28: API forward and `.invalid` clusters

The same procedure, with `api-forward.test.ts` and `contracts.test.ts` added to the run.

| Check                                              | Injected fault                                    | Observed                                                                            |
| -------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `.invalid` cluster not read                        | branch `if (false)`                               | `.invalid` test saw provider and Kubernetes reads for workers                       |
| `.invalid` cluster declares no nodes               | refusal off                                       | `.invalid` test: declared worker nodes recorded as not bootstrapped                 |
| `unprovisioned:` satisfies source closure          | alternative removed from `decodeFleetObservation` | `.invalid` observation failed decoding as incomplete                                |
| SSH-served API is forwarded                        | `findApiForwardHost` returns undefined            | forward test: kubectl dialled the endpoint directly                                 |
| certificate verified for the endpoint host         | `--tls-server-name` dropped                       | forward test failed                                                                 |
| forward closed on failure                          | close moved after the reads (success only)        | x509 negative left the forward open                                                 |
| forward host cannot be an ssh option               | refusal off                                       | `refuses a forward host that ssh could read as an option` failed                    |
| `ExitOnForwardFailure=yes`, `-N`, `127.0.0.1` bind | each removed in turn                              | `renders a loopback-only pinned forward …` failed (and the open test for `-N`/bind) |
| teardown failure reported                          | removal status ignored                            | `refuses when the forward container cannot be removed` resolved                     |
| ssh exit detected                                  | exit check off                                    | host-key negative reported a timeout instead of `Host key verification failed`      |
| readiness deadline                                 | deadline off                                      | never-listening negative polled until the runner timeout                            |

## Rehearsal through the locked controller

A scratch script rendered the transport with `readSshTransport`, `renderControllerTransport` and
`renderSshDiscoveryVariables` and ran exactly the `docker run … timeout … ansible-playbook
infra/ansible/playbooks/discover.yml --inventory <address>, --extra-vars …` shape of
`buildControllerCommand` and `buildSshDiscoveryCommand` in the controller
`ghcr.io/prosperous-unification/fleet-controller:0.1.0@sha256:372f6f43…62de`. Targets were
disposable `oven/bun:1.4.2-alpine` containers with OpenSSH and Python (target 172.17.0.3, jump
172.17.0.4, user `fleet`), the key held only in a local `ssh-agent`. Both containers and the agent
were removed afterwards.

| Case                                                  | Result                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| pinned key                                            | `PUNI_MACHINE_FACT={"machineId": "0123…cdef", "address": "172.17.0.3", …}`, `ok=3 changed=0`, exit 0   |
| `known_hosts` pins another key for the target         | `Host key for 172.17.0.3 has changed and you have requested strict checking.` `unreachable=1`, exit 4  |
| same, with `ANSIBLE_HOST_KEY_CHECKING=False` injected | connected and emitted the fact, exit 0: Ansible's `StrictHostKeyChecking=no` wins over the common args |
| jump via the target itself                            | fact emitted; sshd logged the session from 172.17.0.3, the jump                                        |
| separate pinned jump                                  | fact emitted; the target logged `Accepted publickey for fleet from 172.17.0.4`                         |
| jump pinned to another key                            | `Connection closed by UNKNOWN port 65535`, `unreachable=1`, exit 4; jump logged `[preauth]` close      |

The third row is why `ANSIBLE_HOST_KEY_CHECKING=True` is rendered rather than left to the image or
an Ansible configuration file.

### API forward (A28)

A second scratch script called the production `readSshTransport` and `openSshApiForward` with
the locked controller against a disposable sshd (172.17.0.3) whose loopback served TLS on 6443
with `openssl s_server`, then ran the forwarded `kubectl --context platform --server
https://127.0.0.1:<port> --tls-server-name 172.17.0.3 get nodes -o json` in the controller with
a kubeconfig holding the rehearsal CA.

| Case                               | Result                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| certificate with SAN 172.17.0.3    | forward opened; TLS verified; kubectl then failed on the non-Kubernetes body (`invalid character '<'`) |
| certificate with SAN 10.9.9.9 only | `tls: failed to verify certificate: x509: certificate is valid for 10.9.9.9, not 172.17.0.3`           |
| `known_hosts` pins another key     | `forward refused: SSH API forward to 172.17.0.3 exited 255: … Host key verification failed.`           |
| after each close                   | `docker ps --filter name=puni-fleet-forward` listed none                                               |

## Not run

- Discovery against h4claw or h3mon: lanes never touch production hosts; task 8 belongs to a host
  lane run from h2puni.
- The full `tool-fleet:discover` command against the sshd containers: its provider and Kubernetes
  sources need an hcloud inventory and a cluster; the CLI wiring is covered by the fixture test.
- The container user: the controller runs as uid 1000, so the operator's owner-only
  `known_hosts` and agent socket must be readable by uid 1000 (true on the workstation here; the
  playbook procedure has the same constraint on h2puni). The runbook states it.
- An empty agent: discovery checks only that `SSH_AUTH_SOCK` is a socket; an agent without the
  key fails at login, not as a typed refusal.
- A forwarded `kubectl get nodes` against h4claw: not run; lanes do not contact production.
