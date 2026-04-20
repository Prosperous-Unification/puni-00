import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

export interface ValidationResult {
  file: string;
  ok: boolean;
  error?: string;
}

async function validateDashboardJson(path: string): Promise<ValidationResult> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as { uid?: unknown; panels?: unknown };
    if (typeof parsed.uid !== 'string') return { file: path, ok: false, error: 'missing uid' };
    if (!Array.isArray(parsed.panels))
      return { file: path, ok: false, error: 'panels must be an array' };
    return { file: path, ok: true };
  } catch (e) {
    return { file: path, ok: false, error: (e as Error).message };
  }
}

async function validateYaml(path: string): Promise<ValidationResult> {
  try {
    const raw = await readFile(path, 'utf8');
    parseYaml(raw);
    return { file: path, ok: true };
  } catch (e) {
    return { file: path, ok: false, error: (e as Error).message };
  }
}

export async function validateTree(rootDir: string): Promise<ValidationResult[]> {
  const files = await readdir(rootDir, { recursive: true, withFileTypes: true });
  const out: ValidationResult[] = [];
  for (const f of files) {
    if (!f.isFile()) continue;
    const parent: string =
      typeof (f as { parentPath?: unknown }).parentPath === 'string'
        ? (f as { parentPath: string }).parentPath
        : rootDir;
    const full = join(parent, f.name);
    if (f.name.endsWith('.json')) out.push(await validateDashboardJson(full));
    else if (f.name.endsWith('.yml') || f.name.endsWith('.yaml'))
      out.push(await validateYaml(full));
  }
  return out;
}

async function main(): Promise<void> {
  const root = new URL('.', import.meta.url).pathname;
  const results = await validateTree(root);
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    const status = r.ok ? 'ok' : 'FAIL';
    console.log(`[${status}] ${r.file}${r.error ? ': ' + r.error : ''}`);
  }
  if (failed.length > 0) process.exit(1);
}

if (import.meta.main) {
  void main();
}
