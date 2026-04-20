import { assertRealCiphertext } from './shared';

async function main(): Promise<void> {
  await assertRealCiphertext();
  const host = process.env['DEPLOY_HOST'];
  if (!host) {
    throw new Error('DEPLOY_HOST env var required (e.g. user@host).');
  }
  console.log(`[tool-secrets] would run: sops --decrypt ... | ssh ${host} 'tee /srv/wbs/.env'`);
  console.log(
    '[tool-secrets] push CLI is a placeholder — will be wired to @wbs/scripts ssh helpers once a real age key is configured.',
  );
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
