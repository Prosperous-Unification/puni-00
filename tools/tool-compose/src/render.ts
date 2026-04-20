import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

export type RenderContext = Readonly<Record<string, string>>;

const PLACEHOLDER = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;

export function renderTemplate(tmpl: string, ctx: RenderContext): string {
  return tmpl.replace(PLACEHOLDER, (_, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(ctx, key)) {
      throw new Error(`Missing placeholder value for {{${key}}}`);
    }
    return ctx[key];
  });
}

export interface RenderAllOptions {
  templatesDir: string;
  outDir: string;
  context: RenderContext;
}

export async function renderAll(opts: RenderAllOptions): Promise<string[]> {
  const files = await readdir(opts.templatesDir, { recursive: true, withFileTypes: true });
  const written: string[] = [];
  for (const f of files) {
    if (!f.isFile()) continue;
    if (!f.name.endsWith('.tmpl')) continue;
    const parent: string =
      typeof (f as { parentPath?: unknown }).parentPath === 'string'
        ? (f as { parentPath: string }).parentPath
        : opts.templatesDir;
    const srcPath = join(parent, f.name);
    const content = await readFile(srcPath, 'utf8');
    const rendered = renderTemplate(content, opts.context);
    const rel = relative(opts.templatesDir, srcPath).replace(/\.tmpl$/, '');
    const dst = join(opts.outDir, rel);
    await mkdir(dirname(dst), { recursive: true });
    await writeFile(dst, rendered, 'utf8');
    written.push(dst);
  }
  return written;
}

function parseArgs(argv: string[]): { outDir: string } {
  const args: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m && typeof m[1] === 'string' && typeof m[2] === 'string') {
      args[m[1]] = m[2];
    }
  }
  return { outDir: args['outDir'] ?? 'dist/tools/tool-compose' };
}

async function main(): Promise<void> {
  const { outDir } = parseArgs(process.argv.slice(2));
  const ctx: RenderContext = {
    BE_IMAGE: process.env['BE_IMAGE'] ?? 'ghcr.io/example/be-01:latest',
    BE_PORT: process.env['BE_PORT'] ?? '3100',
    BE_HOST_PORT: process.env['BE_HOST_PORT'] ?? '3100',
    GW_IMAGE: process.env['GW_IMAGE'] ?? 'ghcr.io/example/gw-01:latest',
    GW_PORT: process.env['GW_PORT'] ?? '3200',
    GW_HOST_PORT: process.env['GW_HOST_PORT'] ?? '3200',
    DOMAIN: process.env['DOMAIN'] ?? 'example.local',
    OBSERVABILITY_BASIC_AUTH_HASH: process.env['OBSERVABILITY_BASIC_AUTH_HASH'] ?? '$CHANGE-ME$',
  };
  const written = await renderAll({
    templatesDir: new URL('./templates', import.meta.url).pathname,
    outDir,
    context: ctx,
  });
  console.log(`rendered ${String(written.length)} file(s) into ${outDir}`);
}

if (import.meta.main) {
  void main();
}
