# Transfer the held registry authority descriptor

The deployment host's default sudo-rs rejects the descriptor preservation option,
and its policy parser rejects the closefrom and logging settings needed by the
classic sudo fragment. Registry maintenance will start its fixed privileged helper
through a compatible narrow sudo rule, then transfer the already held authority
lock over a private Unix socketpair inherited as standard input. The helper and its
children continue to share one canonical lock and operation authority.

Linux `SCM_RIGHTS` transfers a reference to the same open file description; the
receiver's descriptor number may differ. Descendants can still receive it as FD3.
Authentication uses credentials attached to each message: `SO_PEERCRED` on a
socketpair describes credentials at creation, so it cannot establish the sender's
identity after sudo changes users. See [unix(7)](https://man7.org/linux/man-pages/man7/unix.7.html).

The first exchange contains a nonsecret nonce and exactly one descriptor. The
caller sends the operation token only after a fresh kernel-authenticated root
acknowledgement of the direct socket and verified held lock. Canonical state is
read only under that lock; registry, cluster and backup effects require the matching
operation capability. Sudo logging or terminal interposition must fail before a
secret is sent if it prevents this handshake. Request contents never appear in
diagnostics.

## Considered options

- Passing FD3 through `sudo -C` requires the incompatible shared policy fragment.
- A separate classic policy configuration changes policy loading for other classic
  sudo users; rebuilding sudo adds a privileged build and update responsibility.
- A named socket or broker adds discovery and cleanup state. The private socketpair
  belongs to one helper invocation and requires neither.

## Consequences

The transport must reject malformed, truncated, missing or extra descriptors and
wrong credentials, retain bounded cancellation and deadlines throughout the
handshake, and reap its children before releasing descriptor copies. No participant
explicitly unlocks the shared description while a delegated effect remains.
Native tests must cover actual sudo, forced logging, parent death, competing
operations and descriptor cleanup. Implementation and installed validation remain
required; this decision records the transport contract, not operational readiness.
