// The blue/green swap executor. `lib/docker.ts` and `lib/site.ts` hold the
// pure command builders, parsers, and template contexts; everything here is
// the thin IO shell that actually runs `docker`, touches the filesystem, and
// drives the ordered `SwapStep`s a `SwapPlan` (lib/reconcile.ts) produces.
//
// `--dry-run` is the default. `--execute` opts in to anything destructive.
//
// How the Caddy/Compose templates reach the server: they are NOT read from a
// path on disk at runtime. `@wbs/tool-compose` imports both `.tmpl` files as
// raw text with `with { type: 'text' }`, which Bun's bundler inlines at
// build time into the single `swap.js` produced by this project's `build`
// target — the same file `install.ts` already documents rsync-ing to
// `/srv/wbs/bin/`. So shipping one file ships the templates too; nothing
// separate needs to exist on the server. Verified: `bun build --target=bun`
// on a throwaway file with the same import pattern inlines the text and the
// resulting bundle still runs correctly when moved and executed from an
// unrelated directory.
import { renderTemplate, siteCaddyTmpl, tierComposeTmpl } from '@wbs/tool-compose';

import { writeAtomic } from './lib/atomic';
import {
  composeUpArgs,
  containerName,
  grantAliasCommands,
  isDigest,
  NETWORK,
  PORT,
  psColorsFrom,
  revokeAliasCommands,
  ROOT,
  tierComposeContext,
  tierComposeFile,
} from './lib/docker';
import { drain } from './lib/drain';
import { waitForHealthy } from './lib/health';
import { withLock } from './lib/lock';
import { readPhase, writePhase } from './lib/phase';
import { type Observed, planSwap, type SwapPlan } from './lib/reconcile';
import { routedColorFor, siteContext } from './lib/site';
import { type Color, parseStateJson, renderStateJson, type Tier } from './lib/state';

const REGISTRY = process.env['REGISTRY'] ?? 'registry.infra.bulletpoints.club';
const SITE_ADDRESS = process.env['SITE_ADDRESS'] ?? 'wbs.bulletpoints.club';
const SITE_CADDY_PATH = `${ROOT}/caddy/site.caddy`;

// fe-01 is a static Caddy server with no /health route; design decision 5's
// health gate for it is "fetch / and assert 200 + a non-empty body" instead.
const HEALTH_PATH: Record<Tier, string> = { be: '/health', gw: '/health', fe: '/' };

async function sh(args: string[]): Promise<string> {
  const p = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(p.stdout).text();
  const code = await p.exited;
  if (code !== 0) {
    throw new Error(`docker ${args.join(' ')} failed: ${await new Response(p.stderr).text()}`);
  }
  return out;
}

/**
 * No app-tier ports are published to the host (design decision 1) — only
 * containers on `wbs-net` can resolve each other by container-DNS name.
 * This process runs on the bare host (`/srv/wbs/bin/swap.js`, not inside a
 * container), so it cannot reach `http://be-01-green:3100/...` by name. It
 * instead reaches the container directly by its bridge-network IP: Docker
 * routes host -> bridge-network-container traffic regardless of published
 * ports, only host -> *outside* traffic needs a publish. Verified live on
 * h2puni: `curl` to a container's bridge IP returned 200, and `ip route`
 * shows a direct kernel route to the bridge subnet — this works on the real
 * target, not just in theory.
 */
async function containerIp(name: string): Promise<string> {
  const out = await sh([
    'inspect',
    '-f',
    `{{(index .NetworkSettings.Networks "${NETWORK}").IPAddress}}`,
    name,
  ]);
  const ip = out.trim();
  if (ip === '') throw new Error(`${name} has no address on ${NETWORK}`);
  return ip;
}

/** One gauge, read off gw-01's own in-memory counters (see below). */
async function activeConnections(container: string): Promise<number> {
  const ip = await containerIp(container);
  const res = await fetch(`http://${ip}:${String(PORT.gw)}/metrics/snapshot`);
  const body = (await res.json()) as { activeConnections?: unknown };
  return typeof body.activeConnections === 'number' ? body.activeConnections : 0;
}

async function readSiteCaddy(): Promise<string> {
  return Bun.file(SITE_CADDY_PATH)
    .text()
    .catch(() => '');
}

/**
 * `caddy reload` exits 0 whenever the config it's told to load (its own
 * `Caddyfile`, per the fixed `--config` flag above) is syntactically valid —
 * NOT whenever routing actually changed. If `Caddyfile` doesn't `import
 * site.caddy` at all (verified live: this was exactly what happened before
 * a real Caddyfile was provisioned — reload kept "succeeding" while Caddy
 * silently kept serving deploy/compose/Caddyfile.bootstrap's placeholder
 * forever), the swap reports success and nothing is actually routed. Rather
 * than trust the exit code, read Caddy's own admin API back — the live,
 * currently-active config, not the file on disk — and assert it actually
 * mentions the container this reload was supposed to route to. `wget` (not
 * `curl`) because `caddy:2-alpine`'s base image ships BusyBox wget, not
 * curl; verified live. `127.0.0.1`, not `localhost`: the container's
 * `/etc/hosts` maps `localhost` to both `127.0.0.1` and `::1`, Caddy's
 * admin API only binds the IPv4 address, and BusyBox wget's `localhost`
 * lookup tries `::1` first and reports connection-refused without falling
 * back — verified live (identical command, `localhost` fails, `127.0.0.1`
 * succeeds against the same running admin API).
 */
