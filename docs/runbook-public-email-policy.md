# Public email domain policy

`public-email-policy.v1.json` is a reviewed, repository-maintained MIT deny list for mailbox providers, relay services and explicit suffix overrides. Revision `2026-09-28.1` carries the providers from slice 23 plus five relay domains. The list is intentionally curated and cannot promise coverage of every mailbox service worldwide. DNS control is still required before a claim becomes verified.

The directly declared MIT `tldts@7.4.12` package supplies its maintained Public Suffix List, including private suffixes. `public-email-policy.manifest.json` pins the policy file's SHA-256, revision, licence and PSL package revision. `loadPublicEmailPolicy` checks the asset on every claim decision; absence, unreadability, malformed content and checksum drift are faults. Onboarding uses the same checked policy when routing a verified email to a claimed domain.

To revise the policy, review provider and relay evidence, edit the JSON arrays without duplicates, increment `revision`, update the manifest's revision and SHA-256 of the final bytes, and update the package and manifest together if the PSL package changes. Run the domain, store and mounted route tests. A manifest or asset edit must not silently change policy under a running process; the next decision reads and checks it.
