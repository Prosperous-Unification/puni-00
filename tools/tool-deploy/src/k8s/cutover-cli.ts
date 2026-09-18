import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { renderTemplate, siteCaddyTmpl } from '@tools/compose';

import {
  assertExportSound,
  assertRestoredMatches,
  exportArgv,
  fencedSiteContext,
  parseSqliteReport,
  restoreCommand,
  restoreEnvironment,
  type SqliteReport,
} from './cutover';
import { parseDescriptor, releaseIdentityOf } from './descriptor';
import { backendTaskJob, releaseRecord, renderOverlay, run } from './execute';

const USAGE = [
  'usage: cutover-cli fenced-site --site <host> --backend <container:3100> --frontend <container:80>',
  '       cutover-cli export --image <be digest ref> --data <dir> --db <file> --out <new dir> --known <json>',
  '       cutover-cli restore-job --image <be digest ref> --export-report <export-report.json>',
  '       cutover-cli verify-restore --export-report <export-report.json> --logs <restore job logs>',
  '       cutover-cli release-manifests --descriptor <descriptor.json> --environment staging|prod [--kubectl <path>]',
  '       cutover-cli release-record --descriptor <descriptor.json>',
].join('\n');

function required(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length || args[index + 1].startsWith('--')) {
    throw new Error(`${name} is required\n${USAGE}`);
  }
  return args[index + 1];
}

function knownRows(text: string): string[] {
  const parsed: unknown = JSON.parse(text);
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every((n) => typeof n === 'string')
  ) {
    throw new Error('--known must be a non-empty JSON array of project names');
  }
  return parsed;
}

/** The restore Job for `exported`, named `name` (`wbs-cutover-restore` in production). */
export function restoreJob(
  image: string,
  exported: SqliteReport,
  name = 'wbs-cutover-restore',
): Record<string, unknown> {
  const job = backendTaskJob(
    { namespaces: { app: 'wbs', backend: 'wbs-solver' } },
    name,
    image,
    restoreEnvironment(exported.sha256, Object.keys(exported.known)),
  );
  // Boundary: backendTaskJob's own shape, which this replaces the command of.
  const spec = job['spec'] as { template: { spec: { containers: { command: string[] }[] } } };
  spec.template.spec.containers[0].command = restoreCommand();
  return job;
}

/** The cutover's operator commands; each prints what the next step consumes. */
export async function main(args: readonly string[]): Promise<string> {
  const [command] = args;
  if (command === 'fenced-site') {
    return renderTemplate(
      siteCaddyTmpl,
      fencedSiteContext(
        required(args, '--site'),
        required(args, '--backend'),
        required(args, '--frontend'),
      ),
    );
  }
  if (command === 'export') {
    const out = resolve(required(args, '--out'));
    // Refuses an existing directory: an export never overwrites an earlier one.
    mkdirSync(out, { recursive: false, mode: 0o700 });
    const argv = exportArgv(
      required(args, '--image'),
      resolve(required(args, '--data')),
      required(args, '--db'),
      out,
      knownRows(required(args, '--known')),
    );
    const exported = await run(argv, null, 1_800_000);
    if (exported.exitCode !== 0) throw new Error(`export failed: ${exported.stderr.trim()}`);
    const report = parseSqliteReport(exported.stdout);
    writeFileSync(join(out, 'export-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    assertExportSound(report);
    return `export sound: ${join(out, 'wbs-export.sqlite')} sha256 ${report.sha256}`;
  }
  if (command === 'restore-job') {
    const report = parseSqliteReport(
      `PUNI_SQLITE_REPORT ${readFileSync(required(args, '--export-report'), 'utf8')}`,
    );
    return JSON.stringify(restoreJob(required(args, '--image'), report), null, 2);
  }
  if (command === 'release-manifests' || command === 'release-record') {
    const descriptor = parseDescriptor(
      JSON.parse(readFileSync(required(args, '--descriptor'), 'utf8')) as unknown,
    );
    const identity = releaseIdentityOf(descriptor);
    if (command === 'release-record') return JSON.stringify(releaseRecord(identity), null, 2);
    const environment = required(args, '--environment');
    if (environment !== 'staging' && environment !== 'prod') {
      throw new Error(`--environment must be staging or prod, got ${environment}`);
    }
    const kubectlIndex = args.indexOf('--kubectl');
    return renderOverlay(
      {
        kubectl: kubectlIndex === -1 ? 'kubectl' : required(args, '--kubectl'),
        overlay: resolve(import.meta.dir, '../../../../deploy/k8s/wbs/overlays', environment),
      },
      identity,
    );
  }
  if (command === 'verify-restore') {
    const exported = parseSqliteReport(
      `PUNI_SQLITE_REPORT ${readFileSync(required(args, '--export-report'), 'utf8')}`,
    );
    const restored = parseSqliteReport(readFileSync(required(args, '--logs'), 'utf8'));
    assertRestoredMatches(exported, restored);
    return `restore matches the export: ${restored.path} sha256 ${restored.sha256}`;
  }
  throw new Error(USAGE);
}

if (import.meta.main) {
  try {
    console.log(await main(process.argv.slice(2)));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exit(1);
  }
}
