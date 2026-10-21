# puni-00

Company monorepo; agent orientation is in [LLM_README.md](LLM_README.md).
WBS (project name `wbs-tool-v1` until 2026-09-06): collaborative real-time WBS tool. Nx monorepo, Bun everywhere — never npm.

| App     | What                                  | Port                      |
| ------- | ------------------------------------- | ------------------------- |
| `be-01` | API — Elysia + Drizzle + `bun:sqlite` | 3100                      |
| `gw-01` | WebSocket gateway                     | 3200                      |
| `fe-01` | Vite + React static frontend          | 4200 dev, 80 in the image |

Live: <https://wbs.bulletpoints.club>

## Start here

```sh
bun install
bun run dev:setup    # writes the .env files dev needs; fails if the checkout is incomplete
bun run dev          # be + gw + fe
```

Then <http://localhost:4200>. Full detail, including troubleshooting and the
observability stack: **[docs/local-dev.md](./docs/local-dev.md)**.

## Before you push

Run `bin/h2puni-gate.sh <sha>`, not root `bun test`; what it runs and what CI adds:
[LLM_README.md, _Commands_](./LLM_README.md#commands).

## Working on this repo

Most of the work here is done by AI agents, and the rules that govern it are
machine-facing:

| File                                       | Read it when                                         |
| ------------------------------------------ | ---------------------------------------------------- |
| **[HUMAN_README.md](./HUMAN_README.md)**   | operating this: deploying, prod triage, from a phone |
| **[AGENTS.md](./AGENTS.md)**               | always — five rules that govern every change         |
| [LLM_README.md](./LLM_README.md)           | orienting in the codebase: commands, deploy, routing |
| [docs/findings](./docs/findings/README.md) | landmines and open findings                          |
| [docs/local-dev.md](./docs/local-dev.md)   | running things locally                               |
| `openspec/`                                | proposing a change (intent → specs → tasks → verify) |

Changes to observable behavior, contracts, migrations, deploy safety or
architecture go through OpenSpec (start with `/opsx:new`); docs and mechanical
refactors do not.
