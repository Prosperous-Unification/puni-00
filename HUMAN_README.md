# HUMAN_README

How to operate this repo, from a phone if that is all you have. Written for you.
Agents read [AGENTS.md](./AGENTS.md).

Verified 2026-08-04 against the live boxes, except where a line says otherwise.

---

## Read this before you use WhatsApp for anything real

**WhatsApp is a production console with no confirmation step.**

The openclaw agent on h1claw runs with `security=full, ask=off`. There is no
approval prompt between a sentence you type on a phone and a command running as
`claw` on the build box — which has SSH to prod, registry credentials, and your
GitHub token. A misread message, an unlocked phone, or a hijacked WhatsApp
session is arbitrary shell on your infrastructure.

**There is no rollback to an older release.** `--version` and `--since` are now
_refused_ rather than ignored (2026-08-04), so a command that looks like a rollback
stops instead of quietly deploying HEAD. Going back means checking out the older
commit, rebuilding and deploying it. Every real deploy is fix-forward, under
whatever pressure you are already under.

The **schema** is a separate matter and does roll back: every migration ships a
`down.sql`, and an aborted be-01 swap reverses to the baseline it captured before
migrating (`AGENTS.md`, "Migrations").

So, the rule:

> **Never put `--execute` in a first message.**
>
> 1. Ask for the dry run. Require the reply to state: checkout commit, dirty or
>    clean, images, target, and what it _would_ change.
> 2. Read it.
> 3. Authorise in a **separate** message, naming one exact command.

This is a habit, not a mechanism — nothing enforces it today. If you want it
enforced, that is an `approvals`/allowlist change on the gateway, and it is worth
doing before the first phone deploy.

---

## Prod is broken and you have a phone

**Prod:** <https://wbs.bulletpoints.club> · host `h2puni` · reached from `h1claw`
over SSH. Blue/green: each tier runs one colour at a time.

### Step 1 — is it actually down

Send:

> in ~/wd/puni/puni-00 — check prod: curl the public site and /health, then
> ssh h2puni and run docker ps. Report raw output, change nothing.

Expected when healthy: site `200`, `/health` `200`, and six containers up — one
per tier (`be-01-<colour>`, `gw-01-<colour>`, `fe-01-<colour>`) plus
`wbs-caddy-1`, `wbs-registry-1` and `dagger-engine`. Tiers hold colours
independently: `fe` on blue while `be` and `gw` are on green is normal, not a
half-finished deploy.

Note `/api/health` returns `NOT_FOUND` — there is no such route. Do not read it
as an outage.

> ⚠️ **A 200 from `/health` does not mean healthy.** be-01's health is an
> in-memory boolean and gw-01's is unconditional. Break `BE_URL` or delete the
> SQLite file and both still answer 200. Treat health as "the process is
> running", never as "the system works". Confirm with real traffic.

### Step 2 — what is actually deployed

> ssh h2puni and cat /home/puni1/wbs/state/be.json, gw.json and fe.json. Report
> activeColor and lastDeployedSha for each.

Each file gives a _recorded_ colour and commit — a cache, not the truth. Caddy's
live routing is what the deploy believes (`lib/reconcile.ts`'s `resolveLiveColor`:
routing wins over the file, always), because a deploy killed between `caddy reload`
and the state write leaves the file naming one colour while the other is serving. To
see what is actually live: `docker exec wbs-caddy-1 wget -qO- http://127.0.0.1:2019/config/`.
Compare the commit against `main`.

Also check the deploy lock. **The file always exists — its presence means
nothing.** The lock is a real `flock(2)` on an open descriptor, so the only
honest test is whether something holds it:

> ssh h2puni and check whether /home/puni1/wbs/state/deploy.lock is actually held —
> grep its inode in /proc/locks. Do not run `flock` to test it, that would take
> the lock.

An entry in `/proc/locks` means a deploy is mid-flight; do not start another. No
entry means it is free, however old the file looks. A file with contents but no
live lock is the fingerprint of a deploy that was killed — the contents name the
last holder.

> **State files fail closed since 2026-08-05.** Only a genuinely absent file reads
> as "never deployed"; unreadable or malformed ones now refuse and name the path.

### Step 3 — logs

> ssh h2puni and run: docker logs --tail 100 be-01-green (use the colour from
> step 2), same for gw-01 and fe-01. Report anything that looks like an error.

### Step 4 — fix forward

There is no undo, so the shape is always: find the commit, fix, gate, publish,
dry-run, authorise, verify.

> on h2puni in the WBS checkout — pull main, run `bin/h2puni-gate.sh`, report
> failures only

Then publish and dry-run — still no `--execute`:

> on h2puni — export REGISTRY_USER=wbs and REGISTRY_PASS from
> /home/puni1/wbs/.env, run `bunx nx run tool-dagger:publish-all`, then
> `bunx nx run tool-deploy:deploy -- --all` and paste the dry-run output

