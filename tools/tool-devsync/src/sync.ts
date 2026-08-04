#!/usr/bin/env bun
/**
 * The dev deploy. Runs on h2puni, not here.
 *
 * Dev serves from a bind-mounted checkout whose tiers already watch for
 * changes -- be-01 and gw-01 under `bun --watch`, fe-01 under Vite HMR. So the
 * deploy is a write into that checkout: fetch, reset to a SHA, done. Nothing
 * is built, nothing is pushed to a registry, and nothing restarts.
 *
 * The one exception is a dependency change. `bun install` cannot happen inside
 * a running watcher, so a moved lockfile means install and restart.
 *
 * Run via: `bun tools/tool-devsync/src/sync.ts <sha>` from the checkout root.
 */
import { $ } from 'bun';

const SRC = '/home/puni1/wbs-dev/src';
const CONTAINER = 'wbs-dev-src';

/**
 * Whether the container must be restarted after a pull.
 *
 * An unreadable hash on either side is treated as changed. Inferring "nothing
 * to do" from missing evidence is how dev ends up serving against stale
 * dependencies with no symptom other than behaviour that does not match the
 * code.
 */
export function needsRestart(before: string, after: string): boolean {
  if (!before || !after) return true;
  return before !== after;
}

async function lockHash(): Promise<string> {
  try {
    const out = await $`sha256sum ${SRC}/bun.lock`.text();
    return out.split(' ')[0] ?? '';
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
    console.log('[dev-sync] dependencies moved: installing and restarting');
    await $`docker exec ${CONTAINER} bun install --frozen-lockfile`;
    await $`docker restart ${CONTAINER}`;
  } else {
    console.log('[dev-sync] code only: watchers pick it up, nothing restarted');
  }

  const head = (await $`git -C ${SRC} rev-parse HEAD`.text()).trim();
  console.log(`[dev-sync] dev now at ${head}`);
}

if (import.meta.main) {
  const sha = process.argv[2];
  if (!sha) {
    console.error('usage: bun sync.ts <sha>');
    process.exit(1);
  }
  await sync(sha);
}
