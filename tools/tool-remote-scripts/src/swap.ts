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
  assertDigestPinnedRef,
  composeUpArgs,
  containerName,
  grantAliasCommands,
  manifestInspectArgs,
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

// No REGISTRY here, deliberately. The publish address arrives as part of
// `--image`, which is `release.json`'s `image` field passed through verbatim
// by tool-deploy — see lib/docker.ts's assertDigestPinnedRef for why a second
// default on this side was a live defect rather than a redundancy.
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
 * Registry preflight — design decision 10's "SSH, registry, or registry auth
 * unavailable at start: abort before anything starts. Nothing changed."
 *
 * Runs before the lock is even taken, and `tool-deploy` runs it for *every*
 * tier before executing any of them, so a bad registry cannot leave a
 * half-deployed stack behind. Previously the first symptom of an unreachable
 * or unauthenticated registry was `docker compose up --pull always` failing
 * inside `start-green` — mid-swap, with a partially-created container to
 * clean up.
 */
async function preflightRegistry(image: string): Promise<void> {
  try {
    await sh(manifestInspectArgs(image));
  } catch (e: unknown) {
    throw new Error(
      `registry preflight failed for ${image} — aborting before anything starts.\n` +
        '  This host must be able to reach the registry and authenticate to it\n' +
        '  (docker login <registry>; see tools/tool-bootstrap/src/configure.sh).\n' +
        `  Underlying error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
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

/**
 * Which colour Caddy is ACTUALLY serving for each tier, right now.
 *
 * This replaces reading the rendered `site.caddy` off disk, and the
 * distinction is not academic. `render-route` writes that file *before*
 * `reload` runs — it has to, since reload's whole job is to load it — so any
 * failure or kill in between leaves the file naming green while Caddy is
 * still serving blue. `observe()` used to read that file, `resolveLiveColor`
 * trusts routing unconditionally, and so the next deploy would plan
 * `green -> blue` and, as its very FIRST step, recreate the container serving
 * production, with a new digest and no health gate in front of it. The
 * inverted window was the exact scenario decision 6 introduced "the rendered
 * Caddy config is the source of truth" to prevent, and reading the file
 * quietly reintroduced it: the file is the *input* to routing, not routing.
 *
 * Caddy's admin API reports the config it has loaded, which cannot be ahead of
 * reality the way the file can. That is the version of decision 6 that is
 * actually true, so it is what `observe()` and `render-route` both read.
 *
 * Chosen over the alternative fix — roll `site.caddy` back to its previous
 * contents when the reload fails — because rollback only covers the failures
 * this process survives to handle. A SIGKILL, an OOM kill, or the box losing
 * power between the write and the reload all leave the file inverted with no
 * `catch` block ever running, and those are the same signals that motivated
 * the `flock` rewrite in lib/lock.ts. Reading live routing has no such window:
 * there is no moment at which the answer is derived from something that has
 * not happened yet. (`abortSwap` restores the file anyway, so an operator
 * reading it is not misled either — but correctness does not depend on that
 * having run.)
 *
 * If Caddy is down this throws rather than falling back to the file. That is
 * deliberate: the fallback would be exactly the stale, possibly-inverted
 * source this exists to stop trusting, and it would be consulted precisely
 * when things are already wrong. A swap cannot complete without Caddy anyway —
 * `reload` targets it — so refusing to plan one costs nothing real and keeps
 * decision 10's "abort before anything starts" honest.
 */
async function liveRoutedColors(): Promise<Record<Tier, Color | null>> {
  let config: string;
  try {
    config = await currentCaddyConfig();
  } catch (e: unknown) {
    throw new Error(
      "cannot read Caddy's live admin config, so the colour actually being served is " +
        'unknown — refusing to plan a swap from the possibly-stale site.caddy file ' +
        '(design decision 6). Is the caddy container up?\n' +
        `  Underlying error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return {
    be: routedColorFor('be', config),
    gw: routedColorFor('gw', config),
    fe: routedColorFor('fe', config),
  };
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
  const routed = await liveRoutedColors();
  return {
    routedColor: routed[tier],
    runningColors: psColorsFrom(psOutput, tier),
    recordedColor: await readRecordedColor(tier),
    phase: await readPhase(`${ROOT}/state/${tier}.phase`),
  };
}

async function reloadCaddy(): Promise<void> {
  // Targets caddy by Compose *service* name rather than a hardcoded
  // container name: base.yml sets no `container_name` for it, so the real
  // container is `wbs-caddy-1` (verified live on h2puni), which
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
}

async function execute(plan: SwapPlan, image: string, sha: string): Promise<void> {
  const { tier, from, to } = plan;
  const phasePath = `${ROOT}/state/${tier}.phase`;
  const greenName = containerName(tier, to);

  // Undo state for the abort paths below. Both start "nothing to undo" and
  // are set at the exact point the corresponding action becomes undoable.
  let aliasMovedToGreen = false;
  let siteTextBefore: string | null = null;

  /**
   * Design decision 10's abort rows, which were previously undelivered:
   *
   * | Migration step fails | Stop green, abort. Blue untouched and un-migrated. |
   * | `caddy reload` fails | Green is up but unrouted. Stop green, leave blue live, exit non-zero. |
   *
   * Both steps used to simply throw, leaving green running. For `be` that was
   * actively harmful rather than merely untidy: by reload time green already
   * holds `be-01.internal` (granted earlier in the plan), so an abort that
   * left green up left gw forwarding real traffic to a colour Caddy does not
   * route to — and an abort that stopped green without moving the alias back
   * would leave gw forwarding to a stopped container. The alias has to be
   * handed back to the outgoing colour before green stops, which is why this
   * is a helper rather than three lines at each throw site.
   *
   * Every undo is best-effort and logged: the original failure is what the
   * operator needs to see, so a failing cleanup must not replace it.
   */
  async function abortSwap(reason: string, cause: unknown): Promise<never> {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error(`[swap-${tier}] aborting: ${reason}: ${detail}`);

    // 1. Routing first, while green is still up: put site.caddy back to what
    //    it said before this swap touched it and re-apply it, so the file and
    //    live Caddy agree again. (Correctness does not depend on this — see
    //    liveRoutedColors — but leaving an inverted file for an operator to
    //    read would be gratuitous.)
    if (siteTextBefore !== null) {
      try {
        await writeAtomic(SITE_CADDY_PATH, siteTextBefore);
        await reloadCaddy();
        console.error(`[swap-${tier}] restored the previous site.caddy and reloaded`);
      } catch (e: unknown) {
        console.error(
          `[swap-${tier}] could not restore routing: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // 2. Hand be-01.internal back before stopping the container that holds
    //    it, or gw forwards into a stopped colour. With no outgoing colour
    //    (a first deploy) there is nothing to hand it to, so just strip it.
    if (tier === 'be' && aliasMovedToGreen) {
      const cmds = from === null ? revokeAliasCommands(to) : grantAliasCommands(from);
      try {
        for (const cmd of cmds) await sh(cmd);
        console.error(
          `[swap-${tier}] be-01.internal returned to ${from ?? 'no colour (first deploy)'}`,
        );
      } catch (e: unknown) {
        console.error(
          `[swap-${tier}] could not return be-01.internal: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // 3. Green last: it is the thing every step above was protecting traffic
    //    from losing.
    try {
      await sh(['stop', greenName]);
    } catch (e: unknown) {
      console.error(
        `[swap-${tier}] could not stop ${greenName}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    throw new Error(`${reason}: ${detail}; ${from ?? 'nothing'} left live`);
  }

  for (const step of plan.steps) {
    console.log(`[swap-${tier}] ${step}`);
    switch (step) {
      case 'start-green': {
        await writePhase(phasePath, 'preparing');
        const ctx = tierComposeContext(tier, to, image);
        await writeAtomic(tierComposeFile(tier, to), renderTemplate(tierComposeTmpl, ctx));
        await sh(composeUpArgs(tier, to));
        break;
      }

      case 'migrate':
        // Discrete step before green takes traffic: a failed migration
        // aborts the deploy with the old colour untouched and un-migrated
        // (decision 10). Green is stopped rather than left running, because a
        // container that failed to migrate must not be one health-gate away
        // from taking traffic on a later run.
        try {
          await sh(['exec', greenName, 'bun', 'run', 'src/migrate-cli.ts']);
        } catch (e: unknown) {
          await abortSwap(`${tier}-${to} failed its migration step`, e);
        }
        break;

      case 'health-gate': {
        const ip = await containerIp(greenName);
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
          await abortSwap(
            `${tier}-${to} failed its health gate`,
            new Error(`no healthy response from ${HEALTH_PATH[tier]} within the gate's ceiling`),
          );
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
        aliasMovedToGreen = true;
        break;

      case 'render-route': {
        // Live Caddy, not the file on disk — same reason observe() reads it
        // (see liveRoutedColors). Rendering the other tiers' routes from a
        // possibly-inverted file would propagate the lie into the config this
        // swap is about to load.
        //
        // `routedColorFor` returning null for a tier means "genuinely never
        // deployed" — passed straight through as null, NOT defaulted to
        // 'blue'. Defaulting was the bug: it wrote a guessed colour into
        // site.caddy as if it were real routing state, which the next
        // tier's own first deploy then read back as ground truth (routing
        // "wins over the state file, always") and planned a bogus swap
        // from. `siteContext`/`routeBlock` (lib/site.ts) render an honest
        // "not yet deployed" response for null instead, which also means
        // `routedColorFor` still correctly returns null next time.
        const colors = await liveRoutedColors();
        colors[tier] = to;
        const rendered = renderTemplate(siteCaddyTmpl, siteContext(colors, SITE_ADDRESS));
        // Captured before the write, so abortSwap can put the file back
        // exactly as it found it.
        siteTextBefore = await readSiteCaddy();
        await writeAtomic(SITE_CADDY_PATH, rendered);
        break;
      }

      case 'reload':
        // Written BEFORE the reload, like 'preparing' before start-green's
        // compose up: a process killed mid-reload must be classifiable as
        // "was attempting to route" rather than looking identical to having
        // never started. Recovery still re-derives the true live colour from
        // Caddy's live admin config (the source of truth — see
        // liveRoutedColors), never from this marker; it only names which
        // window a kill happened in.
        await writePhase(phasePath, 'routed');
        // Decision 10: "caddy reload fails — green is up but unrouted. Stop
        // green, leave blue live, exit non-zero." Both failure shapes route
        // through abortSwap: the reload command itself failing, and the
        // reload exiting 0 without actually changing routing.
        try {
          await reloadCaddy();
          // Trust, but verify: reload exiting 0 only means the config was
          // syntactically valid, not that it's the config we think it is (see
          // currentCaddyConfig's doc comment — this is precisely how the
          // "reload silently no-ops" failure mode stayed invisible before).
          const liveConfig = await currentCaddyConfig();
          if (!liveConfig.includes(greenName)) {
            throw new Error(
              'caddy reload exited 0 but the live admin config ' +
                '(http://127.0.0.1:2019/config/ inside the caddy container) does not ' +
                `mention ${greenName} — routing did not actually change. Check that ` +
                '/srv/wbs/caddy/Caddyfile really imports site.caddy.',
            );
          }
        } catch (e: unknown) {
          await abortSwap(`${tier}-${to} could not be routed to`, e);
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

const USAGE =
  'usage: swap <be|gw|fe> --image=<registry/name@sha256:…> --sha=<git-sha> [--execute|--preflight]';

async function main(): Promise<void> {
  const tier = process.argv[2];
  if (tier !== 'be' && tier !== 'gw' && tier !== 'fe') {
    throw new Error(USAGE);
  }

  // Registry reachability/auth check on its own, with no lock and no state
  // change: tool-deploy runs this for every tier before executing any of
  // them, so a registry problem cannot leave one tier swapped and the next
  // one refusing to start (design decision 10).
  if (process.argv.includes('--preflight')) {
    const image = assertDigestPinnedRef(argOf('image'), tier);
    await preflightRegistry(image);
    console.log(`[swap-${tier}] preflight ok: ${image} is present and authenticated`);
    return;
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

  // Everything that can be rejected without touching the host, rejected
  // first: malformed arguments, then the registry. Only then is the lock
  // taken (design decision 10, "abort before anything starts").
  const image = assertDigestPinnedRef(argOf('image'), tier);
  const sha = argOf('sha');
  if (sha === '') throw new Error(`--sha=<git-sha> is required to execute. ${USAGE}`);
  await preflightRegistry(image);

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
    await execute(plan, image, sha);
  });
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error('[swap] failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
