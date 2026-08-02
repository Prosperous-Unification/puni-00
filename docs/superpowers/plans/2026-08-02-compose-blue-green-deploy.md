# Compose + Blue/Green Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the systemd build-on-server deploy with a Dagger-built, Docker Compose, blue/green pipeline that swaps all three tiers without downtime.

**Architecture:** Dagger builds `linux/amd64` images and publishes them to a self-hosted registry, which is the only contract between build and deploy. On h2puni, every service — including the ingress Caddy and the registry — is a Compose service on one `wbs-net` network, with blue and green containers per tier. A swap starts the idle colour, health-gates it, repoints routing, drains, and stops the old one. The live colour is derived from the rendered Caddy config, never trusted from a state file.

**Tech Stack:** Bun, Nx, Dagger (TypeScript SDK), Docker Compose, Caddy 2, `registry:2`, SQLite (`bun:sqlite`) + Drizzle.

**Spec:** `docs/superpowers/specs/2026-08-02-compose-blue-green-deploy-design.md` (revision 2). Decision numbers below refer to it.

## Global Constraints

- **Platform:** every image builds with `--platform linux/amd64`, explicitly, on every build host. Never inherit host architecture.
- **Domain:** `wbs.bulletpoints.club` (app), `registry.infra.bulletpoints.club` (registry), `observability.infra.bulletpoints.club` (Phase 2). No underscores in any hostname — public CAs reject them.
- **Deploy by digest:** the swap pulls `<image>@sha256:…`, never `:<tag>`.
- **Ports:** Caddy publishes `80`, `443`, `443/udp`. Nothing else publishes to the host. The registry is reachable only on `wbs-net`.
- **`stream_close_delay 310s`** on the `/ws*` proxy. Caddy's global `grace_period` stays unset (default: wait indefinitely). Never set it below `stream_close_delay`.
- **Migrations are additive only** — add columns, never drop. Drops happen a release later.
- **Dry-run default:** every destructive CLI defaults to `--dry-run`; `--execute` opts in.
- **Test runner:** `bun test`, run per-project via `nx run <project>:test`. Test files are `*.test.ts` beside the source.
- **Lint/format:** `bunx eslint <project>/src` and Prettier via lefthook pre-commit. Commits will fail the hook if unformatted.
- **Phase 1 only.** The observability stack and SOPS secrets are Phase 2 and out of scope. Secrets stay in `/srv/wbs/.env`.

## File Structure

**New:**

- `apps/be-01/src/repository/db.ts` — single place SQLite connections are opened, with pragmas.
- `apps/{be-01,gw-01,fe-01}/Dockerfile`, `.dockerignore` at repo root — image definitions.
- `tools/tool-dagger/src/lib/publish.ts` — image build + publish + digest capture.
- `tools/tool-remote-scripts/src/lib/{lock,atomic,phase,reconcile,compose,alias}.ts` — swap primitives.
- `tools/tool-compose/src/templates/*` — rewritten from scratch (the current ones are wrong, see Task 6).
- `docs/superpowers/spikes/2026-08-02-dagger-remote-engine.md` — Task 1's output.

**Modified:**

- `apps/be-01/src/repository/migrate.ts` — use `openDatabase`.
- `tools/tool-bootstrap/src/configure.sh` — reduced to docker + tree + linger + registry login.
- `tools/tool-deploy/src/*` — real orchestration replacing `mockRemoteState`.
- `tools/tool-smoke/src/*` — run inside `wbs-net`; real WS check.

**Deleted at cutover (Task 12):** `deploy/deploy.sh`, `deploy/systemd/`, `deploy/caddy/`.

---

### Task 1: Spike the Dagger remote engine

This task is a **spike**, not TDD. Its deliverable is a decision recorded in a document. Nothing else in the plan is safe to build until it resolves, because it decides whether the build host stays swappable or collapses to CI.

**Files:**

- Create: `docs/superpowers/spikes/2026-08-02-dagger-remote-engine.md`

**Interfaces:**

- Consumes: nothing.
- Produces: a decision — `TUNNEL_OK` or `FALL_BACK_TO_CI`. Task 4 reads it to pick its publish path.

- [ ] **Step 1: Install the Dagger CLI locally**

```bash
curl -fsSL https://dl.dagger.io/dagger/install.sh | BIN_DIR=$HOME/.local/bin sh
dagger version
```

- [ ] **Step 2: Start a persistent engine container on h2puni**

The engine needs `--privileged` (it manages its own containers and mounts) and a persistent volume for its build cache. Bind the port to loopback only — the SSH tunnel is the sole access path.

```bash
ssh h2puni 'docker run -d --restart always --privileged \
  -v dagger-engine:/var/lib/dagger \
  -p 127.0.0.1:8080:8080 \
  --name dagger-engine \
  registry.dagger.io/engine:v0.18.10'
ssh h2puni 'docker logs dagger-engine --tail 20'
```

Expected: log lines showing the engine listening. If the image tag has moved on, check `https://hub.docker.com/r/registry.dagger.io/engine/tags` and pin whatever the current stable is — record the exact tag used in the spike doc.

- [ ] **Step 3: Open the tunnel and point Dagger at it**

```bash
ssh -f -N -L 8080:127.0.0.1:8080 h2puni
export _EXPERIMENTAL_DAGGER_RUNNER_HOST=tcp://127.0.0.1:8080
```

- [ ] **Step 4: Build and export a trivial amd64 image through the tunnel**

```bash
cat > /tmp/spike.ts <<'EOF'
import { connect } from '@dagger.io/dagger';

await connect(async (client) => {
  const out = await client
    .container({ platform: 'linux/amd64' })
    .from('alpine:3.20')
    .withExec(['uname', '-m'])
    .stdout();
  console.log('arch reported by the built container:', out.trim());
}, { LogOutput: process.stderr });
EOF
bun add -d @dagger.io/dagger
bun run /tmp/spike.ts
```

Expected: prints `x86_64`. If it prints `aarch64`, the platform pin is not taking effect — that is a finding, record it.

- [ ] **Step 5: Record the outcome**

Write `docs/superpowers/spikes/2026-08-02-dagger-remote-engine.md` containing: the exact engine image tag used, whether step 4 printed `x86_64`, the wall-clock time of the build, any errors, and a one-line verdict — `TUNNEL_OK` or `FALL_BACK_TO_CI`.

If the verdict is `FALL_BACK_TO_CI`, **stop and report to the user before continuing.** Task 4 changes shape and the plan needs revising.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/spikes/2026-08-02-dagger-remote-engine.md
git commit -m "docs(spike): dagger remote engine over ssh tunnel"
```

---

### Task 2: SQLite WAL + busy_timeout

Decision 8. This is the prerequisite that makes blue/green safe at all, and it improves the **currently live** systemd deployment too, so it ships first and independently.

**Files:**

- Create: `apps/be-01/src/repository/db.ts`
- Create: `apps/be-01/src/repository/db.test.ts`
- Modify: `apps/be-01/src/repository/migrate.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `openDatabase(dbPath: string): Database` and `assertPragmas(db: Database): void`. Every later task that opens SQLite uses `openDatabase`, never `new Database` directly.

- [ ] **Step 1: Write the failing test**

Note `:memory:` databases **cannot** use WAL — SQLite reports `memory` for them — so these tests must use a real temp file.

```typescript
// apps/be-01/src/repository/db.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertPragmas, openDatabase } from './db';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-db-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('enables WAL journal mode', () => {
    const db = openDatabase(join(dir, 'test.db'));
    const row = db.query<{ journal_mode: string }, []>('PRAGMA journal_mode;').get();
    expect(row?.journal_mode.toLowerCase()).toBe('wal');
    db.close();
  });

  it('sets a non-zero busy timeout', () => {
    const db = openDatabase(join(dir, 'test.db'));
    const row = db.query<{ timeout: number }, []>('PRAGMA busy_timeout;').get();
    expect(row?.timeout).toBeGreaterThanOrEqual(5000);
    db.close();
  });

  it('assertPragmas passes on a correctly opened database', () => {
    const db = openDatabase(join(dir, 'test.db'));
    expect(() => {
      assertPragmas(db);
    }).not.toThrow();
    db.close();
  });

  it('assertPragmas throws when WAL is absent', () => {
    const db = openDatabase(join(dir, 'test.db'));
    db.exec('PRAGMA journal_mode = DELETE;');
    expect(() => {
      assertPragmas(db);
    }).toThrow(/journal_mode/);
    db.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx nx run be-01:test`
