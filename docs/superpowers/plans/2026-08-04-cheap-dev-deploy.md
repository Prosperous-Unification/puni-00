# Cheap Dev Deployment Implementation Plan

> **SUPERSEDED — historical record, executed 2026-08-04. Do not follow it.**
>
> Every task here shipped, but three details are wrong on purpose-of-record: the
> plan's `compose.yml` declares `env_file` entries, which the implementation
> rejected after both tiers ended up reading `PORT=3200`; the Node checksum step
> renames the tarball and so verifies nothing; and the restart rule watches only
> `bun.lock`, which misses migrations and Nx serve targets.
>
> For how dev actually works, read `LLM_README.md`. For why each of those
> changed, read the commits between `2304b00` and `e814ad4`. The unchecked
> checkboxes below are an artefact of execution outrunning the document; they do
> not mean the work is outstanding.

**Goal:** Deploy to dev by pulling source on h2puni into a long-lived container whose dev servers already watch for changes — no image build, no registry push, no blue/green swap.

**Architecture:** One container (`wbs-dev-src`) on `wbs-dev-net` bind-mounts a git checkout at `/home/puni1/wbs-dev/src` and runs `bun run dev`, exposing be-01 on 3100, gw-01 on 3200 and the Vite dev server on 4200. `be-01` and `gw-01` run under `bun --watch` and `fe-01` under Vite HMR, so writing new files into the mount **is** the deploy. Caddy's `site-dev.caddy` points its three upstreams at that one container. A dependency change is the only event that restarts anything.