async function currentCaddyConfig(): Promise<string> {
  return sh([
    'compose',
    '-f',
    `${ROOT}/base.yml`,
    'exec',
    'caddy',
    'wget',
    '-qO-',
    'http://127.0.0.1:2019/config/',
  ]);
}

async function readRecordedColor(tier: Tier): Promise<Color | null> {
  const raw = await Bun.file(`${ROOT}/state/${tier}.json`)
    .text()
    .catch(() => null);
  if (raw === null) return null;
  try {
    return parseStateJson(raw).activeColor;
  } catch (e) {
    console.warn(
      `[swap-${tier}] ignoring unreadable state file: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

async function observe(tier: Tier): Promise<Observed> {
  const psOutput = await sh(['ps', '--format', '{{.Names}}']);
  const siteText = await readSiteCaddy();
  return {
    routedColor: routedColorFor(tier, siteText),
    runningColors: psColorsFrom(psOutput, tier),
    recordedColor: await readRecordedColor(tier),
    phase: await readPhase(`${ROOT}/state/${tier}.phase`),
  };
}

async function execute(plan: SwapPlan, digest: string, sha: string): Promise<void> {
  const { tier, from, to } = plan;
  const phasePath = `${ROOT}/state/${tier}.phase`;

  for (const step of plan.steps) {
    console.log(`[swap-${tier}] ${step}`);
    switch (step) {
      case 'start-green': {
        await writePhase(phasePath, 'preparing');
        const ctx = tierComposeContext(tier, to, REGISTRY, digest);
        await writeAtomic(tierComposeFile(tier, to), renderTemplate(tierComposeTmpl, ctx));
        await sh(composeUpArgs(tier, to));
        break;
      }

      case 'migrate':
        // Discrete step before green takes traffic: a failed migration
        // aborts the deploy with the old colour untouched.
        await sh(['exec', containerName(tier, to), 'bun', 'run', 'src/migrate-cli.ts']);
        break;

      case 'health-gate': {
        const ip = await containerIp(containerName(tier, to));
        const ok = await waitForHealthy({
          url: `http://${ip}:${String(PORT[tier])}${HEALTH_PATH[tier]}`,
          timeoutMs: 2000,
          attempts: 120,
          intervalMs: 500,
          // fe-01 is a static file server: a truncated/empty index.html
          // still returns 200, which no status-only check would catch
          // (design decision 5). be-01/gw-01 keep the plain res.ok gate.
          isHealthy: tier === 'fe' ? (body) => body.length > 0 : undefined,
        });
        if (!ok) {
          await sh(['stop', containerName(tier, to)]);
          throw new Error(`${tier}-${to} failed health gate; ${from ?? 'nothing'} left live`);
        }
        break;
      }

      case 'grant-alias':
        // Incoming colour only — see lib/docker.ts's grantAliasCommands doc
        // comment for why this must run before render-route/reload (nothing
        // routes to this colour yet, so briefly disconnecting/reconnecting
        // it here is safe) and why the outgoing colour's cleanup is a
        // separate step deferred until after reload ('revoke-alias', below).
        for (const cmd of grantAliasCommands(to)) await sh(cmd);
        break;

      case 'render-route': {
        const siteText = await readSiteCaddy();
        // `routedColorFor` returning null for a tier means "genuinely never
        // deployed" — passed straight through as null, NOT defaulted to
        // 'blue'. Defaulting was the bug: it wrote a guessed colour into
        // site.caddy as if it were real routing state, which the next
        // tier's own first deploy then read back as ground truth (routing
        // "wins over the state file, always") and planned a bogus swap
        // from. `siteContext`/`routeBlock` (lib/site.ts) render an honest
        // "not yet deployed" response for null instead, which also means
        // `routedColorFor` still correctly returns null next time.
        const colors: Record<Tier, Color | null> = {
          be: routedColorFor('be', siteText),
          gw: routedColorFor('gw', siteText),
          fe: routedColorFor('fe', siteText),
        };
        colors[tier] = to;
        const rendered = renderTemplate(siteCaddyTmpl, siteContext(colors, SITE_ADDRESS));
        await writeAtomic(SITE_CADDY_PATH, rendered);
        break;
      }

      case 'reload':
        // Written BEFORE the reload, like 'preparing' before start-green's
        // compose up: a process killed mid-reload must be classifiable as
        // "was attempting to route" rather than looking identical to having
        // never started. Recovery still re-derives the true live colour
        // from the rendered site.caddy (the source of truth), never from
        // this marker — it only names which window a kill happened in.
        await writePhase(phasePath, 'routed');
        // Targets caddy by Compose *service* name rather than a hardcoded
        // container name: base.yml sets no `container_name` for it, so the
        // real container is `wbs-caddy-1` (verified live on h2puni), which
        // `compose exec` resolves without needing to know that.
        await sh([
          'compose',
          '-f',
          `${ROOT}/base.yml`,
          'exec',
          'caddy',
          'caddy',
          'reload',
          '--config',
          '/etc/caddy/Caddyfile',
        ]);
        // Trust, but verify: reload exiting 0 only means the config was
        // syntactically valid, not that it's the config we think it is (see
        // currentCaddyConfig's doc comment — this is precisely how the
        // "reload silently no-ops" failure mode stayed invisible before).
        {
          const expected = containerName(tier, to);
          const liveConfig = await currentCaddyConfig();
          if (!liveConfig.includes(expected)) {
            throw new Error(
              `[swap-${tier}] caddy reload exited 0 but the live admin config ` +
                `(http://127.0.0.1:2019/config/ inside the caddy container) does not ` +
                `mention ${expected} — routing did not actually change. Check that ` +
                `/srv/wbs/caddy/Caddyfile really imports site.caddy.`,
            );
          }
        }
        break;

      case 'drain': {
        // Existing helper: it polls a supplied counter rather than fetching
        // a URL itself, so getting the count is our job. gw-01's own
        // in-memory counters, exposed as JSON at /metrics/snapshot, are used
        // rather than the Prometheus-format /metrics endpoint — gw-01's
        // GatewayMetrics never registers an OTel instrument for
        // activeConnections, so that gauge does not exist in the Prometheus
        // output today (verified by reading gateway-metrics.ts and
        // otel-plugin.ts).
        const target = containerName('gw', from ?? to);
        const res = await drain({
          activeConnections: () => activeConnections(target),
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

      case 'revoke-alias':
        // Outgoing colour only, and only reachable here once `from !== null`
        // (planSwap never includes this step otherwise) — deferred until
        // after reload/drain so Caddy has already switched its own-alias
        // route away from `from` before this disconnects it. See
        // lib/docker.ts's revokeAliasCommands doc comment.
        if (from !== null) {
          for (const cmd of revokeAliasCommands(from)) await sh(cmd);
        }
        break;

      case 'stop-blue':
        await writePhase(phasePath, 'old-stopped');
        if (from !== null) await sh(['stop', containerName(tier, from)]);
        break;

      case 'commit':
        await writePhase(phasePath, 'committed');
        await writeAtomic(
          `${ROOT}/state/${tier}.json`,
          renderStateJson({ tier, activeColor: to, lastDeployedSha: sha }),
        );
        break;
    }
  }
}

