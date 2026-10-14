import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { renderTemplate, siteCaddyTmpl } from '@tools/compose';
import { parseAllDocuments } from 'yaml';

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
import {
  createCutoverIdentity,
  type CutoverIdentity,
  validateCutoverReplay,
} from './cutover-replay';
import { parseDescriptor, releaseIdentityOf } from './descriptor';
import { backendTaskJob, renderOverlay, run } from './execute';
import { firstStartJournal, parseFirstStartRequest, startCutover } from './first-start';
import { fenceFirstStartManifests, firstStartEffects } from './first-start-adapter';

const USAGE = [
  'usage: cutover-cli fenced-site --site <host> --backend <container:3100> --frontend <container:80>',
  '       cutover-cli export --image <be digest ref> --data <dir> --db <file> --out <new dir> --known <json>',
  '       cutover-cli restore-job --image <be digest ref> --export-report <export-report.json>',
  '       cutover-cli verify-restore --export-report <export-report.json> --logs <restore job logs>',
  '       cutover-cli release-manifests --descriptor <descriptor.json> --environment staging|prod [--kubectl <path>]',
  '       cutover-cli handoff-manifests --descriptor <descriptor.json> --environment staging|prod [--kubectl <path>]',
  '       cutover-cli first-start --request <first-start-request.json> --state <first-start-state.json> [--kubectl <path>] [--kubeconfig <path>]',
  'export/restore-job/verify-restore also require --descriptor <file> --descriptor-sha256 <sha>; restore commands require --old-image <digest ref> --image <descriptor backend>',
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
  identity?: CutoverIdentity,
): Record<string, unknown> {
  // Proof: legacy/foreign image input refuses before rendering the writer Job.
  if (image !== identity?.backendImage)
    throw new Error('restore requires descriptor-bound backend image');
  assertExportSound(exported);
  const job = backendTaskJob(
    { namespaces: { app: 'wbs', backend: 'wbs-solver' } },
    name,
    image,
    restoreEnvironment(exported.sha256, Object.keys(exported.known), identity, exported.replay),
    restoreCommand(),
  );
  return job;
}

/** Render preparation only: no tier may start until the separate first-start admission exists. */
export function prepareCutoverManifests(rendered: string): string {
  const objects: unknown[] = parseAllDocuments(rendered).map((document) => {
    // Proof: malformed YAML fails the preparation fixture with a named refusal.
    if (document.errors.length > 0)
      throw new Error('cutover manifest is malformed', { cause: document.errors[0] });
    return document.toJS() as unknown;
  });
  let backends = 0;
  for (const raw of objects) {
    // Proof: a null document refuses before preparing Deployment replicas.
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      throw new Error('cutover manifest is malformed');
    // Boundary: parsed document is a non-null object; fields stay unknown until checked.
    const object = raw as Record<string, unknown>;
    if (object['kind'] !== 'Deployment') continue;
    const spec = object['spec'];
    const metadata = object['metadata'];
    // Proof: a backend without spec/metadata fails the production preparation helper.
    if (
      typeof spec !== 'object' ||
      spec === null ||
      Array.isArray(spec) ||
      typeof metadata !== 'object' ||
      metadata === null ||
      Array.isArray(metadata)
    )
      throw new Error('cutover Deployment has no spec or metadata');
    // Boundary: both Deployment projections were checked as non-null objects.
    const fields = spec as Record<string, unknown>;
    const names = metadata as Record<string, unknown>;
    // Proof: omitting this assignment made prepared backend/gateway fixtures run at replicas 1.
    fields['replicas'] = 0;
    if (names['name'] === 'wbs-backend') backends++;
  }
  // Proof: a ConfigMap-only render refuses instead of preparing an unguarded manifest set.
  if (backends !== 1)
    throw new Error('cutover preparation requires exactly one backend Deployment');
  return JSON.stringify({ apiVersion: 'v1', kind: 'List', items: objects });
}

/** Reads original descriptor bytes and the operator's separate pin before any export or restore. */
function readCutoverIdentity(args: readonly string[], exporting: boolean): CutoverIdentity {
  const bytes = readFileSync(required(args, '--descriptor'), 'utf8');
  const descriptor = parseDescriptor(JSON.parse(bytes) as unknown);
  return createCutoverIdentity(
    bytes,
    required(args, '--descriptor-sha256'),
    exporting ? required(args, '--image') : required(args, '--old-image'),
    exporting ? descriptor.images.backend : required(args, '--image'),
  );
}

