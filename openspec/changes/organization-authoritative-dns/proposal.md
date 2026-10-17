# Intent

WBS010.5.4 (`cb49f5ad-c547-4e44-af06-d8ba795b9348`) retains an implementation gap in organization domain verification. The mounted route already checks the current challenge, membership, policy and unique owner, but production boot constructs `DomainClaimRepository` with a resolver that always refuses. An activated organization therefore cannot verify a real TXT challenge.

Provide a bounded authoritative DNS adapter and explicit production composition for task 5.2 of `organization-ownership-and-access`. It discovers the closest enclosing DNS zone through explicitly configured recursive resolvers, asks an eligible authoritative server directly for the exact verification owner, and returns one string per TXT record. An authoritative answer is protocol evidence, not authenticated DNS or a live-domain acceptance receipt. Unavailable, malformed, unsupported or incomplete responses cannot establish ownership.

Preserve the existing five-second route deadline, typed refusal behavior, commit-time rechecks and disabled organization activation. Develop against local DNS protocol fixtures and disposable SQLite through the real boot composition. Every added refusal needs a watched production-path negative and adjacent `Proof:` before implementation is complete.

Non-goals: activating organizations or browser authority; changing memberships, tokens or domain ownership rules; scheduling seven-day retained-proof checks; automatic DNS configuration; DNSSEC validation; alias following; live domain certification; sending email; resolving other WBS rows. No live network query or host mutation is needed for this design packet.

Constraints: Bun/Nx, no heavy laptop gate, one total bounded lookup, explicit network destinations, no resolver fallback to the host environment, no token logging, no shared cache, and no silent default for missing enabled configuration. Existing deployments retain refusal unless the resolver is explicitly configured. Protocol-library selection and network-boundary review are implementation prerequisites; deployment configuration, outbound DNS access and a controlled live-domain receipt remain external acceptance prerequisites.
