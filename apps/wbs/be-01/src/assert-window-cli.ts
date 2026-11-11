import { assertWindowBackup } from '@wbs/store-sqlite/window-backup';

/** Import-safe E37 readonly verifier; no application boot, migrations or checkpoint side effects. */
export function runAssertWindowCommand(
  args: readonly string[],
  environment: { readonly DB_PATH?: string },
) {
  const sourcePath = environment.DB_PATH;
  // Proof: window-assert-required-source-env changes/removes this production argv boundary boundary; observed named RED: refuses assert missing-db before changing database or artifacts. Missing required environment may fail later too; the named refusal must be emitted before artifact work.
  if (sourcePath === undefined || sourcePath === '') throw new Error('DB_PATH must be set');
  // Proof: window-verifier-required-report-argv changes/removes this production argv tuple boundary; observed named RED: refuses assert missing-argument before changing database or artifacts; refuses assert empty-report before changing database or artifacts; refuses assert unknown-option before changing database or artifacts; refuses assert duplicate-option before changing database or artifacts. One exact verifier argv-shape proof, across absence/empty/unknown/duplicate arguments. Later required-file failures must not replace boundary usage refusal.
  if (
    args.length !== 1 ||
    !args[0]?.startsWith('--report=') ||
    args[0].slice('--report='.length) === ''
  )
    throw new Error('usage: assert-window-cli.ts --report=<file>');
  return assertWindowBackup({
    sourcePath,
    reportPath: args[0].slice('--report='.length),
    migrationsFolder: './drizzle',
  });
}

if (import.meta.main)
  console.log(
    JSON.stringify(
      runAssertWindowCommand(process.argv.slice(2), { DB_PATH: process.env['DB_PATH'] }),
    ),
  );
