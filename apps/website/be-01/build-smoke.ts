import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseAnalyticsRegionResponse } from '@website/contracts';
import { S3StandIn, WebsiteStore } from '@website/store-sqlite';

import { countryRelease } from './src/country-database';

const directory = mkdtempSync(join(tmpdir(), 'puni-retention-build-'));
try {
  const bundle = join(directory, 'bundle');
  cpSync(join(import.meta.dir, 'dist'), bundle, { recursive: true });
  const databasePath = join(directory, 'website.sqlite');
  const store = new WebsiteStore(databasePath);
  store.createDraft('expired', 'private description', 'private claim', 1, 2, 'source-test');
  store.close();
  const command = Bun.spawnSync(
    ['bun', join(bundle, 'draft-retention-cli.js'), 'inspect', databasePath],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  if (command.exitCode !== 0) throw new Error(new TextDecoder().decode(command.stderr));
  const plan = JSON.parse(new TextDecoder().decode(command.stdout)) as {
    eligibleDrafts: number;
    fingerprint: string;
  };
  if (plan.eligibleDrafts !== 1 || !/^[a-f0-9]{64}$/.test(plan.fingerprint))
    throw new Error('Bundled retention command returned the wrong plan');
  const report = Bun.spawnSync(
    ['bun', join(bundle, 'request-retention-cli.js'), 'report', databasePath],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  if (report.exitCode !== 0) throw new Error(new TextDecoder().decode(report.stderr));
  const counts = JSON.parse(new TextDecoder().decode(report.stdout)) as {
    deletion: string;
    activation: string;
  };
  if (counts.deletion !== 'disabled' || counts.activation !== 'ready')
    throw new Error('Bundled request retention report returned the wrong state');
  const capabilities: unknown = JSON.parse(readFileSync(join(bundle, 'capabilities.json'), 'utf8'));
  // Proof: with conversion-scoping/1 absent from the actual built output, this refusal
  // failed test:package on 2026-10-25 before the journal stand-in; restoring it passed.
  if (
    JSON.stringify(capabilities) !== JSON.stringify(['retention-journal/1', 'conversion-scoping/1'])
  )
    throw new Error(
      'Bundled capabilities.json must declare retention-journal/1 and conversion-scoping/1',
    );
  const countryAssets = join(bundle, 'assets/country');
  const packagedRelease: unknown = JSON.parse(
    readFileSync(join(countryAssets, 'release.json'), 'utf8'),
  );
  // Proof: replacing the actual dist release.json with {} failed this package smoke.
  if (JSON.stringify(packagedRelease) !== JSON.stringify(countryRelease))
    throw new Error('Bundled country provenance differs from the configured release');
  const notice = readFileSync(join(countryAssets, 'NOTICE.txt'), 'utf8');
  // Proof: replacing the actual dist notice without attribution/licence failed this package smoke.
  if (
    !notice.includes('IP Geolocation by DB-IP https://db-ip.com') ||
    !notice.includes('https://creativecommons.org/licenses/by/4.0/')
  )
    throw new Error('Bundled country notice has no attribution or licence');
  const available = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  const port = available.port;
  await available.stop(true);
  const runtimeEnvironment = {
    PATH: process.env['PATH'],
    WEBSITE_API_HOST: '127.0.0.1',
    WEBSITE_API_PORT: String(port),
    WEBSITE_DATABASE_PATH: join(directory, 'runtime.sqlite'),
    RETENTION_JOURNAL: 'disabled',
    TRUSTED_PROXY_HOPS: '1',
    PUBLIC_ORIGIN: 'http://site.test',
    APP_ORIGIN: 'http://app.test',
  };
  const startRuntime = () =>
    Bun.spawn([process.execPath, join(bundle, 'main.js')], {
      env: runtimeEnvironment,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  // Proof: removing the actual dist archive made compiled main refuse before listening.
  const runtime = startRuntime();
  const diagnostics = new Response(runtime.stderr).text();
  const startupDeadline = setTimeout(() => {
    runtime.kill();
  }, 10_000);
  try {
    const reader = runtime.stdout.getReader();
    const started = await reader.read();
    reader.releaseLock();
    if (started.done || !new TextDecoder().decode(started.value).includes('Website API listening'))
      throw new Error(`Bundled main did not start: ${await diagnostics}`);
    for (const [address, region] of [
      ['8.8.8.8', 'elsewhere'],
      ['80.158.1.1', 'consent-required'],
      ['2a00:1450:4001:800::200e', 'consent-required'],
      ['127.0.0.1', 'unknown'],
    ]) {
      const response = await fetch(`http://127.0.0.1:${String(port)}/analytics/region`, {
        headers: { 'x-forwarded-for': address },
        signal: AbortSignal.timeout(3_000),
      });
      const decision = parseAnalyticsRegionResponse(await response.json());
      if (
        response.status !== 200 ||
        decision.region !== region ||
        decision.database?.month !== '2026-11'
      )
        throw new Error('Bundled main returned the wrong regional decision');
    }
  } finally {
    clearTimeout(startupDeadline);
    runtime.kill();
    await runtime.exited;
  }
  // Proof: every successful smoke removes this copied runtime asset and observes startup refusal.
  rmSync(join(countryAssets, countryRelease.archive));
  const brokenRuntime = startRuntime();
  const failureDeadline = setTimeout(() => {
    brokenRuntime.kill();
  }, 10_000);
  try {
    const exitCode = await brokenRuntime.exited;
    const error = await new Response(brokenRuntime.stderr).text();
    if (exitCode === 0 || !error.includes('Country database archive cannot be read'))
      throw new Error('Bundled main did not refuse its missing configured country archive');
  } finally {
    clearTimeout(failureDeadline);
    if (brokenRuntime.exitCode === null) brokenRuntime.kill();
  }
  console.info(
    'Bundled main: IPv4/IPv6 regional decisions and absent-asset startup refusal verified',
  );
  // The bundled journal commands against a local S3 stand-in (dummy credentials, loopback only).
  const standIn = new S3StandIn('journal-smoke');
  try {
    const journalEnvironment = {
      ...process.env,
      S3_ENDPOINT: standIn.endpoint,
      S3_REGION: 'local',
      S3_ACCESS_KEY_ID: 'smoke-access-key',
      S3_SECRET_ACCESS_KEY: 'smoke-secret-key',
      RETENTION_JOURNAL_BUCKET: 'journal-smoke',
      RETENTION_JOURNAL_PREFIX: 'retention-journal/website-smoke/',
      RETENTION_WRITER_RELEASE: 'build-smoke',
      RETENTION_WRITER_REVISION: 'build-smoke',
    };
    const journal = async (...arguments_: string[]) => {
      const child = Bun.spawn(['bun', join(bundle, 'request-retention-cli.js'), ...arguments_], {
        env: journalEnvironment,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const exitCode = await child.exited;
      if (exitCode !== 0) throw new Error(await new Response(child.stderr).text());
      return JSON.parse(await new Response(child.stdout).text()) as Record<string, unknown>;
    };
    const { journalId } = await journal('journal-init', databasePath);
    if (typeof journalId !== 'string') throw new Error('journal-init printed no journal id');
    Object.assign(journalEnvironment, { RETENTION_JOURNAL: 's3', RETENTION_JOURNAL_ID: journalId });
    const status = await journal('journal-status', databasePath);
    if (status['state'] !== 'attached' || status['headSequence'] !== 0)
      throw new Error('Bundled journal-status returned the wrong position');
  } finally {
    await standIn.stop();
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