Expected: FAIL — `Cannot find module './db'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/be-01/src/repository/db.ts
import { Database } from 'bun:sqlite';

const BUSY_TIMEOUT_MS = 5000;

/**
 * The only place a SQLite connection is opened.
 *
 * Blue/green runs two be-01 processes against one database file during a swap.
 * Without WAL, a writer takes an EXCLUSIVE lock that blocks readers too, and
 * with the default busy_timeout of 0 the other process fails instantly rather
 * than waiting. Both pragmas are load-bearing for zero-downtime deploys.
 */
export function openDatabase(dbPath: string): Database {
  const db = new Database(dbPath, { create: true });
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`PRAGMA busy_timeout = ${String(BUSY_TIMEOUT_MS)};`);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

/** Fails loudly at startup if the pragmas ever regress. */
export function assertPragmas(db: Database): void {
  const journal = db.query<{ journal_mode: string }, []>('PRAGMA journal_mode;').get();
  const mode = journal?.journal_mode.toLowerCase();
  if (mode !== 'wal') {
    throw new Error(`expected journal_mode=wal, got ${mode ?? 'unknown'}`);
  }
  const busy = db.query<{ timeout: number }, []>('PRAGMA busy_timeout;').get();
  if (busy === null || busy.timeout < BUSY_TIMEOUT_MS) {
    throw new Error(
      `expected busy_timeout>=${String(BUSY_TIMEOUT_MS)}, got ${String(busy?.timeout)}`,
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx nx run be-01:test`
Expected: PASS, 4 new tests.

- [ ] **Step 5: Route migrations through it**

```typescript
// apps/be-01/src/repository/migrate.ts
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

import { assertPragmas, openDatabase } from './db';

export function runMigrations(dbPath: string, migrationsFolder: string): void {
  const sqlite = openDatabase(dbPath);
  assertPragmas(sqlite);
  const db = drizzle({ client: sqlite });
  migrate(db, { migrationsFolder });
  sqlite.close();
}
```

- [ ] **Step 6: Find and convert every other `new Database` call site**

Run: `grep -rn "new Database" apps/ libs/ --include=*.ts`
Replace each non-test occurrence with `openDatabase`. Test fixtures in `libs/validation/src/fixtures/db.ts` may legitimately keep `:memory:` — if so, leave them and note why in the commit.

- [ ] **Step 7: Run the full suite**

Run: `bunx nx run-many -t test`
Expected: all projects pass.

- [ ] **Step 8: Commit**

```bash
git add apps/be-01/src/repository/db.ts apps/be-01/src/repository/db.test.ts apps/be-01/src/repository/migrate.ts
git commit -m "fix(be-01): open SQLite with WAL and a busy timeout

Blue/green runs two be-01 processes against one database file. Without WAL a
writer blocks readers, and with busy_timeout at its default of 0 the other
process fails instantly instead of waiting."
```

---

### Task 3: Dockerfiles for the three tiers

**Files:**

- Create: `apps/be-01/Dockerfile`, `apps/gw-01/Dockerfile`, `apps/fe-01/Dockerfile`
- Create: `.dockerignore`

**Interfaces:**

- Consumes: `openDatabase` from Task 2 (indirectly, via the app).
- Produces: three buildable images. be-01 and gw-01 expose `3100`/`3200` and serve `/health`; fe-01 serves static files on `80`.

- [ ] **Step 1: Write `.dockerignore`**

Without this, the build context includes `node_modules` and `.git` and every build crawls.

```
node_modules
dist
.git
.nx
.worktrees
**/*.test.ts
docs
openspec
```

- [ ] **Step 2: Write the be-01 Dockerfile**

```dockerfile
# apps/be-01/Dockerfile
FROM oven/bun:1.2.20-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.2.20-alpine AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY libs ./libs
COPY apps/be-01 ./apps/be-01
# runMigrations() resolves './drizzle' relative to cwd.
WORKDIR /app/apps/be-01
EXPOSE 3100
CMD ["bun", "run", "src/main.ts"]
```

- [ ] **Step 3: Write the gw-01 Dockerfile**

```dockerfile
# apps/gw-01/Dockerfile
FROM oven/bun:1.2.20-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.2.20-alpine AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY libs ./libs
COPY apps/gw-01 ./apps/gw-01
WORKDIR /app/apps/gw-01
EXPOSE 3200
CMD ["bun", "run", "src/main.ts"]
```

- [ ] **Step 4: Write the fe-01 Dockerfile**

Decision 5: fe-01 is a normal static-server container, not a data image.

```dockerfile
# apps/fe-01/Dockerfile
FROM oven/bun:1.2.20-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.base.json nx.json ./
COPY libs ./libs
COPY apps/fe-01 ./apps/fe-01
ARG VITE_BE_URL
ARG VITE_GW_URL
ARG VITE_WS_URL
RUN bunx nx run fe-01:build

FROM caddy:2-alpine AS runtime
COPY --from=build /app/dist/apps/fe-01 /srv/www
COPY apps/fe-01/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
```

- [ ] **Step 5: Write fe-01's internal Caddyfile**

```
# apps/fe-01/Caddyfile
:80 {
	root * /srv/www
	try_files {path} /index.html
	file_server
	encode gzip
}
```

- [ ] **Step 6: Build all three for amd64 and verify they run**

```bash
docker build --platform linux/amd64 -f apps/be-01/Dockerfile -t wbs-be-01:local .
docker build --platform linux/amd64 -f apps/gw-01/Dockerfile -t wbs-gw-01:local .
docker build --platform linux/amd64 -f apps/fe-01/Dockerfile \
  --build-arg VITE_BE_URL=http://localhost --build-arg VITE_GW_URL=http://localhost \
  --build-arg VITE_WS_URL=ws://localhost/ws -t wbs-fe-01:local .

docker run --rm -d --name fe-check -p 8081:80 wbs-fe-01:local
curl -fsS http://localhost:8081/ | head -c 100
docker rm -f fe-check
```

Expected: three successful builds; the curl returns HTML containing `<div id="root"`.

- [ ] **Step 7: Commit**

```bash
git add .dockerignore apps/be-01/Dockerfile apps/gw-01/Dockerfile apps/fe-01/Dockerfile apps/fe-01/Caddyfile
git commit -m "feat(deploy): dockerfiles for be-01, gw-01, fe-01"
```

---

### Task 4: tool-dagger publishes real images

**Files:**

- Create: `tools/tool-dagger/src/lib/publish.ts`
- Create: `tools/tool-dagger/src/lib/publish.test.ts`
- Modify: `tools/tool-dagger/src/{main,be-01,gw-01,fe-01}.ts`, `tools/tool-dagger/project.json`

**Interfaces:**

- Consumes: Task 1's verdict; Task 3's Dockerfiles.
- Produces: `imageRef(registry, tier, sha): string`, `parseDigest(publishOutput: string): string`, and an Nx target `publish-all` writing `dist/tool-dagger/release.json` shaped `{ [tier]: { sha, digest, ref } }`. Task 9 reads that file.

- [ ] **Step 1: Write the failing test for the pure helpers**

```typescript
// tools/tool-dagger/src/lib/publish.test.ts
import { describe, expect, it } from 'bun:test';

import { imageRef, parseDigest, type ReleaseRecord, renderRelease } from './publish';

describe('imageRef', () => {
  it('builds a registry-qualified tagged ref', () => {
    expect(imageRef('registry.infra.bulletpoints.club', 'be', 'abc1234')).toBe(
      'registry.infra.bulletpoints.club/wbs-be-01:abc1234',
    );
  });

  it('rejects an empty sha rather than publishing a floating tag', () => {
    expect(() => imageRef('r.example.com', 'be', '')).toThrow(/sha/);
  });
});

describe('parseDigest', () => {
  it('extracts the digest from a publish result', () => {
    const out = 'registry.infra.bulletpoints.club/wbs-be-01:abc1234@sha256:' + 'a'.repeat(64);
    expect(parseDigest(out)).toBe('sha256:' + 'a'.repeat(64));
  });

  it('throws when no digest is present, so a deploy never falls back to a tag', () => {
    expect(() => parseDigest('registry.example.com/wbs-be-01:abc1234')).toThrow(/digest/);
  });
});

describe('renderRelease', () => {
  it('round-trips through JSON', () => {
    const rec: ReleaseRecord = {
      be: { sha: 'abc1234', digest: 'sha256:' + 'b'.repeat(64), ref: 'r/wbs-be-01:abc1234' },
    };
    expect(JSON.parse(renderRelease(rec))).toEqual(rec);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx nx run tool-dagger:test`
Expected: FAIL — `Cannot find module './publish'`.

- [ ] **Step 3: Write the implementation**

