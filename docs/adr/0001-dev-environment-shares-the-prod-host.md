# The dev environment runs on h2puni, beside prod

A dev environment could have gone on its own host, which would have cost almost no code —
`tool-deploy` already takes `--host`, and `SITE_ADDRESS` is already an environment
override — but roughly €5/month. Sharing h2puni costs no money and instead costs code:
`/srv/wbs`, `wbs-net`, the container names and `site.caddy` were all written for a single
tenant, and every one of them has to become environment-scoped. We chose the shared host,
so `WBS_ENV` now exists and the remote layout is parameterised.

## Consequences

The blast radius of a dev deploy now includes the prod box. Dev gets its own Docker
network, its own root under `/srv/wbs-dev` and its own SQLite file, but it shares the
kernel, the disk, the Docker daemon and the Caddy that terminates TLS for prod. A dev
deploy that exhausts disk or wedges the daemon takes prod with it.

The upside is not only the €5. The compose/blue-green design claimed a second host would
be "additive rather than a rewrite" and that claim was never tested; a second
_environment_ tests the same seams, and the parameterisation this forces is what a second
host would need anyway.
