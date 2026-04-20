import { type BundleMeta, bundleName, metaJson } from './lib/bundle';
import { DEFAULT_IMAGES, type ImageSpec } from './lib/image';

export interface BuildOptions {
  sha: string;
  mode: 'build-only' | 'publish';
}

export function planBe(opts: BuildOptions): {
  image: ImageSpec;
  bundle: string;
  meta: string;
} {
  const image = DEFAULT_IMAGES.be;
  const bundle = bundleName('be', opts.sha);
  const meta: BundleMeta = {
    sha: opts.sha,
    tier: 'be',
    builtAt: new Date().toISOString(),
    images: [`${image.baseImage}+be-01@${opts.sha}`],
    files: ['image.tar', 'META.json', 'VERSION', 'templates/be.caddy', 'templates/be.compose'],
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
  const plan = planBe(opts);
  console.log(
    `[tool-dagger/be-01] ${opts.mode} plan — image=${plan.image.baseImage} bundle=${plan.bundle}`,
  );
  console.log(
    '[tool-dagger/be-01] build-and-publish wiring is a scaffold — real dagger SDK calls are intentionally omitted to avoid network / daemon side-effects.',
  );
  await Promise.resolve();
}

if (import.meta.main) {
  void main();
}
