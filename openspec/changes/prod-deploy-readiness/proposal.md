# Production deploy readiness

**Problem.** The first product deploy to prod replaces the pre-product release `0afc7775`. The
2026-09-29 readiness assessment found five gaps in the swap and its tooling:

- prod had no route for the OIDC provider settings;
- env files written in August can lack keys the release requires, and the swap noticed only at
  the health gate, after migrating;
- `bin/assert-no-prod-release.sh` refuses every recorded release, with no named way past it for
  the one safe case;
- nothing backs up the database before the swap migrates it;
- smoke checks only health and the WebSocket.

**Outcome.** The prod layout carries an operator-authored OIDC file to be and gw. `startGreen`
refuses an incomplete env set, or `AUTH_MODE=local`, before any side effect. The images set
`NODE_ENV=production`, so local mode cannot boot there. The gate accepts
`--override-with-ledger=<dump>` only for the skeleton ledger. A `be` swap takes a verified
`VACUUM INTO` backup before migrating, and `restore-db-cli.ts` puts it back. Smoke checks that
anonymous reads are refused and, when an account is configured, that a minted session can read.

**Non-goals.** This change does not choose the prod tenant, client or smoke account, and does not
run anything on h2puni. It adds no backup pruning, off-host copy or write smoke.

**Constraints.** Nothing here may weaken an existing refusal. Every new check needs a
production-path negative with a recorded proof. No provider or signing secret may enter the
repository or a command line.
