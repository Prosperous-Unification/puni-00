# Three lifetimes for the WBS frontend

## Problem

fe-01 has no lifetime ownership. Preferences are built when their module loads,
the directory management service is built inside a hook, and the plan feed,
writer and marker services are created and closed by effects under
`WbsTable`. Nothing owns the page, the signed-in identity or the open project,
so a replacement can overlap its predecessor: a project switch closes the old
feed from one effect while another publishes the new one, and a cleanup that
fails or hangs is invisible. The accepted design fixes three runtimes -
application, session, project - and this change installs them.

## Outcome

Each of the three lifetimes is one DI Bag runtime, built outside React by a
composition root, publishing narrow service contracts and nothing else. One
host owner holds the current runtime of each lifetime. Every close trigger for
one runtime joins one retirement, withdrawal happens before disposal starts,
and project retirement precedes session retirement, which precedes the
application's.

Required retirement gates replacement. A cleanup failure or an expired bounded
wait withdraws the old services, refuses the replacement, and shows the
sanitized public failure report the root fault path already discloses -
sentence, occurrence handle and what was lost - while the still-running
disposal stays observed. DI Bag's own React recipe reports and continues; rule
R5 refuses, so this repository implements its own owner.

Delivery keeps every behaviour it has: the stale-reader predicate, clearing the
feed reference before closing it, one socket per project, the remembered
selection, and the router instance that survives a session update.

## Non-goals

- No library version changes. `di-bag` stays at 0.4.0.
- No backend, gateway or MCP work.
- No server-side sign-out. The existing Log out stays a local exit that sends no
  request, so a reload can still restore the identity.
- No new reader-visible behaviour except the fatal state above.
- No credential rotation for one identity. No such event exists today.

## Constraints

- Feature, resource, store and geometry services import no React (rule F1).
- Contexts carry readonly service contracts, never a bag, a token, a broad HTTP
  client, a repository or a resource (rule K2).
- Module identifiers are `module.frontend.<name>`; DI Bag labels drop that
  prefix.
- Runtimes are built at module load or in an effect, never in render, `useMemo`
  or a lazy state initialiser.
