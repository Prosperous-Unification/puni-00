# Tasks

- [x] 1. `ssh-transport.test.ts` fails first: boundary refusals for transport and `known_hosts`
      absence, unreadability, permissions and shape, user, jump, unpinned target/jump, agent.
- [x] 2. `readSshTransport` and the two renderers in `tools/tool-fleet/src/ssh-transport.ts`.
- [x] 3. `discover.test.ts` fails first: `transport-required` before any command, rendered extra
      vars on the SSH fact command, and the production CLI (`--ssh-transport`) handing Docker the
      `known_hosts` mount, agent and `ANSIBLE_HOST_KEY_CHECKING=True`; lab conflict refused.
- [x] 4. Wire `discover.ts`: `--ssh-transport` flag, `observeFleet` option, controller arguments;
      no ambient `SSH_AUTH_SOCK` passthrough.
- [x] 5. Fault-inject every refusal and rendered flag; record in `verify.md`; `Proof:` comments.
- [x] 6. Rehearse the rendered transport through the locked controller against disposable local
      sshd containers: pinned, changed key, `ANSIBLE_HOST_KEY_CHECKING=False`, pinned and
      mis-pinned jump.
- [x] 7. Runbook and operator guide: discovery is invoked through the transport; both remaining
      blockers named (API firewall, `workers` placeholder) with their A28 answers.
- [x] 7a. A28: `.invalid` endpoints recorded not bootstrapped from `unprovisioned:` with no read;
      tests fail first; declared nodes refused; a missing context elsewhere still refuses.
- [x] 7b. A28: SSH-served cluster API through `openSshApiForward` (loopback-only, pinned,
      `ExitOnForwardFailure`, removed after the reads, `--tls-server-name` the endpoint host);
      tests fail first; fault-injected; rehearsed against a TLS listener behind local sshd.
- [ ] 8. Read-only production discovery of h4claw and h3mon from h2puni (host lane).
