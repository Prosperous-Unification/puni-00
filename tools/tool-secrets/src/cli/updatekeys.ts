import { DEFAULT_SOPS_FILE } from './shared';

async function main(): Promise<void> {
  await Promise.resolve();
  console.log(`[tool-secrets] would run: sops updatekeys ${DEFAULT_SOPS_FILE}`);
  console.log(
    '[tool-secrets] updatekeys CLI is a placeholder — invokes sops once a real age key is configured.',
  );
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