```typescript
// tools/tool-dagger/src/lib/publish.ts
export type Tier = 'be' | 'gw' | 'fe';

const IMAGE_NAME: Record<Tier, string> = {
  be: 'wbs-be-01',
  gw: 'wbs-gw-01',
  fe: 'wbs-fe-01',
};

const DIGEST_RE = /@(sha256:[0-9a-f]{64})\b/;

export interface ReleaseEntry {
  sha: string;
  digest: string;
  ref: string;
}

export type ReleaseRecord = Partial<Record<Tier, ReleaseEntry>>;

export function imageRef(registry: string, tier: Tier, sha: string): string {
  if (sha.trim() === '') {
    throw new Error('refusing to build an image ref with an empty sha');
  }
  return `${registry}/${IMAGE_NAME[tier]}:${sha}`;
}

/**
 * Deploys pull by digest, never by tag — a rebuild on a different build host can
 * move a tag but cannot move a digest. A publish that reports no digest is a
 * hard failure rather than a silent downgrade to tag-based deploys.
 */
export function parseDigest(publishOutput: string): string {
  const m = DIGEST_RE.exec(publishOutput);
  if (!m?.[1]) {
    throw new Error(`no digest found in publish output: ${publishOutput}`);
  }
  return m[1];
}

export function renderRelease(rec: ReleaseRecord): string {
  return JSON.stringify(rec, null, 2) + '\n';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx nx run tool-dagger:test`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire the real Dagger build**

```typescript
// tools/tool-dagger/src/main.ts
import { connect } from '@dagger.io/dagger';

import { imageRef, parseDigest, type ReleaseRecord, renderRelease, type Tier } from './lib/publish';

const DOCKERFILE: Record<Tier, string> = {
  be: 'apps/be-01/Dockerfile',
  gw: 'apps/gw-01/Dockerfile',
  fe: 'apps/fe-01/Dockerfile',
};

const PUBLIC_URL = process.env['WBS_PUBLIC_URL'] ?? 'https://wbs.bulletpoints.club';
const REGISTRY = process.env['REGISTRY'] ?? 'registry.infra.bulletpoints.club';

function buildArgs(tier: Tier): { name: string; value: string }[] {
  if (tier !== 'fe') return [];
  const wsHost = PUBLIC_URL.replace(/^https?:\/\//, '');
  const wsScheme = PUBLIC_URL.startsWith('https://') ? 'wss' : 'ws';
  return [
    { name: 'VITE_BE_URL', value: PUBLIC_URL },
    { name: 'VITE_GW_URL', value: PUBLIC_URL },
    { name: 'VITE_WS_URL', value: `${wsScheme}://${wsHost}/ws` },
  ];
}

export async function publishAll(tiers: Tier[], sha: string): Promise<ReleaseRecord> {
  const record: ReleaseRecord = {};
  await connect(
    async (client) => {
      const src = client
        .host()
        .directory('.', { exclude: ['node_modules', 'dist', '.git', '.nx'] });
      for (const tier of tiers) {
        const ref = imageRef(REGISTRY, tier, sha);
        // Platform is pinned explicitly so an arm64 client produces the same
        // image as an amd64 CI runner.
        const published = await client
          .container({ platform: 'linux/amd64' })
          .build(src, { dockerfile: DOCKERFILE[tier], buildArgs: buildArgs(tier) })
          .publish(ref);
        record[tier] = { sha, digest: parseDigest(published), ref };
      }
    },
    { LogOutput: process.stderr },
  );
  return record;
}

async function main(): Promise<void> {
  const sha = process.env['WBS_SHA'];
  if (sha === undefined || sha === '') throw new Error('WBS_SHA must be set');
  const arg = process.argv[2] ?? 'be,gw,fe';
  const tiers = arg.split(',').filter((t): t is Tier => t === 'be' || t === 'gw' || t === 'fe');
  const record = await publishAll(tiers, sha);
  await Bun.write('dist/tool-dagger/release.json', renderRelease(record));
  console.log(renderRelease(record));
}

if (import.meta.main) {
  await main();
}
```

- [ ] **Step 6: Add the Nx target**

Add to `tools/tool-dagger/project.json` under `targets`:

```json
"publish-all": {
  "executor": "nx:run-commands",
  "options": {
    "command": "WBS_SHA=$(git rev-parse --short HEAD) bun run tools/tool-dagger/src/main.ts",
    "parallel": false
  },
  "cache": false
}
```

- [ ] **Step 7: Publish for real through the tunnel**

Requires Task 5's registry to exist. If running tasks in order, defer this step until Task 5 completes, then return here.

```bash
export _EXPERIMENTAL_DAGGER_RUNNER_HOST=tcp://127.0.0.1:8080
bunx nx run tool-dagger:publish-all
cat dist/tool-dagger/release.json
```

Expected: three entries, each with a `sha256:` digest of 64 hex characters.

- [ ] **Step 8: Commit**

```bash
git add tools/tool-dagger/
git commit -m "feat(tool-dagger): build and publish real amd64 images by digest"
```

---

### Task 5: Host configuration — docker, registry, Caddy

Decisions 1 and 3. Rewrites `configure.sh`: no bun, no host caddy, no sudoers rule.

**Files:**

- Modify: `tools/tool-bootstrap/src/configure.sh` (substantial rewrite)
- Create: `deploy/compose/base.yml`

**Interfaces:**

- Consumes: nothing.
- Produces: on h2puni — `/srv/wbs/{data,logs,caddy,state}`, a `wbs-net` network, running `caddy` and `registry` containers, and `~/.docker/config.json` holding registry credentials.

- [ ] **Step 1: Rewrite configure.sh**

```sh
#!/bin/sh
# One-time host configuration for the wbs-tool stack (Compose model).
#
# Everything here needs root and runs once per host. After this, all deploy
# operations run unprivileged as $WBS_USER via the docker group.
#
# Usage: sudo WBS_USER=puni1 REGISTRY_USER=wbs REGISTRY_PASS=<pw> sh configure.sh
set -eu

WBS_USER="${WBS_USER:-puni1}"
WBS_ROOT="${WBS_ROOT:-/srv/wbs}"
REGISTRY_HOST="${REGISTRY_HOST:-registry.infra.bulletpoints.club}"
REGISTRY_USER="${REGISTRY_USER:-wbs}"