**Tech Stack:** Bun 1.2.20 (runtime + package manager), Node 24.18.1 via Volta (Vite's CLI shebang resolves to node), Docker Compose, Caddy 2.11.4, Elysia, Vite 6, Drizzle + bun:sqlite.

## Global Constraints

- **Never build on h1claw.** A `PreToolUse` hook denies `dagger`, `docker build`, `tool-dagger:*` and `tool-deploy:deploy` there. Every command in this plan runs on h2puni over SSH.
- **Prod and dev share one Caddy container.** A `site-dev.caddy` that fails to load takes prod down with it. `caddy validate` before every reload, and prove the result with `curl`, never with the reload's exit code.
- **`caddy reload` exits 0 when it did nothing.** The admin API is not listening on `:2019` in this deployment, so an HTTP status check against both hostnames is the only available proof.
- **Check tooling on h2puni through a login shell** — `ssh h2puni 'bash -lc "..."'`. Volta and `/usr/local/bin` are absent from a non-login shell's PATH.
- **`be-01.internal` is a network-global Docker alias.** Dev must stay on `wbs-dev-net` or dev's gateway resolves prod's backend.
- **Dev is behind basic auth** (`dany` / value in `/home/puni1/wbs-dev/basic-auth.env`), except `/ws*`, which gw-01 authenticates with a JWT.
- **Prod is untouched by this plan.** No task modifies `site.caddy`, the prod compose files, or `/home/puni1/wbs/`.
- This changes the deploy contract for one environment and so needs an OpenSpec change before it lands: `openspec/changes/cheap-dev-deploy/`. Write the proposal from this plan's Goal and Architecture.

## File Structure

| File                                                       | Responsibility                                                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/dev-src/Dockerfile` (create)                       | The one image build in this design. Bun + Node + git, no application code. Built once on h2puni, rebuilt only when a toolchain version changes. |
| `deploy/dev-src/compose.yml` (create)                      | Declares `wbs-dev-src` on `wbs-dev-net`: the source bind mount, the env files, the three ports, the restart policy.                             |
| `apps/fe-01/vite.config.ts` (modify)                       | Bind the dev server to `0.0.0.0` and allow the public dev hostname. Currently binds localhost only, which no reverse proxy can reach.           |
| `tools/tool-devsync/src/sync.ts` (create)                  | The deploy: fetch, reset to a SHA, decide whether dependencies moved, restart only if they did.                                                 |
| `tools/tool-devsync/src/sync.test.ts` (create)             | Tests for the restart decision, which is the only logic worth testing here.                                                                     |
| `/home/puni1/wbs/caddy/site-dev.caddy` (modify, on h2puni) | Repoint three upstreams from the per-tier image containers to `wbs-dev-src`.                                                                    |

---

### Task 1: Vite dev server reachable from outside its container

**Files:**

- Modify: `apps/fe-01/vite.config.ts:9`
- Test: `apps/fe-01/vite.config.test.ts` (create)

**Interfaces:**

- Produces: a Vite dev server listening on `0.0.0.0:4200` that accepts `Host: dev.wbs.bulletpoints.club`. Task 3 proxies to it; Task 4 routes to it.

Vite binds to localhost by default and, since Vite 6, rejects requests whose `Host` header is not in `server.allowedHosts`. Inside a container both defaults produce a dev site that returns nothing useful, and the failure looks like a Caddy problem rather than a Vite one.

- [ ] **Step 1: Write the failing test**

```ts
// apps/fe-01/vite.config.test.ts
import { describe, expect, it } from 'bun:test';
import config from './vite.config';

describe('vite dev server config', () => {
  it('binds all interfaces so a reverse proxy outside the container can reach it', () => {
    expect(config.server?.host).toBe('0.0.0.0');
  });

  it('accepts the public dev hostname', () => {
    expect(config.server?.allowedHosts).toContain('dev.wbs.bulletpoints.club');
  });

  it('keeps port 4200 so the compose port mapping and Caddy upstream stay correct', () => {
    expect(config.server?.port).toBe(4200);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bunx nx run fe-01:test -- vite.config.test.ts`
Expected: FAIL — `server.host` is `undefined`, `allowedHosts` is `undefined`.

- [ ] **Step 3: Change the config**

```ts
// apps/fe-01/vite.config.ts — replace the existing `server: { port: 4200 },`
  server: {
    port: 4200,
    host: '0.0.0.0',
    // Vite 6 rejects unknown Host headers. Caddy forwards the public name, so
    // without this the dev site answers 403 and the cause is invisible from
    // the proxy side.
    allowedHosts: ['dev.wbs.bulletpoints.club'],
  },
```

- [ ] **Step 4: Run it and watch it pass**

Run: `bunx nx run fe-01:test -- vite.config.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Confirm nothing else broke**

Run: `bunx nx run-many -t test lint typecheck --projects=fe-01`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/fe-01/vite.config.ts apps/fe-01/vite.config.test.ts
git commit -m "Bind the fe-01 dev server to all interfaces and allow the dev host"
```

---

### Task 2: A dev image with both runtimes

**Files:**

- Create: `deploy/dev-src/Dockerfile`

**Interfaces:**

- Produces: image tag `wbs-dev-src:1`, containing `bun` 1.2.20, `node` 24, and `git`, with no application code baked in. Task 3 runs it.

`bun --watch` runs be-01 and gw-01, but `bunx vite` resolves Vite's `#!/usr/bin/env node` shebang and executes under Node. Both runtimes must be present or fe-01 dies on start while be-01 and gw-01 look healthy.

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
# deploy/dev-src/Dockerfile
# The one image in the cheap-dev design. It holds toolchain only: application
# code arrives through a bind mount, so this is rebuilt when Bun or Node moves,
# not when the app changes.
FROM oven/bun:1.2.20-debian

# Vite's bin has a `#!/usr/bin/env node` shebang, so `bunx vite` runs under
# Node, not Bun. Without Node the fe tier fails to start and the other two
# tiers come up fine, which makes the cause hard to see.
ENV NODE_VERSION=24.18.1
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl xz-utils git ca-certificates \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o /tmp/SHASUMS256.txt \
  && (cd /tmp && grep " node-v${NODE_VERSION}-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum -c -) \
  && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
  && rm -rf /tmp/node.tar.xz /tmp/SHASUMS256.txt /var/lib/apt/lists/* \
  && node --version && bun --version

WORKDIR /src
CMD ["bun", "run", "dev"]
```

- [ ] **Step 2: Clone the repo onto h2puni**

The image is built from this checkout, and Task 3 bind-mounts it. It has to exist before either.

```bash
ssh h2puni 'bash -lc "git clone https://github.com/Prosperous-Unification/wbs-tool-v1.git /home/puni1/wbs-dev/src && cd /home/puni1/wbs-dev/src && git rev-parse --short HEAD"'
```

Expected: a clone and a short SHA. The repo is public, so this needs no credentials on h2puni — deliberately, since h2puni holds no GitHub token.

- [ ] **Step 3: Build the image on h2puni**

```bash
ssh h2puni 'bash -lc "cd /home/puni1/wbs-dev/src && docker build -t wbs-dev-src:1 -f deploy/dev-src/Dockerfile deploy/dev-src"'
```

Expected: build succeeds, final layer prints `v24.18.1` and `1.2.20`.

- [ ] **Step 4: Prove both runtimes are present**

```bash
ssh h2puni 'docker run --rm wbs-dev-src:1 bash -lc "node --version; bun --version; git --version"'
```

Expected: `v24.18.1`, `1.2.20`, and a git version. If Node is missing the image is wrong regardless of what the build log said.

- [ ] **Step 5: Commit**

```bash
git add deploy/dev-src/Dockerfile
git commit -m "Add the dev-src toolchain image: bun for be and gw, node for vite"
```

---

### Task 3: The source-run container

**Files:**

- Create: `deploy/dev-src/compose.yml`

**Interfaces:**

- Consumes: `wbs-dev-src:1` from Task 2; the Vite host binding from Task 1.
- Produces: a running container named `wbs-dev-src` on `wbs-dev-net`, answering on ports 3100 (be), 3200 (gw) and 4200 (fe) by container name. Task 4 proxies to those. Task 5 restarts this container by name.

- [ ] **Step 1: Write the compose file**

```yaml
# deploy/dev-src/compose.yml
# Dev runs from source, so there is one container for all three tiers rather
# than a blue/green pair per tier. Prod's topology is unchanged and this file
# never describes it.
services:
  dev-src:
    image: wbs-dev-src:1
    container_name: wbs-dev-src
    working_dir: /src
    # The deploy is a write into this mount. bun --watch and Vite HMR pick it
    # up; nothing here restarts on an ordinary code change.
    volumes:
      - /home/puni1/wbs-dev/src:/src
      - /home/puni1/wbs-dev/data:/data
    env_file:
      - /home/puni1/wbs-dev/.env
      - /home/puni1/wbs-dev/be-01.env
      - /home/puni1/wbs-dev/be-01.secrets.env
      - /home/puni1/wbs-dev/gw-01.env
      - /home/puni1/wbs-dev/gw-01.secrets.env
    networks:
      - wbs-dev-net
    restart: unless-stopped
    command: ['bun', 'run', 'dev']

networks:
  wbs-dev-net:
    external: true
```

- [ ] **Step 2: Install dependencies into the checkout**

The checkout already exists from Task 2 Step 2. `node_modules` must be populated before the container starts, or all three servers exit immediately.

```bash
ssh h2puni 'bash -lc "cd /home/puni1/wbs-dev/src && bun install --frozen-lockfile"'
```

Expected: install completes and `node_modules/` exists.

- [ ] **Step 3: Start it**

```bash
ssh h2puni 'bash -lc "cd /home/puni1/wbs-dev/src && docker compose -f deploy/dev-src/compose.yml up -d && sleep 20 && docker logs --tail 40 wbs-dev-src"'
```

Expected: three servers announce themselves. be-01 on 3100, gw-01 on 3200, Vite on 4200.

- [ ] **Step 4: Prove each tier answers from inside the dev network**

```bash
ssh h2puni 'for p in 3100 3200 4200; do printf "%s -> " "$p"; docker run --rm --network wbs-dev-net curlimages/curl:latest -s -o /dev/null -w "%{http_code}\n" --max-time 5 "http://wbs-dev-src:$p/" || echo FAIL; done'
```

Expected: three HTTP status codes, none of them connection failures. A `000` on 4200 means Task 1's host binding did not take effect.

- [ ] **Step 5: Commit**

```bash
git add deploy/dev-src/compose.yml
git commit -m "Run the dev tiers from a bind-mounted checkout in one container"
```

---

### Task 4: Point the dev site at the source container

**Files:**

- Modify (on h2puni, not in the repo): `/home/puni1/wbs/caddy/site-dev.caddy`

**Interfaces:**

- Consumes: the running `wbs-dev-src` from Task 3.
- Produces: `https://dev.wbs.bulletpoints.club` served from source. The image-based `dev-*-blue` containers become unused but are left running until Task 6.

This edits the config of the Caddy container that also serves prod. Every step here is reversible and the backup is taken first.

- [ ] **Step 1: Back up the current file**

```bash
ssh h2puni 'cd /home/puni1/wbs/caddy && cp -a site-dev.caddy site-dev.caddy.bak-$(date +%Y%m%d-%H%M%S) && ls site-dev.caddy.bak-*'
```

Expected: at least one backup listed.

- [ ] **Step 2: Repoint the three upstreams**

Change exactly three lines, leaving the `basic_auth` block, the `@needs_auth` matcher, the `stream_close_delay` and the log block untouched:

```
	handle /ws* {
		reverse_proxy wbs-dev-src:3200 {
			stream_close_delay 310s
		}
	}

	handle /api/* {
		reverse_proxy wbs-dev-src:3100
	}

	handle {
		reverse_proxy wbs-dev-src:4200
	}
```

- [ ] **Step 3: Validate before reloading**

```bash
ssh h2puni 'docker exec wbs-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | grep -E "Valid|error"'
```

Expected: `Valid configuration`. **If this does not say Valid, stop** — reloading an invalid config takes prod down.

- [ ] **Step 4: Reload**

```bash
ssh h2puni 'docker exec wbs-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile'
```

- [ ] **Step 5: Prove it, because the reload's exit code proves nothing**

Every check below needs the dev password. Load it once per shell:

```bash
DEV_PASS=$(ssh h2puni 'grep ^DEV_BASIC_AUTH_PASS= /home/puni1/wbs-dev/basic-auth.env | cut -d= -f2-')
```

```bash
echo -n "dev no creds (want 401): "; curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 https://dev.wbs.bulletpoints.club/
echo -n "dev with creds (want 200): "; curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 -u "dany:$DEV_PASS" https://dev.wbs.bulletpoints.club/
echo -n "prod (want 200): "; curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 https://wbs.bulletpoints.club/
```

Expected: 401, 200, 200. Any other prod value: restore the backup from Step 1, validate, reload, re-check.

- [ ] **Step 6: Prove the page is served by Vite, not the old image**

```bash
curl -s --max-time 10 -u "dany:$DEV_PASS" https://dev.wbs.bulletpoints.club/ | grep -c "/@vite/client"
```

Expected: `1`. The Vite dev client script is absent from a production build, so this distinguishes the two sources of the same HTML.

---

### Task 5: The deploy itself

**Files:**

- Create: `tools/tool-devsync/src/sync.ts`
- Create: `tools/tool-devsync/src/sync.test.ts`
- Create: `tools/tool-devsync/project.json`

**Interfaces:**

- Consumes: the container name `wbs-dev-src` and checkout path `/home/puni1/wbs-dev/src` from Task 3.
- Produces: `needsRestart(before: string, after: string): boolean` and a CLI entry point `bun tools/tool-devsync/src/sync.ts <sha>`, run over SSH by Task 6.

The only logic worth testing is the restart decision. Everything else is three git commands.

- [ ] **Step 1: Write the failing test**

```ts
// tools/tool-devsync/src/sync.test.ts
import { describe, expect, it } from 'bun:test';
import { needsRestart } from './sync';

describe('needsRestart', () => {
  it('does not restart when the lockfile is unchanged', () => {
    expect(needsRestart('abc123', 'abc123')).toBe(false);
  });

  it('restarts when the lockfile moved, because bun install must run', () => {
    expect(needsRestart('abc123', 'def456')).toBe(true);
  });

  it('restarts when the lockfile hash could not be read before the pull', () => {
    expect(needsRestart('', 'def456')).toBe(true);
  });

  it('restarts when the lockfile hash could not be read after the pull', () => {
    expect(needsRestart('abc123', '')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test tools/tool-devsync/src/sync.test.ts`
Expected: FAIL — cannot resolve `./sync`.

- [ ] **Step 3: Implement**

```ts
// tools/tool-devsync/src/sync.ts
import { $ } from 'bun';

const SRC = '/home/puni1/wbs-dev/src';
const CONTAINER = 'wbs-dev-src';

/**
 * An unreadable hash on either side is treated as "changed". Guessing "no
 * restart needed" from missing evidence is how a dev environment silently
 * runs against stale dependencies.
 */
export function needsRestart(before: string, after: string): boolean {
  if (!before || !after) return true;
  return before !== after;
}

async function lockHash(): Promise<string> {
  try {
    return (await $`sha256sum ${SRC}/bun.lock`.text()).split(' ')[0] ?? '';
  } catch {
    return '';
  }
}

export async function sync(sha: string): Promise<void> {
  const before = await lockHash();

  await $`git -C ${SRC} fetch --quiet origin`;
  await $`git -C ${SRC} reset --hard --quiet ${sha}`;

  const after = await lockHash();

  if (needsRestart(before, after)) {
    console.log('dependencies changed: installing and restarting');
    await $`docker exec ${CONTAINER} bun install --frozen-lockfile`;
    await $`docker restart ${CONTAINER}`;
  } else {
    console.log('code only: watchers will pick it up, nothing restarted');
  }

  console.log(`dev now at ${(await $`git -C ${SRC} rev-parse HEAD`.text()).trim()}`);
}

if (import.meta.main) {
  const sha = process.argv[2];
  if (!sha) {
    console.error('usage: bun sync.ts <sha>');
    process.exit(1);
  }
  await sync(sha);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test tools/tool-devsync/src/sync.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the project so the gate covers it**

```json
{
  "name": "tool-devsync",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "tools/tool-devsync/src",
  "projectType": "application",
  "targets": {
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "bun test", "cwd": "tools/tool-devsync" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": { "command": "bunx tsc --noEmit -p tsconfig.json", "cwd": "tools/tool-devsync" }
    }
  }
}
```

- [ ] **Step 6: Run the full gate**

Run: `bunx nx run-many -t test lint typecheck`
Expected: PASS. The project count goes from 20 to 21.

- [ ] **Step 7: Commit**

```bash
git add tools/tool-devsync
git commit -m "Add dev-sync: pull a sha, restart only when dependencies moved"
```

---

### Task 6: Trigger it from h1claw, and write down what changed

**Files:**

- Create: `bin/dev-deploy.sh`
- Modify: `LLM_README.md` (Deploy section)
- Modify: `HUMAN_README.md` (Everyday work section)

**Interfaces:**

- Consumes: `sync.ts` from Task 5.
- Produces: `bin/dev-deploy.sh`, the single command run after a push.

- [ ] **Step 1: Write the trigger**

```bash
#!/usr/bin/env bash
# Deploy the current HEAD to dev. Run after pushing.
#
# There is no poller and no CI gate: the push happens here, so the trigger
# happens here too. CI still runs and still reports; it is simply not in the
# path between a push and dev being updated.
set -euo pipefail

SHA=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "refusing: working tree is dirty, dev would not match any commit" >&2
  exit 1
fi

if ! git branch -r --contains "$SHA" | grep -q .; then
  echo "refusing: $SHA is not on any remote branch -- push first" >&2
  exit 1
fi

echo "deploying $BRANCH @ ${SHA:0:8} to dev"
ssh h2puni "bash -lc 'cd /home/puni1/wbs-dev/src && bun tools/tool-devsync/src/sync.ts $SHA'"

echo -n "dev responding: "
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 \
  -u "dany:$(ssh h2puni 'grep ^DEV_BASIC_AUTH_PASS= /home/puni1/wbs-dev/basic-auth.env | cut -d= -f2-')" \
  https://dev.wbs.bulletpoints.club/
```

- [ ] **Step 2: Make it executable and run it against the current HEAD**

```bash
chmod +x bin/dev-deploy.sh
./bin/dev-deploy.sh
```

Expected: `code only: watchers will pick it up, nothing restarted`, then `200`.

- [ ] **Step 3: Prove a code change actually reaches dev without a restart**

```bash
ssh h2puni 'docker inspect -f "{{.State.StartedAt}}" wbs-dev-src'   # note this
# make a visible change to apps/fe-01/src, commit, push
./bin/dev-deploy.sh
curl -s -u "dany:$DEV_PASS" https://dev.wbs.bulletpoints.club/ | grep "<your change>"
ssh h2puni 'docker inspect -f "{{.State.StartedAt}}" wbs-dev-src'   # must be unchanged
```

Expected: the change is live and `StartedAt` is identical. If the container restarted, the lockfile comparison in Task 5 is wrong.

- [ ] **Step 4: Retire the image-based dev containers**

```bash
ssh h2puni 'docker stop dev-be-01-blue dev-gw-01-blue dev-fe-01-blue'
```

Leave them stopped rather than removed for one week — they are the rollback if source-run dev turns out to be unstable. `docker start` on all three plus restoring the Caddy backup from Task 4 Step 1 is the full revert.

- [ ] **Step 5: Update both READMEs**

`LLM_README.md`, Deploy section: dev deploys via `bin/dev-deploy.sh`, runs from source, and no longer exercises the image path. Prod is unchanged and still image-based.

`HUMAN_README.md`, Everyday work: dev is `./bin/dev-deploy.sh` after a push; dev is behind basic auth; dev no longer proves the deploy contract, so run a prod dry-run deliberately before shipping.

- [ ] **Step 6: Commit**

```bash
git add bin/dev-deploy.sh LLM_README.md HUMAN_README.md
git commit -m "Deploy dev with one command from h1claw; document what dev no longer proves"
```

---

## What this design gives up

Dev stops exercising the blue/green swap, the health gate, the Caddy repoint and the smoke test. Those ran on dev before they ever ran on prod. After this change, a prod deploy is the first real exercise of that path since the last one.

The mitigation is a habit, not a mechanism: run `bunx nx run tool-deploy:deploy -- --all` as a dry run against prod before any real prod deploy, and keep the image-based dev containers available for a deliberate full-path rehearsal. Task 6 Step 4 stops rather than deletes them for exactly this reason.