**Say "on h2puni".** Builds are blocked on h1claw by a hook, so a message that
does not name the host will be refused mid-emergency, which is the worst possible
time to discover it. Build in `/home/puni1/wbs-build`, never in dev's checkout
([Everyday work](#everyday-work)).

**Stop and do not authorise if** the tree is dirty, `release.json` is stale, the
gate failed, the bundle is unbuilt, or the deploy lock is held. Those refusals
are the safety gates working — do not talk the agent past them.

Only then, in a new message, one command:

> run: bunx nx run tool-deploy:deploy -- --all --execute

### Step 5 — prove it worked

> re-check the public site and /health, ssh h2puni and re-read the three state
> files, and report the new activeColor and lastDeployedSha

`lastDeployedSha` must be the commit you meant. The colour should have flipped.

> ⚠️ `caddy reload` **exits 0 when it did nothing**. A green deploy log is not
> proof the public route moved — the sha and the colour are.

---

## When openclaw itself is unreachable

`openclaw daemon status` needs a shell, which is exactly what you do not have in
this scenario. In order:

1. **Tailscale dashboard** — <https://openclaw-gw.tailc433ee.ts.net> from any
   device on the tailnet (phone included). Verified reachable, returns 200. If
   this loads, the gateway is alive and WhatsApp is the broken part.
2. **SSH from a phone** — a terminal app to `h1claw`, then
   `systemctl --user restart openclaw-gateway` and `openclaw doctor`.
3. **Neither** — you need a laptop. Prod keeps serving whatever colour is live;
   a broken openclaw does not take the site down.

Worth doing before you need it: confirm you can SSH to h1claw from your phone.
Untested by me.

---

## Everyday work

Three surfaces, same repo, same rules.

| Surface              | Use it for                                | Catch                                     |
| -------------------- | ----------------------------------------- | ----------------------------------------- |
| Mac                  | writing code, fast loops, anything visual | arm64 — cannot build prod images natively |
| h1claw over SSH      | editing, tests, git, long non-build jobs  | never builds; a hook blocks them          |
| h1claw over WhatsApp | all of the above, from anywhere           | you steer an agent; see the red box       |

**h2puni is the build box** — your rule, 2026-08-04; why h1claw never builds and
what its hook denies: [LLM_README.md, _Deploy_](./LLM_README.md#deploy).

As of 2026-08-05 h2puni can drive a prod build: `dagger` v0.21.9 (since 2026-09-06; 0.21.8 before) pinned to the
engine image, images published from a build checkout at `/home/puni1/wbs-build` that
dev's deploy cannot reset under it, and the `h2puni` alias resolving to itself so the
deploy can ssh where it already is. `docs/runbook-prod-deploy.md` has the detail and the traps.
The checkout at `/home/puni1/wbs-dev/src` belongs to dev: it is bind-mounted into the
running dev container, so a build there would fight the dev servers for the same files.

Checking tooling there needs a **login** shell: `ssh h2puni 'bash -lc "..."'`.
Volta and Bun are not on a non-login shell's PATH, so a plain
`ssh h2puni 'command -v node'` says missing when Node is installed and fine.

### Seeing your change on dev

```sh
git push && ./bin/dev-deploy.sh
```

Seconds, not minutes: dev runs from source on h2puni and its watchers pick the
change up; nothing is built. The script refuses a dirty tree or an unpushed commit,
because h2puni pulls from GitHub. A Dockerfile or `compose.yml` change fails the
deploy with the command that applies it; a per-tier `.env` is gitignored, so edit it
on h2puni and `docker restart wbs-dev-src`. Dev (<https://dev.wbs.bulletpoints.club>)
has no edge password since 2026-08-06 and does not
rehearse a prod deploy — dry-run prod on purpose. Which change needs what:
[the dev deploy runbook](./docs/runbook-dev-deploy.md).

### Mac

```sh
bun install
bun run dev:setup     # writes the three .env files
bun run dev           # be :3100, gw :3200, fe :4200
```

Gate before pushing with `bin/h2puni-gate.sh <sha>`
([LLM_README.md, _Commands_](./LLM_README.md#commands)). More in
[docs/local-dev.md](./docs/local-dev.md).

### h1claw over SSH

```sh
ssh h1claw
export PATH=$HOME/.bun/bin:$HOME/.local/bin:$PATH
cd ~/wd/puni/puni-00
```

That export is the one thing that bites: `bun`, `dagger` and `shellcheck` live
under `~/.bun/bin` and `~/.local/bin`, and a non-interactive
`ssh h1claw '<cmd>'` will not find them. A login shell does. So does the agent.

Present and verified: bun, dagger, shellcheck, docker, node, gh (as
`dany-fedorov`), `codex`, `claude`. `openspec` is not global; it is a repo dev
dependency, so run `bunx openspec` inside the checkout.

### h1claw over WhatsApp

Message Claire. **Always open with the path** — the agent's workspace is
`~/.openclaw/workspace`, which is Claire's own, not this repo:

> in ~/wd/puni/puni-00, ...

Verified: the agent ran the entire gate from a single message and returned both
exit codes and the NX summary. Development through WhatsApp works today.

To skip the path prefix, symlink it once —
`ln -s ~/wd/puni/puni-00 ~/.openclaw/workspace/puni-00`. Not done:
`~/.openclaw/workspace` is itself a git repo and that would add a file to yours.

Good things to hand it: run the gate; investigate a red CI run; open a PR for a
small fix; summarise what changed on main; dry-run a deploy and report.

When several of those run at once, Claire works in lanes — one worker session
per worktree, gating the exact SHA — and
[lanes are Claire's v1 mechanism](./docs/lanes-are-claire-v1.md) records what a
lane owes this repository.

---

## Making a change

Rules: [AGENTS.md](./AGENTS.md). Five of them. R5 — _unknown is not OK, and every
check must be provably breakable_ — is the one this repo learned the expensive
way; the incidents are in [the R5 catalogue](./docs/findings/checks-that-cannot-fail.md#r5-catalogue-heading).

Behaviour, contracts, migrations, deploy safety and architecture go through
OpenSpec: `/opsx:new` → `/opsx:apply` → `/opsx:verify` → `/opsx:archive`. Docs
and mechanical refactors do not. The intent step runs an interview that argues
with you on purpose; terms it settles land in `CONTEXT.md`, hard-to-reverse
decisions become ADRs.

Reviews: three second opinions, all working on h1claw as of 2026-08-04 (`agy`
was installed there that day).

```sh
codex exec "..."                 # sharpest of the three on this repo
agy -p "..."                     # antigravity 1.1.10
gemini -p "..."                  # fast; verify its claims, one was wrong
```

Headless `agy` needs
`permissions.allow` in `~/.gemini/antigravity-cli/settings.json`, in the
`name(target)` form — `command(*)`. A bare `read_file` is silently dropped as
malformed and you get the auto-denied-tool error again, which reads as though
the setting were ignored. Alternatively `--sandbox --dangerously-skip-permissions`
works without config; on h1claw that grants unprompted shell to a box holding the
prod SSH key and the PAT, so prefer the config.

Take none of them at face value. On the 2026-08-04 dev review, Codex found a real
critical (migrations never reaching dev) and Gemini asserted a
`docker exec`-runs-as-root failure that does not apply here, because compose sets
`user:`. Both claims looked equally confident.

`/code-review` covers the working diff.

---

## Symptoms

| Symptom                                       | Cause                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `bun: command not found` on h1claw            | non-login shell — export the PATH above                                                           |
| Root `bun test` green, CI red                 | root `bun test` skips fe-01 entirely                                                              |
| CI format fails, files look fine              | `CLAUDE.md`/`GEMINI.md` are symlinks — see `.nxignore`                                            |
| Deploy refuses to run                         | dirty tree, stale `release.json`, unbuilt bundle, or lock held — by design                        |
| `/health` is 200 but the app is broken        | health is a status flag, not a dependency check                                                   |
| Deploy logged success, site unchanged         | `caddy reload` exits 0 having done nothing — check the sha                                        |
| Agent cannot find the repo                    | say the path                                                                                      |
| Dev deploy says OK, dev looks stale           | check dev's HEAD: `ssh h2puni 'git -C /home/puni1/wbs-dev/src rev-parse --short HEAD'`            |
| `dev-deploy.sh` refuses                       | dirty tree, or the commit is not pushed — h2puni pulls from GitHub                                |
| Dev 403s but prod is fine                     | Vite rejects a Host it was not told about — see `allowedHosts` in `apps/wbs/fe-01/vite.config.ts` |
| Only be-01 came up in dev                     | stale Nx lock in the bind mount, or a tier crashed — `docker logs wbs-dev-src`                    |
| Dev tier answers on the wrong port            | two `env_file`s both set `PORT`; per-tier env belongs in `apps/wbs/<tier>/.env`                   |
| `command -v` says a tool is missing on h2puni | non-login shell — use `ssh h2puni 'bash -lc "..."'`                                               |

Known-broken things are in [docs/findings/current.md](./docs/findings/current.md)
— read it before concluding you broke something.

---

## Map

| File                                       | What                          |
| ------------------------------------------ | ----------------------------- |
| [README.md](./README.md)                   | shortest start                |
| **HUMAN_README.md**                        | this — operating the thing    |
| [AGENTS.md](./AGENTS.md)                   | rules, loaded by every agent  |
| [LLM_README.md](./LLM_README.md)           | agent orientation, routing    |
| [docs/findings](./docs/findings/README.md) | landmines, open findings      |
| [docs/local-dev.md](./docs/local-dev.md)   | local detail, troubleshooting |