function argOf(flag: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit === undefined ? '' : hit.slice(flag.length + 3);
}

function describePlan(tier: Tier, plan: SwapPlan): string {
  return `[swap-${tier}] ${String(plan.from)} -> ${plan.to}: ${plan.steps.join(' -> ')}`;
}

async function main(): Promise<void> {
  const tier = process.argv[2];
  if (tier !== 'be' && tier !== 'gw' && tier !== 'fe') {
    throw new Error('usage: swap <be|gw|fe> --digest=<sha256:…> --sha=<git-sha> [--execute]');
  }

  if (!process.argv.includes('--execute')) {
    // Advisory only — nothing acts on this plan, so it's fine for it to be
    // observed outside the lock and to go stale by the time a real
    // --execute runs.
    const plan = planSwap(tier, await observe(tier));
    console.log(describePlan(tier, plan));
    console.log('[swap] dry-run (default). re-run with --execute to perform the swap.');
    return;
  }

  const digest = argOf('digest');
  const sha = argOf('sha');
  // Abort before anything starts rather than mid-swap (design decision 10).
  if (!isDigest(digest)) {
    throw new Error(`--digest=<sha256:...> is required to execute, got: ${digest || '(missing)'}`);
  }
  if (sha === '') throw new Error('--sha=<git-sha> is required to execute');

  await withLock(`${ROOT}/state/deploy.lock`, async () => {
    // Observed and planned AFTER winning the lock, not before: withLock
    // refuses rather than waits, so a truly concurrent second deploy is
    // rejected outright, but a merely *sequential* one is not — a process
    // that observed state, then sat idle while a full swap ran and
    // released the lock, would otherwise execute a plan derived from state
    // that's no longer current, and its stale `commit` step would silently
    // overwrite the sha the other process actually deployed. Deriving the
    // plan from state read after exclusion is won closes that window.
    const plan = planSwap(tier, await observe(tier));
    console.log(describePlan(tier, plan));
    await execute(plan, digest, sha);
  });
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error('[swap] failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
