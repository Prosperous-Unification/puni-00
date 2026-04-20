import { type BundleMeta, bundleName, metaJson } from './lib/bundle';
import { DEFAULT_IMAGES, type ImageSpec } from './lib/image';

export interface BuildOptions {
  sha: string;
  mode: 'build-only' | 'publish';
}

export function planFe(opts: BuildOptions): {
  image: ImageSpec;
  bundle: string;
  meta: string;
} {
  const image = DEFAULT_IMAGES.fe;
  const bundle = bundleName('fe', opts.sha);
  const meta: BundleMeta = {
    sha: opts.sha,
    tier: 'fe',
    builtAt: new Date().toISOString(),
    files: ['dist/', 'META.json', 'VERSION', 'templates/fe.caddy', 'templates/fe.compose'],
  };
  return { image, bundle, meta: metaJson(meta) };
}

function parseArgs(argv: string[]): BuildOptions {
  const mode: BuildOptions['mode'] = argv.includes('--publish') ? 'publish' : 'build-only';
  const sha = process.env['GIT_SHA'] ?? 'deadbeef';
  return { mode, sha };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const plan = planFe(opts);
  console.log(
    `[tool-dagger/fe-01] ${opts.mode} plan — image=${plan.image.baseImage} bundle=${plan.bundle}`,
  );
  console.log(
    '[tool-dagger/fe-01] fe-01 bundle is static assets + Caddy config — real dagger SDK wiring intentionally omitted.',
  );
  await Promise.resolve();
}

if (import.meta.main) {
  void main();
}