/** The cutover's operator commands; each prints what the next step consumes. */
export async function main(args: readonly string[]): Promise<string> {
  const [command] = args;
  // Proof: restoring the descriptor-only route failed the CLI bypass refusal test.
  if (command === 'release-record')
    throw new Error('release-record requires the durable first-start coordinator; use first-start');
  if (command === 'first-start') {
    const raw: unknown = JSON.parse(readFileSync(required(args, '--request'), 'utf8'));
    const request = parseFirstStartRequest(raw);
    const state = resolve(required(args, '--state'));
    const completed = await startCutover(
      request,
      firstStartJournal(state),
      firstStartEffects({
        kubectl: args.includes('--kubectl') ? required(args, '--kubectl') : 'kubectl',
        kubeconfig: args.includes('--kubeconfig') ? required(args, '--kubeconfig') : null,
        context: request.cluster.context,
        namespaces: request.namespaces,
        stateDir: dirname(state),
        overlay: '',
        anonymousProjectsStatus: 401,
        rolloutTimeoutSeconds: 300,
        jobTimeoutSeconds: 300,
        drainTimeoutMs: 5000,
        leaseDurationSeconds: 20,
        log: console.error,
      }),
    );
    return `first-start ${completed.transaction} ${completed.phase}; writes stay fenced; traffic opening requires the attended cutover`;
  }
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
    const identity = readCutoverIdentity(args, true);
    const out = resolve(required(args, '--out'));
    // Refuses an existing directory: an export never overwrites an earlier one.
    mkdirSync(out, { recursive: false, mode: 0o700 });
    const argv = exportArgv(
      required(args, '--image'),
      resolve(required(args, '--data')),
      required(args, '--db'),
      out,
      knownRows(required(args, '--known')),
      identity,
    );
    const exported = await run(argv, null, 1_800_000);
    if (exported.exitCode !== 0) throw new Error(`export failed: ${exported.stderr.trim()}`);
    const report = parseSqliteReport(exported.stdout);
    writeFileSync(join(out, 'export-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    assertExportSound(report);
    validateCutoverReplay(report.replay, identity, report.sha256);
    return `export sound: ${join(out, 'wbs-export.sqlite')} sha256 ${report.sha256}`;
  }
  if (command === 'restore-job') {
    const report = parseSqliteReport(
      `PUNI_SQLITE_REPORT ${readFileSync(required(args, '--export-report'), 'utf8')}`,
    );
    const identity = readCutoverIdentity(args, false);
    assertExportSound(report);
    return JSON.stringify(
      restoreJob(required(args, '--image'), report, 'wbs-cutover-restore', identity),
      null,
      2,
    );
  }
  if (command === 'release-manifests' || command === 'handoff-manifests') {
    const descriptor = parseDescriptor(
      JSON.parse(readFileSync(required(args, '--descriptor'), 'utf8')) as unknown,
    );
    const identity = releaseIdentityOf(descriptor);
    const environment = required(args, '--environment');
    if (environment !== 'staging' && environment !== 'prod') {
      throw new Error(`--environment must be staging or prod, got ${environment}`);
    }
    const kubectlIndex = args.indexOf('--kubectl');
    const rendered = await renderOverlay(
      {
        kubectl: kubectlIndex === -1 ? 'kubectl' : required(args, '--kubectl'),
        overlay: resolve(import.meta.dir, '../../../../deploy/k8s/wbs/overlays', environment),
      },
      identity,
    );
    return command === 'handoff-manifests'
      ? fenceFirstStartManifests(rendered)
      : prepareCutoverManifests(rendered);
  }
  if (command === 'verify-restore') {
    const exported = parseSqliteReport(
      `PUNI_SQLITE_REPORT ${readFileSync(required(args, '--export-report'), 'utf8')}`,
    );
    const restored = parseSqliteReport(readFileSync(required(args, '--logs'), 'utf8'));
    const identity = readCutoverIdentity(args, false);
    // Proof: legacy export/restore reports cannot pass verify-restore without matching replay evidence.
    const before = validateCutoverReplay(exported.replay, identity, exported.sha256);
    const after = validateCutoverReplay(restored.replay, identity, exported.sha256);
    // Proof: changed replay evidence refuses verification even when SQLite report fields match.
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error('restored cutover replay evidence differs from export');
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
