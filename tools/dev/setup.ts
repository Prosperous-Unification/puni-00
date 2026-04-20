#!/usr/bin/env bun
/**
 * Local dev setup: copies .env.example → .env for each app where .env is missing.
 * Non-destructive — never overwrites an existing .env.
 *
 * Run via: bun run dev:setup
 */
import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..');
const APPS: readonly string[] = ['be-01', 'gw-01', 'fe-01'];

async function seedApp(app: string): Promise<void> {
  const example = resolve(ROOT, 'apps', app, '.env.example');
  const target = resolve(ROOT, 'apps', app, '.env');
  if (!existsSync(example)) {
    console.log(`[dev:setup] ${app}: no .env.example — skipping`);
    return;
  }
  if (existsSync(target)) {
    console.log(`[dev:setup] ${app}: .env already exists — skipping`);
    return;
  }
  await copyFile(example, target);
  console.log(`[dev:setup] ${app}: wrote ${target}`);
}

async function main(): Promise<void> {
  console.log('[dev:setup] seeding local .env files (non-destructive)');
  for (const a of APPS) await seedApp(a);
  console.log('[dev:setup] done. run `bun run dev` to start be-01 + gw-01 + fe-01.');
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error('[dev:setup] failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
