# Environment roots live under the deploy user's home, not /srv

`/srv` is `root:root` on h2puni and the box has no passwordless sudo, so creating each
new environment root there needs an interactive password. Both roots now live under
`/home/puni1` — `wbs` and `wbs-dev` — which the deploy user owns outright, so
provisioning an environment needs no privilege at all.

## Consequences

Service data sits outside the FHS location intended for it. Anyone setting up backups,
monitoring or disk alerts will look in `/srv` first and find a stale copy of prod there
until it is deleted.

The alternative considered and rejected was `sudo chown puni1:puni1 /srv`, which would
have bought the same thing for one password and kept the conventional layout. It was
rejected because the goal was explicitly to stop typing passwords for this box at all.
Worth knowing: the security argument for a root-owned `/srv` is weak here regardless —
`puni1` is in the `docker` group, which can mount the host filesystem into a privileged
container, so it is already root-equivalent.

Moving prod was not free. It required a real maintenance window: the tiers stopped, the
live SQLite file copied while quiesced, the edge recreated against new bind mounts.
