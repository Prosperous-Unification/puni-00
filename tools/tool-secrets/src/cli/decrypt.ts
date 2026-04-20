import { assertRealCiphertext, DEFAULT_SOPS_FILE } from './shared';

async function main(): Promise<void> {
  await assertRealCiphertext();
  console.log(`[tool-secrets] would run: sops --decrypt ${DEFAULT_SOPS_FILE}`);
  console.log(
    '[tool-secrets] decrypt CLI is a placeholder — integrate with mozilla/sops when a real key is configured.',
  );
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