log() { printf '[configure] %s\n' "$*"; }
die() { printf '[configure] %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "must run as root"
id "$WBS_USER" >/dev/null 2>&1 || die "user '$WBS_USER' does not exist"
[ -n "${REGISTRY_PASS:-}" ] || die "REGISTRY_PASS must be set"

log "installing docker + htpasswd"
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl git docker.io docker-compose-v2 apache2-utils
usermod -aG docker "$WBS_USER"

log "creating $WBS_ROOT"
for d in "$WBS_ROOT" "$WBS_ROOT/data" "$WBS_ROOT/logs" "$WBS_ROOT/caddy" "$WBS_ROOT/state"; do
  mkdir -p "$d"
done
[ -f "$WBS_ROOT/.env" ] || touch "$WBS_ROOT/.env"
chown -R "$WBS_USER:$WBS_USER" "$WBS_ROOT"
chmod 0750 "$WBS_ROOT"
chmod 0600 "$WBS_ROOT/.env"

log "writing registry htpasswd"
# bcrypt (-B) is the only format registry:2 accepts.
htpasswd -Bbn "$REGISTRY_USER" "$REGISTRY_PASS" > "$WBS_ROOT/registry.htpasswd"
chown "$WBS_USER:$WBS_USER" "$WBS_ROOT/registry.htpasswd"
chmod 0640 "$WBS_ROOT/registry.htpasswd"

log "enabling systemd lingering for $WBS_USER"
loginctl enable-linger "$WBS_USER"

log "logging the host docker daemon in to $REGISTRY_HOST"
# The server pulls its own images. Without this, `docker compose up` fails to
# authenticate against the registry it is itself hosting.
su - "$WBS_USER" -c "echo '$REGISTRY_PASS' | docker login '$REGISTRY_HOST' -u '$REGISTRY_USER' --password-stdin"

log "done. '$WBS_USER' can now deploy without root."
```

- [ ] **Step 2: Write the base compose file**

Note the `caddy_data` volume — without it Caddy re-requests certificates on every restart and hits Let's Encrypt rate limits.

```yaml
# deploy/compose/base.yml
name: wbs

networks:
  wbs-net:
    driver: bridge

volumes:
  caddy_data:
  caddy_config:
  registry_data:

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    networks: [wbs-net]
    ports:
      - '80:80'
      - '443:443'
      - '443:443/udp'
    volumes:
      - caddy_data:/data
      - caddy_config:/config
      - /srv/wbs/caddy:/etc/caddy:ro
      - /srv/wbs/logs:/var/log/caddy

  registry:
    image: registry:2
    restart: unless-stopped
    networks: [wbs-net]
    # Deliberately NOT published to the host: a containerised Caddy reaches it
    # by container DNS, and nothing else should reach it at all.
    environment:
      REGISTRY_AUTH: htpasswd
      REGISTRY_AUTH_HTPASSWD_REALM: wbs
      REGISTRY_AUTH_HTPASSWD_PATH: /auth/htpasswd
      REGISTRY_STORAGE_DELETE_ENABLED: 'true'
    volumes:
      - registry_data:/var/lib/registry
      - /srv/wbs/registry.htpasswd:/auth/htpasswd:ro
```

- [ ] **Step 3: Run configure.sh on h2puni**

```bash
scp tools/tool-bootstrap/src/configure.sh h2puni:/tmp/
ssh h2puni "sudo WBS_USER=puni1 REGISTRY_USER=wbs REGISTRY_PASS='<choose-a-password>' sh /tmp/configure.sh"
```

Store the password in `/srv/wbs/.env` as `REGISTRY_PASS=` so later deploys can re-authenticate.

- [ ] **Step 4: Bring up the base services and verify**

```bash
ssh h2puni 'mkdir -p ~/wd/puni/wbs-tool/wbs-tool-v1'
scp deploy/compose/base.yml h2puni:/srv/wbs/
ssh h2puni 'docker compose -f /srv/wbs/base.yml up -d && docker compose -f /srv/wbs/base.yml ps'
```

Expected: `caddy` and `registry` both `running`. Caddy will log a config error until Task 6 writes a Caddyfile — that is expected at this point.

- [ ] **Step 5: Commit**

```bash
git add tools/tool-bootstrap/src/configure.sh deploy/compose/base.yml
git commit -m "feat(deploy): compose base — caddy + authenticated registry, no host bun"
```

---

### Task 6: Rewrite the Compose and Caddy templates

Decision 11. The existing templates are actively wrong: they publish app ports to the host, and `be.caddy.tmpl` uses `handle_path`, which strips `/api` before be-01 — but be-01 mounts its controllers under `/api` already, so every request would 404.

**Files:**

- Delete: all of `tools/tool-compose/src/templates/`
- Create: `tools/tool-compose/src/templates/{tier.compose.tmpl,site.caddy.tmpl,tier.caddy.tmpl}`
- Modify: `tools/tool-compose/src/render.test.ts`

**Interfaces:**

- Consumes: `renderTemplate`/`renderAll` from the existing `render.ts` (unchanged, it is sound).
- Produces: templates whose placeholders are `TIER`, `COLOR`, `IMAGE`, `PORT`, `SITE_ADDRESS`, `BE_COLOR`, `GW_COLOR`, `FE_COLOR`.

- [ ] **Step 1: Delete the old templates**

```bash
git rm -r tools/tool-compose/src/templates
mkdir -p tools/tool-compose/src/templates
```

- [ ] **Step 2: Write the per-tier compose template**

```yaml
# tools/tool-compose/src/templates/tier.compose.tmpl
services:
  {{TIER}}-{{COLOR}}:
    image: {{IMAGE}}
    restart: unless-stopped
    networks:
      wbs-net:
        aliases:
          - {{TIER}}-{{COLOR}}
    env_file:
      - /srv/wbs/.env
      - /srv/wbs/{{TIER}}.env
    volumes:
      - /srv/wbs/data:/data
```

- [ ] **Step 3: Write the site template**

`stream_close_delay` is load-bearing: without it Caddy forcibly closes every WebSocket the instant the config reloads, which is precisely the downtime blue/green exists to prevent.

```
# tools/tool-compose/src/templates/site.caddy.tmpl
{{SITE_ADDRESS}} {
	encode gzip

	handle /ws* {
		reverse_proxy gw-01-{{GW_COLOR}}:3200 {
			# Without this, a config reload severs every live WebSocket
			# immediately and the drain loop below has nothing left to drain.
			stream_close_delay 310s
		}
	}

	# be-01 mounts its controllers under /api already, so the prefix is passed
	# through with `handle`, NOT stripped with `handle_path`.
	handle /api/* {
		reverse_proxy be-01-{{BE_COLOR}}:3100
	}

	handle {
		reverse_proxy fe-01-{{FE_COLOR}}:80
	}

	log {
		output file /var/log/caddy/access.log
	}
}

registry.infra.bulletpoints.club {
	reverse_proxy registry:5000 {
		header_up X-Forwarded-Proto {scheme}
		header_up X-Forwarded-For {remote_host}
	}
	request_body {
		max_size 2GB
	}
}
```

- [ ] **Step 4: Write the failing test for placeholder coverage**

```typescript
// append to tools/tool-compose/src/render.test.ts
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderTemplate } from './render';

const TEMPLATES = join(import.meta.dir, 'templates');

describe('site.caddy.tmpl', () => {
  const tmpl = readFileSync(join(TEMPLATES, 'site.caddy.tmpl'), 'utf8');

  it('renders with every placeholder supplied', () => {
    const out = renderTemplate(tmpl, {
      SITE_ADDRESS: 'wbs.bulletpoints.club',
      BE_COLOR: 'green',
      GW_COLOR: 'blue',
      FE_COLOR: 'green',
    });
    expect(out).toContain('be-01-green:3100');
    expect(out).toContain('gw-01-blue:3200');
    expect(out).toContain('fe-01-green:80');
    expect(out).not.toContain('{{');
  });

  it('keeps stream_close_delay above the drain ceiling', () => {
    expect(tmpl).toContain('stream_close_delay 310s');
  });

  it('passes /api through rather than stripping it', () => {
    // handle_path would strip /api, but be-01 mounts its controllers under /api.
    expect(tmpl).not.toContain('handle_path /api');
    expect(tmpl).toContain('handle /api/*');
  });
});
```

- [ ] **Step 5: Run the test**

Run: `bunx nx run tool-compose:test`
Expected: PASS. If it fails on a missing placeholder, the template and test disagree — fix the template.

- [ ] **Step 6: Commit**

```bash
git add tools/tool-compose/
git commit -m "feat(tool-compose): rewrite templates for blue/green on wbs-net

The previous templates published app ports to the host and used handle_path
for /api, which strips the prefix be-01 actually mounts under."
```

---

### Task 7: Swap planner — pure functions

Decision 6. The live colour is derived from observed reality, never trusted from the state file. This task is all pure logic and therefore all unit-tested.

**Files:**

- Create: `tools/tool-remote-scripts/src/lib/reconcile.ts`
- Create: `tools/tool-remote-scripts/src/lib/reconcile.test.ts`
- Modify: `tools/tool-remote-scripts/src/lib/state.ts`

**Interfaces:**

- Consumes: `Tier`, `Color`, `flipColor` from `./state`.
- Produces: `type Phase`, `interface Observed`, `resolveLiveColor(o: Observed): Color | null`, `planSwap(tier, observed): SwapPlan` where `SwapPlan = { tier, from: Color | null, to: Color, steps: SwapStep[] }`, and `type SwapStep = 'start-green' | 'migrate' | 'health-gate' | 'move-alias' | 'render-route' | 'reload' | 'drain' | 'stop-blue' | 'commit'`.

- [ ] **Step 1: Extend state.ts with the phase type**

```typescript
// append to tools/tool-remote-scripts/src/lib/state.ts
export type Color = 'blue' | 'green';

/**
 * Where a deploy got to. Written before each transition so a killed deploy can
 * be classified without guessing.
 */
export type Phase = 'preparing' | 'routed' | 'old-stopped' | 'committed';

export const PHASES: readonly Phase[] = ['preparing', 'routed', 'old-stopped', 'committed'];

export function isPhase(v: string): v is Phase {
  return (PHASES as readonly string[]).includes(v);
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tools/tool-remote-scripts/src/lib/reconcile.test.ts
import { describe, expect, it } from 'bun:test';

import { type Observed, planSwap, resolveLiveColor } from './reconcile';

const base: Observed = {
  routedColor: 'blue',
  runningColors: ['blue'],
  recordedColor: 'blue',
  phase: 'committed',
};

describe('resolveLiveColor', () => {
  it('trusts the routing layer when it agrees with the state file', () => {
    expect(resolveLiveColor(base)).toBe('blue');
  });

  it('prefers the routing layer when the state file disagrees', () => {
    // The exact split-brain a deploy killed between reload and commit produces.
    expect(
      resolveLiveColor({
        routedColor: 'green',
        runningColors: ['blue', 'green'],
        recordedColor: 'blue',
        phase: 'routed',
      }),
    ).toBe('green');
  });

  it('falls back to the state file when nothing is routed but its container runs', () => {
    expect(
      resolveLiveColor({
        routedColor: null,
        runningColors: ['blue'],
        recordedColor: 'blue',
        phase: 'committed',
      }),
    ).toBe('blue');
  });

  it('returns null when the recorded colour is not actually running', () => {
    expect(
      resolveLiveColor({
        routedColor: null,
        runningColors: [],
        recordedColor: 'blue',
        phase: 'committed',
      }),
    ).toBeNull();
  });
});

describe('planSwap', () => {
  it('targets the colour that is not live', () => {
    const plan = planSwap('be', base);
    expect(plan.from).toBe('blue');
    expect(plan.to).toBe('green');
  });

  it('deploys to blue on a first-ever deploy', () => {
    const plan = planSwap('be', {
      routedColor: null,
      runningColors: [],
      recordedColor: null,
      phase: null,
    });
    expect(plan.from).toBeNull();
    expect(plan.to).toBe('blue');
  });

  it('includes migrate and move-alias for be, in that order, before routing', () => {
    const plan = planSwap('be', base);
    expect(plan.steps).toContain('migrate');
    expect(plan.steps.indexOf('migrate')).toBeLessThan(plan.steps.indexOf('health-gate'));
    expect(plan.steps.indexOf('move-alias')).toBeLessThan(plan.steps.indexOf('reload'));
  });

  it('includes drain for gw but not for be or fe', () => {
    expect(planSwap('gw', base).steps).toContain('drain');
    expect(planSwap('be', base).steps).not.toContain('drain');
    expect(planSwap('fe', base).steps).not.toContain('drain');
  });

  it('never includes migrate or move-alias for gw or fe', () => {
    for (const tier of ['gw', 'fe'] as const) {
      expect(planSwap(tier, base).steps).not.toContain('migrate');
      expect(planSwap(tier, base).steps).not.toContain('move-alias');
    }
  });

  it('always ends by committing', () => {
    expect(planSwap('fe', base).steps.at(-1)).toBe('commit');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bunx nx run tool-remote-scripts:test`
Expected: FAIL — `Cannot find module './reconcile'`.

- [ ] **Step 4: Write the implementation**

```typescript
// tools/tool-remote-scripts/src/lib/reconcile.ts
import { type Color, flipColor, type Phase, type Tier } from './state';

export interface Observed {
  /** Colour the live Caddy config actually routes to. The source of truth. */
  routedColor: Color | null;
  /** Colours with a running container, from `docker compose ps`. */
  runningColors: Color[];
  /** Colour the state file claims. A cache, and possibly stale. */
  recordedColor: Color | null;
  phase: Phase | null;
}

export type SwapStep =
  | 'start-green'
  | 'migrate'
  | 'health-gate'
  | 'move-alias'
  | 'render-route'
  | 'reload'
  | 'drain'
  | 'stop-blue'
  | 'commit';

export interface SwapPlan {
  tier: Tier;
  from: Color | null;
  to: Color;
  steps: SwapStep[];
}

/**
 * Routing wins over the state file, always.
 *
 * A deploy killed between `caddy reload` and the state write leaves Caddy
 * serving green while the file still says blue. Believing the file would make
 * the next deploy tear down the container serving production traffic.
 */
export function resolveLiveColor(o: Observed): Color | null {
  if (o.routedColor !== null) return o.routedColor;
  if (o.recordedColor !== null && o.runningColors.includes(o.recordedColor)) {
    return o.recordedColor;
  }
  return null;
}

export function planSwap(tier: Tier, observed: Observed): SwapPlan {
  const from = resolveLiveColor(observed);
  const to = from === null ? 'blue' : flipColor(from);

  const steps: SwapStep[] = ['start-green'];
  // Migrations run as a discrete step before green takes traffic, so a failure
  // aborts with the old colour untouched and un-migrated.
  if (tier === 'be') steps.push('migrate');
  steps.push('health-gate');
  // gw-01 reads BE_URL once at startup, so a be swap moves a stable network
  // alias rather than reconfiguring gw.
  if (tier === 'be') steps.push('move-alias');
  steps.push('render-route', 'reload');
  if (tier === 'gw') steps.push('drain');
  if (from !== null) steps.push('stop-blue');
  steps.push('commit');
  return { tier, from, to, steps };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bunx nx run tool-remote-scripts:test`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add tools/tool-remote-scripts/src/lib/reconcile.ts tools/tool-remote-scripts/src/lib/reconcile.test.ts tools/tool-remote-scripts/src/lib/state.ts
git commit -m "feat(remote-scripts): derive live colour from routing, not state file"
```

---

### Task 8: Swap safety primitives — lock, atomic write, phase marker

Decision 6. Without these, two concurrent deploys corrupt each other and a crash can leave a half-written Caddyfile that a later Caddy restart happily loads.

**Files:**

- Create: `tools/tool-remote-scripts/src/lib/lock.ts`, `lib/atomic.ts`, `lib/phase.ts`
- Create: `tools/tool-remote-scripts/src/lib/safety.test.ts`

**Interfaces:**

- Consumes: `Phase`, `isPhase` from `./state`.
- Produces: `withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T>`, `writeAtomic(path: string, contents: string): Promise<void>`, `readPhase(path)` / `writePhase(path, phase)`.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/tool-remote-scripts/src/lib/safety.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeAtomic } from './atomic';
import { withLock } from './lock';
import { readPhase, writePhase } from './phase';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-safety-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writeAtomic', () => {
  it('writes the full contents', async () => {
    const p = join(dir, 'out.caddy');
    await writeAtomic(p, 'hello');
    expect(readFileSync(p, 'utf8')).toBe('hello');
  });

  it('overwrites an existing file without leaving a temp behind', async () => {
    const p = join(dir, 'out.caddy');
    await writeAtomic(p, 'first');
    await writeAtomic(p, 'second');
    expect(readFileSync(p, 'utf8')).toBe('second');
    expect(existsSync(`${p}.tmp`)).toBe(false);
  });
});

describe('withLock', () => {
  it('runs the callback and returns its value', async () => {
    const result = await withLock(join(dir, 'deploy.lock'), () => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('refuses a second concurrent holder', async () => {
    const lockPath = join(dir, 'deploy.lock');
    let inner: unknown = null;
    await withLock(lockPath, async () => {
      inner = await withLock(lockPath, () => Promise.resolve('should not run')).catch(
        (e: Error) => e.message,
      );
    });
    expect(String(inner)).toMatch(/lock/i);
  });

  it('releases the lock even when the callback throws', async () => {
    const lockPath = join(dir, 'deploy.lock');
    await expect(withLock(lockPath, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    await expect(withLock(lockPath, () => Promise.resolve('ok'))).resolves.toBe('ok');
  });
});

describe('phase', () => {
  it('round-trips a phase', async () => {
    const p = join(dir, 'be.phase');
    await writePhase(p, 'routed');
    expect(await readPhase(p)).toBe('routed');
  });

  it('returns null for a missing marker', async () => {
    expect(await readPhase(join(dir, 'nope.phase'))).toBeNull();
  });

  it('rejects an unrecognised phase rather than guessing', async () => {
    await Bun.write(join(dir, 'bad.phase'), 'sideways');
    await expect(readPhase(join(dir, 'bad.phase'))).rejects.toThrow(/phase/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx nx run tool-remote-scripts:test`
Expected: FAIL — cannot find `./atomic`.

- [ ] **Step 3: Implement `atomic.ts`**

```typescript
// tools/tool-remote-scripts/src/lib/atomic.ts
import { rename } from 'node:fs/promises';

/**
 * Write-then-rename, because rename is atomic within a filesystem.
 *
 * A partially written Caddyfile is worse than no Caddyfile: a later Caddy
 * restart will load whatever bytes are on disk.
 */
export async function writeAtomic(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await Bun.write(tmp, contents);
  await rename(tmp, path);
}
```

- [ ] **Step 4: Implement `lock.ts`**

```typescript
// tools/tool-remote-scripts/src/lib/lock.ts
import { openSync, closeSync, unlinkSync } from 'node:fs';

/**
 * Exclusive deploy lock via O_EXCL create, which is atomic on POSIX filesystems.
 *
 * Two concurrent deploys interleaving colour swaps is unrecoverable, so this
 * refuses rather than waiting.
 */
export async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  let fd: number;
  try {
    fd = openSync(lockPath, 'wx');
  } catch {
    throw new Error(`deploy lock held: ${lockPath} — another deploy is running`);
  }
  try {
    return await fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(lockPath);
    } catch {
      // Already gone; nothing to release.
    }
  }
}
```

- [ ] **Step 5: Implement `phase.ts`**

```typescript
// tools/tool-remote-scripts/src/lib/phase.ts
import { isPhase, type Phase } from './state';

export async function writePhase(path: string, phase: Phase): Promise<void> {
  await Bun.write(path, `${phase}\n`);
}

export async function readPhase(path: string): Promise<Phase | null> {
  const f = Bun.file(path);
  if (!(await f.exists())) return null;
  const raw = (await f.text()).trim();
  if (!isPhase(raw)) throw new Error(`unrecognised phase marker: ${raw}`);
  return raw;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bunx nx run tool-remote-scripts:test`
Expected: PASS, 8 new tests.

- [ ] **Step 7: Commit**

```bash
git add tools/tool-remote-scripts/src/lib/{lock,atomic,phase}.ts tools/tool-remote-scripts/src/lib/safety.test.ts
git commit -m "feat(remote-scripts): deploy lock, atomic config writes, phase marker"
```

---

### Task 9: The swap executor

Wires Tasks 7 and 8 to real Docker and Caddy. The IO shell around the tested planner.

**Files:**

- Create: `tools/tool-remote-scripts/src/lib/docker.ts`
- Create: `tools/tool-remote-scripts/src/lib/docker.test.ts`
- Rewrite: `tools/tool-remote-scripts/src/swap.ts`
- Delete: `tools/tool-remote-scripts/src/swap-{be,gw,fe}.ts` (the dispatcher takes a tier argument; three near-identical stubs earn nothing)

**Interfaces:**

- Consumes: `planSwap`, `Observed` (Task 7); `withLock`, `writeAtomic`, `writePhase` (Task 8); `waitForHealthy` (existing `lib/health.ts`); `drain` (existing `lib/drain.ts`).
- Produces: `buildDockerArgs(...)` pure helpers, and a CLI `bun swap.js <tier> --digest=<sha256:…> --sha=<git-sha> [--execute]`.

- [ ] **Step 1: Write the failing test for the pure command builders**

```typescript
// tools/tool-remote-scripts/src/lib/docker.test.ts
import { describe, expect, it } from 'bun:test';

import { composeUpArgs, containerName, moveAliasArgs, psColorsFrom } from './docker';

describe('containerName', () => {
  it('names containers <tier>-<color>', () => {
    expect(containerName('be', 'green')).toBe('be-01-green');
    expect(containerName('gw', 'blue')).toBe('gw-01-blue');
    expect(containerName('fe', 'blue')).toBe('fe-01-blue');
  });
});

describe('composeUpArgs', () => {
  it('starts only the target container, by digest', () => {
    const args = composeUpArgs('be', 'green', 'sha256:' + 'c'.repeat(64));
    expect(args).toContain('up');
    expect(args).toContain('-d');
    expect(args).toContain('be-01-green');
    expect(args.join(' ')).toContain('sha256:' + 'c'.repeat(64));
  });
});

describe('psColorsFrom', () => {
  it('extracts running colours from compose ps output', () => {
    const out = 'be-01-blue\nbe-01-green\ngw-01-blue\n';
    expect(psColorsFrom(out, 'be')).toEqual(['blue', 'green']);
  });

  it('returns an empty list when the tier has nothing running', () => {
    expect(psColorsFrom('gw-01-blue\n', 'fe')).toEqual([]);
  });
});

describe('moveAliasArgs', () => {
  it('disconnects the old colour and connects the new one under the alias', () => {
    const [disconnect, connect] = moveAliasArgs('blue', 'green');
    expect(disconnect.join(' ')).toContain('network disconnect');
    expect(disconnect.join(' ')).toContain('be-01-blue');
    expect(connect.join(' ')).toContain('--alias be-01.internal');
    expect(connect.join(' ')).toContain('be-01-green');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx nx run tool-remote-scripts:test`
Expected: FAIL — cannot find `./docker`.

- [ ] **Step 3: Implement `docker.ts`**

```typescript
// tools/tool-remote-scripts/src/lib/docker.ts
import type { Color, Tier } from './state';

const APP: Record<Tier, string> = { be: 'be-01', gw: 'gw-01', fe: 'fe-01' };

export const BE_ALIAS = 'be-01.internal';
export const NETWORK = 'wbs_wbs-net';

export function containerName(tier: Tier, color: Color): string {
  return `${APP[tier]}-${color}`;
}

export function composeUpArgs(tier: Tier, color: Color, digest: string): string[] {
  return [
    'compose',
    '-f',
    '/srv/wbs/base.yml',
    '-f',
    `/srv/wbs/${APP[tier]}-${color}.yml`,
    'up',
    '-d',
    '--pull',
    'always',
    containerName(tier, color),
    // The digest is rendered into the per-colour compose file; passed here so
    // the caller can log exactly what it is about to start.
  ].concat(digest === '' ? [] : []);
}

export function psColorsFrom(psOutput: string, tier: Tier): Color[] {
  const colors: Color[] = [];
  for (const color of ['blue', 'green'] as const) {
    if (psOutput.split('\n').some((l) => l.trim() === containerName(tier, color))) {
      colors.push(color);
    }
  }
  return colors;
}

/**
 * gw-01 resolves BE_URL once at startup, so a be swap moves this alias instead
 * of restarting gw. Docker allows only one container per alias per network.
 */
export function moveAliasArgs(from: Color | null, to: Color): [string[], string[]] {
  const disconnect =
    from === null ? ['true'] : ['network', 'disconnect', NETWORK, containerName('be', from)];
  const connect = ['network', 'connect', '--alias', BE_ALIAS, NETWORK, containerName('be', to)];
  return [disconnect, connect];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx nx run tool-remote-scripts:test`
Expected: PASS, 6 new tests.

- [ ] **Step 5: Rewrite swap.ts as the executor**

```typescript
// tools/tool-remote-scripts/src/swap.ts
import { writeAtomic } from './lib/atomic';
import { composeUpArgs, containerName, moveAliasArgs, psColorsFrom } from './lib/docker';
import { drain } from './lib/drain';
import { waitForHealthy } from './lib/health';
import { withLock } from './lib/lock';
import { writePhase } from './lib/phase';
import { type Observed, planSwap, type SwapPlan } from './lib/reconcile';
import { type Color, renderStateJson, type Tier } from './lib/state';

const ROOT = '/srv/wbs';
const PORT: Record<Tier, number> = { be: 3100, gw: 3200, fe: 80 };

async function sh(args: string[]): Promise<string> {
  const p = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(p.stdout).text();
  if ((await p.exited) !== 0) {
    throw new Error(`docker ${args.join(' ')} failed: ${await new Response(p.stderr).text()}`);
  }
  return out;
}

async function observe(tier: Tier): Promise<Observed> {
  const ps = await sh(['compose', '-f', `${ROOT}/base.yml`, 'ps', '--format', '{{.Name}}']);
  const routed = await Bun.file(`${ROOT}/caddy/10-wbs.caddy`)
    .text()
    .catch(() => '');
  const re = new RegExp(`${containerName(tier, 'green')}|${containerName(tier, 'blue')}`);
  const m = re.exec(routed);
  const routedColor: Color | null = m === null ? null : m[0].endsWith('green') ? 'green' : 'blue';
  const state = await Bun.file(`${ROOT}/state/${tier}.json`)
    .json()
    .catch(() => null);
  return {
    routedColor,
    runningColors: psColorsFrom(ps, tier),
    recordedColor: (state as { activeColor?: Color } | null)?.activeColor ?? null,
    phase: null,
  };
}

async function execute(plan: SwapPlan, digest: string, sha: string): Promise<void> {
  const { tier, from, to } = plan;
  for (const step of plan.steps) {
    console.log(`[swap-${tier}] ${step}`);
    switch (step) {
      case 'start-green':
        await writePhase(`${ROOT}/state/${tier}.phase`, 'preparing');
        await sh(composeUpArgs(tier, to, digest));
        break;
      case 'migrate':
        // Discrete step before green takes traffic: a failed migration aborts
        // the deploy with the old colour untouched.
        await sh(['exec', containerName(tier, to), 'bun', 'run', 'src/migrate-cli.ts']);
        break;
      case 'health-gate': {
        const ok = await waitForHealthy({
          url: `http://${containerName(tier, to)}:${String(PORT[tier])}/health`,
          timeoutMs: 2000,
          attempts: 120,
          intervalMs: 500,
        });
        if (!ok) {
          await sh(['stop', containerName(tier, to)]);
          throw new Error(`${tier}-${to} failed health gate; ${String(from)} left live`);
        }
        break;
      }
      case 'move-alias': {
        const [disconnect, connect] = moveAliasArgs(from, to);
        if (disconnect[0] !== 'true') await sh(disconnect);
        await sh(connect);
        break;
      }
      case 'render-route':
        await writeAtomic(`${ROOT}/caddy/10-wbs.caddy`, await renderSite(tier, to));
        break;
      case 'reload':
        await sh(['exec', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile']);
        await writePhase(`${ROOT}/state/${tier}.phase`, 'routed');
        break;
      case 'drain': {
        // Existing helper: it polls a supplied counter rather than fetching a
        // URL itself, so scraping the Prometheus text format is our job.
        const res = await drain({
          activeConnections: async () => await activeConnections(containerName('gw', from ?? to)),
          maxWaitMs: 300_000,
          pollMs: 10_000,
        });
        if (!res.drained) {
          console.warn(
            `[swap-gw] drain timed out after ${String(res.elapsedMs)}ms; ` +
              'remaining sockets will reconnect and resume via Layer-A',
          );
        }
        break;
      }
      case 'stop-blue':
        if (from !== null) await sh(['stop', containerName(tier, from)]);
        await writePhase(`${ROOT}/state/${tier}.phase`, 'old-stopped');
        break;
      case 'commit':
        await writeAtomic(
          `${ROOT}/state/${tier}.json`,
          renderStateJson({ tier, activeColor: to, lastDeployedSha: sha }),
        );
        await writePhase(`${ROOT}/state/${tier}.phase`, 'committed');
        break;
    }
  }
}

/** Scrape one gauge out of the Prometheus text exposition format. */
async function activeConnections(container: string): Promise<number> {
  const res = await fetch(`http://${container}:3200/metrics`);
  const line = (await res.text()).split('\n').find((l) => l.startsWith('gw_active_connections '));
  if (line === undefined) return 0;
  return Number(line.split(' ')[1] ?? 0);
}

async function renderSite(tier: Tier, to: Color): Promise<string> {
  const tmpl = await Bun.file(`${ROOT}/templates/site.caddy`).text();
  const colors: Record<Tier, Color> = {
    be: (await observe('be')).routedColor ?? 'blue',
    gw: (await observe('gw')).routedColor ?? 'blue',
    fe: (await observe('fe')).routedColor ?? 'blue',
  };
  colors[tier] = to;
  return tmpl
    .replace(/\{\{BE_COLOR\}\}/g, colors.be)
    .replace(/\{\{GW_COLOR\}\}/g, colors.gw)
    .replace(/\{\{FE_COLOR\}\}/g, colors.fe)
    .replace(/\{\{SITE_ADDRESS\}\}/g, process.env['SITE_ADDRESS'] ?? 'wbs.bulletpoints.club');
}

function argOf(flag: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit === undefined ? '' : hit.slice(flag.length + 3);
}

async function main(): Promise<void> {
  const tier = process.argv[2];
  if (tier !== 'be' && tier !== 'gw' && tier !== 'fe') {
    throw new Error('usage: swap <be|gw|fe> --digest=<sha256:…> --sha=<git-sha> [--execute]');
  }
  const observed = await observe(tier);
  const plan = planSwap(tier, observed);
  console.log(`[swap-${tier}] ${String(plan.from)} -> ${plan.to}: ${plan.steps.join(' → ')}`);
  if (!process.argv.includes('--execute')) {
    console.log('[swap] dry-run. re-run with --execute to perform the swap.');
    return;
  }
  await withLock(`${ROOT}/state/deploy.lock`, () => execute(plan, argOf('digest'), argOf('sha')));
}

if (import.meta.main) {
  await main();
}
```

- [ ] **Step 6: Add the migrate CLI that the swap invokes**

```typescript
// apps/be-01/src/migrate-cli.ts
import { runMigrations } from './repository/migrate';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');
runMigrations(dbPath, './drizzle');
console.log('migrations applied');
```

- [ ] **Step 7: Remove the per-tier stubs and update the build target**

```bash
git rm tools/tool-remote-scripts/src/swap-be.ts tools/tool-remote-scripts/src/swap-gw.ts tools/tool-remote-scripts/src/swap-fe.ts
```

In `tools/tool-remote-scripts/project.json`, replace the four `build` commands with the single one:

```json
"commands": [
  "bun build tools/tool-remote-scripts/src/swap.ts --target=bun --outfile dist/tool-remote-scripts/swap.js"
]
```

Also delete the now-dangling assertions in `swap.test.ts` that import `planSwap` from `./swap` — that function now lives in `./lib/reconcile` and is tested there.

- [ ] **Step 8: Run the full suite**

Run: `bunx nx run-many -t test lint typecheck`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add -A tools/tool-remote-scripts apps/be-01/src/migrate-cli.ts
git commit -m "feat(remote-scripts): real blue/green swap executor"
```

---

### Task 10: Orchestrator — tool-deploy

**Files:**

- Rewrite: `tools/tool-deploy/src/{deploy,remote-state}.ts`
- Create: `tools/tool-deploy/src/migrations.ts`, `migrations.test.ts`
- Delete: `tools/tool-deploy/src/deploy-{be,gw,fe}.ts`

**Interfaces:**

- Consumes: `parseDeployArgs`, `materialize` from `./affected` (unchanged); `release.json` from Task 4.
- Produces: `hasNewMigrations(deployedSha, headSha, listFiles): boolean` and a CLI `nx run tool-deploy:deploy -- [tiers] [--execute] [--with-migrations] [--stop-the-world]`.

- [ ] **Step 1: Write the failing test for the migration gate**

```typescript
// tools/tool-deploy/src/migrations.test.ts
import { describe, expect, it } from 'bun:test';

import { assertMigrationFlag, hasNewMigrations } from './migrations';

describe('hasNewMigrations', () => {
  it('is true when the head tree has a migration the deployed sha lacks', () => {
    expect(hasNewMigrations(['0001_init'], ['0001_init', '0002_add_col'])).toBe(true);
  });

  it('is false when the migration sets match', () => {
    expect(hasNewMigrations(['0001_init'], ['0001_init'])).toBe(false);
  });

  it('is false on a first-ever deploy with no baseline', () => {
    expect(hasNewMigrations(null, ['0001_init'])).toBe(false);
  });
});

describe('assertMigrationFlag', () => {
  it('passes when there are no new migrations', () => {
    expect(() => {
      assertMigrationFlag(false, false, false);
    }).not.toThrow();
  });

  it('throws when migrations exist and neither flag is given', () => {
    expect(() => {
      assertMigrationFlag(true, false, false);
    }).toThrow(/--with-migrations/);
  });

  it('passes when --with-migrations is given', () => {
    expect(() => {
      assertMigrationFlag(true, true, false);
    }).not.toThrow();
  });

  it('passes when --stop-the-world is given', () => {
    expect(() => {
      assertMigrationFlag(true, false, true);
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx nx run tool-deploy:test`
Expected: FAIL — cannot find `./migrations`.

- [ ] **Step 3: Implement `migrations.ts`**

```typescript
// tools/tool-deploy/src/migrations.ts
/**
 * Blue and green share one SQLite file, so a destructive migration breaks the
 * still-live old colour. This gate turns that from a 3am surprise into a
 * deploy-time prompt.
 */
export function hasNewMigrations(deployed: string[] | null, head: string[]): boolean {
  if (deployed === null) return false;
  const known = new Set(deployed);
  return head.some((m) => !known.has(m));
}

export function assertMigrationFlag(
  newMigrations: boolean,
  withMigrations: boolean,
  stopTheWorld: boolean,
): void {
  if (!newMigrations) return;
  if (withMigrations || stopTheWorld) return;
  throw new Error(
    'this deploy contains new migrations.\n' +
      '  Blue and green share one database, so the migration must be backward-compatible\n' +
      '  with the release still serving traffic (add columns, never drop).\n' +
      '  Pass --with-migrations once you have confirmed that, or --stop-the-world for a\n' +
      '  plain restart with a brief outage.',
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx nx run tool-deploy:test`
Expected: PASS, 7 tests.

- [ ] **Step 5: Replace `mockRemoteState` with a real SSH read**

```typescript
// tools/tool-deploy/src/remote-state.ts
import type { Tier } from './affected';

export interface RemoteTierState {
  tier: Tier;
  activeColor: 'blue' | 'green';
  lastDeployedSha: string | null;
}

/** One round trip for all three tiers; missing files come back as null. */
export async function readRemoteState(
  host: string,
): Promise<Partial<Record<Tier, RemoteTierState>>> {
  const cmd = 'for t in be gw fe; do echo "== $t"; cat /srv/wbs/state/$t.json 2>/dev/null; done';
  const p = Bun.spawn(['ssh', host, cmd], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(p.stdout).text();
  if ((await p.exited) !== 0) throw new Error(`cannot read remote state from ${host}`);

  const result: Partial<Record<Tier, RemoteTierState>> = {};
  for (const block of out.split('== ').slice(1)) {
    const nl = block.indexOf('\n');
    const tier = block.slice(0, nl).trim() as Tier;
    const body = block.slice(nl + 1).trim();
    if (body === '') continue;
    result[tier] = JSON.parse(body) as RemoteTierState;
  }
  return result;
}
```

- [ ] **Step 6: Delete the redundant per-tier deploy files**

```bash
git rm tools/tool-deploy/src/deploy-be.ts tools/tool-deploy/src/deploy-gw.ts tools/tool-deploy/src/deploy-fe.ts
```

Update `tools/tool-deploy/src/deploy.test.ts` to drop any import of those files and of `mockRemoteState`.

- [ ] **Step 7: Run the full suite**

Run: `bunx nx run-many -t test lint typecheck`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add -A tools/tool-deploy
git commit -m "feat(tool-deploy): real remote state and a migration safety gate"
```

---

### Task 11: Smoke inside the network

Decision 9. The current smoke checks public `/health` and `/metrics`, which Caddy deliberately does not expose — so it can only ever fail. It moves onto `wbs-net`.

**Files:**

- Modify: `tools/tool-smoke/src/health.ts`, `tools/tool-smoke/src/ws-ping.ts`
- Modify: `tools/tool-smoke/project.json`

**Interfaces:**

- Consumes: container DNS names from Task 6.
- Produces: `nx run tool-smoke:smoke` exiting non-zero on any failure.

- [ ] **Step 1: Write the failing test for the WS check**

```typescript
// append to tools/tool-smoke/src/ws-ping.test.ts
import { describe, expect, it } from 'bun:test';

import { runPingSmoke } from './ws-ping';

describe('runPingSmoke', () => {
  it('reports ok when the socket echoes a pong', async () => {
    const fake = {
      send: () => undefined,
      close: () => undefined,
      addEventListener: (ev: string, cb: (e: { data: string }) => void) => {
        if (ev === 'message')
          setTimeout(() => {
            cb({ data: '{"type":"pong"}' });
          }, 0);
        if (ev === 'open')
          setTimeout(() => {
            cb({ data: '' });
          }, 0);
      },
    };
    const res = await runPingSmoke({ connect: () => fake, timeoutMs: 100 });
    expect(res.ok).toBe(true);
  });

  it('reports failure when nothing answers before the timeout', async () => {
    const silent = {
      send: () => undefined,
      close: () => undefined,
      addEventListener: (ev: string, cb: (e: { data: string }) => void) => {
        if (ev === 'open')
          setTimeout(() => {
            cb({ data: '' });
          }, 0);
      },
    };
    const res = await runPingSmoke({ connect: () => silent, timeoutMs: 50 });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx nx run tool-smoke:test`
Expected: FAIL — `runPingSmoke` does not accept a `connect` injection.

- [ ] **Step 3: Implement the injectable WS check**

```typescript
// tools/tool-smoke/src/ws-ping.ts
export interface SocketLike {
  send: (data: string) => void;
  close: () => void;
  addEventListener: (ev: string, cb: (e: { data: string }) => void) => void;
}

export interface PingOptions {
  connect: () => SocketLike;
  timeoutMs: number;
}

export interface PingResult {
  ok: boolean;
  detail: string;
}

export async function runPingSmoke(opts: PingOptions): Promise<PingResult> {
  const sock = opts.connect();
  return await new Promise<PingResult>((resolve) => {
    const timer = setTimeout(() => {
      sock.close();
      resolve({ ok: false, detail: `no pong within ${String(opts.timeoutMs)}ms` });
    }, opts.timeoutMs);

    sock.addEventListener('open', () => {
      sock.send(JSON.stringify({ type: 'ping' }));
    });
    sock.addEventListener('message', (e) => {
      clearTimeout(timer);
      sock.close();
      resolve({ ok: e.data.includes('pong'), detail: e.data });
    });
  });
}

async function main(): Promise<void> {
  const url = process.env['SMOKE_WS_URL'] ?? 'ws://gw-01-blue:3200/ws';
  const res = await runPingSmoke({
    connect: () => new WebSocket(url) as unknown as SocketLike,
    timeoutMs: 5000,
  });
  console.log(`[smoke/ws] ${res.ok ? 'ok' : 'FAIL'} — ${res.detail}`);
  if (!res.ok) process.exit(1);
}

if (import.meta.main) {
  await main();
}
```

- [ ] **Step 4: Point the health check at container DNS**

In `tools/tool-smoke/src/health.ts`, replace the public URLs with names resolvable on `wbs-net`, defaulting to `http://be-01-blue:3100/health` and `http://gw-01-blue:3200/health`, overridable via `SMOKE_BE_URL` / `SMOKE_GW_URL`.

- [ ] **Step 5: Add the smoke target that runs on the network**

Add to `tools/tool-smoke/project.json` under `targets`:

```json
"smoke": {
  "executor": "nx:run-commands",
  "options": {
    "command": "docker run --rm --network wbs_wbs-net -v $PWD:/app -w /app oven/bun:1.2.20-alpine bun run tools/tool-smoke/src/health.ts"
  },
  "cache": false
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bunx nx run tool-smoke:test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/tool-smoke/
git commit -m "feat(tool-smoke): run inside wbs-net and make the WS check real"
```

---

### Task 12: Staging rehearsal, then cutover

The live systemd deployment stays up through every step until 4.

**Files:**

- Create: `deploy/compose/staging.env`
- Delete (final step): `deploy/deploy.sh`, `deploy/systemd/`, `deploy/caddy/`

**Interfaces:**

- Consumes: everything above.
- Produces: a running Compose production stack; the systemd path gone.

- [ ] **Step 1: Rehearse the whole thing under a staging project name**

```bash
ssh h2puni 'docker compose -p wbs-staging -f /srv/wbs/base.yml up -d'
bunx nx run tool-dagger:publish-all
ssh h2puni 'cd /srv/wbs && bun bin/swap.js be --digest=<digest> --sha=<sha> --execute'
```

Expected: the swap completes and the health gate passes. Nothing here touches the live systemd services.

- [ ] **Step 2: Rehearse a second swap and confirm zero downtime**

While a swap runs, hold a request loop open:

```bash
ssh h2puni 'while true; do curl -fsS -o /dev/null -w "%{http_code} " http://localhost:8080/api/health; sleep 0.2; done'
```

Expected: an unbroken run of `200`. **Any non-200 means the swap is not zero-downtime — stop and diagnose before cutover.**

- [ ] **Step 3: Point DNS at the host**

Create A records for `wbs.bulletpoints.club` and `registry.infra.bulletpoints.club` at `62.238.48.248`. Confirm:

```bash
dig +short wbs.bulletpoints.club
curl -fsS https://wbs.bulletpoints.club/api/health
```

Expected: the IP, then a healthy response over TLS with a valid certificate.

- [ ] **Step 4: Cut over**

```bash
ssh h2puni 'systemctl --user stop wbs-be-01 wbs-gw-01 && systemctl --user disable wbs-be-01 wbs-gw-01'
ssh h2puni 'sudo systemctl disable --now caddy'
ssh h2puni 'docker compose -f /srv/wbs/base.yml up -d'
bunx nx run tool-smoke:smoke
```

Expected: smoke passes against the Compose stack.

- [ ] **Step 5: Delete the systemd path**

```bash
git rm -r deploy/deploy.sh deploy/systemd deploy/caddy
ssh h2puni 'rm -f ~/.config/systemd/user/wbs-*.service && systemctl --user daemon-reload'
ssh h2puni 'sudo rm -f /etc/sudoers.d/wbs-caddy-reload'
```

- [ ] **Step 6: Update the spec status**

Change the header of `docs/superpowers/specs/2026-08-02-compose-blue-green-deploy-design.md` from `Status: approved, not yet implemented. Revision 2, after cross-review.` to `Status: implemented <date>. Revision 2.`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(deploy): cut over to compose blue/green, remove systemd path"
```

---

## Self-Review

**Spec coverage.** Every decision maps to a task: D1 → 5, 6; D2 → 1, 4; D3 → 4, 5; D4 → 4; D5 → 3; D6 → 7, 8; D7 → 6, 9; D8 → 2, 10; D9 → 11, 12; D10 → 8, 9; D11 → 6. Phase 2 is explicitly out of scope.

**Type consistency.** Checked: `Tier` and `Color` come from `./lib/state` everywhere; `planSwap` lives only in `./lib/reconcile` after Task 9 removes the old one from `swap.ts`; `drain`'s call site matches the real signature in `lib/drain.ts` (`activeConnections`/`maxWaitMs`/`pollMs`, verified by reading the file, not assumed).

**Known gaps, deliberately left:**

- **Per-colour compose files** (`/srv/wbs/be-01-green.yml`) are referenced by `composeUpArgs` but no task writes the generator. Task 6's `tier.compose.tmpl` is the template; rendering it per colour with the resolved digest belongs in Task 9 and should be added there during implementation.
- **Rollback is specified but not tested.** The spec's three rollback windows (decision 7) have no task. The forward path is what Task 12 step 2 proves; rollback deserves its own task once that works.
- **`composeUpArgs` has a vestigial `digest` parameter** that the current body ignores, because the digest is rendered into the per-colour compose file instead. Either thread it through the renderer or drop the parameter when implementing Task 9 — do not leave it as dead weight.
