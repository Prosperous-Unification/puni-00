import { realpathSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

import type { BrowserRequest, PerformanceRequest } from '@puni/dash/grammar';

import type { Context } from '../execute-command';
import { verifyPuniSelection } from './selection';
import { readSourceTestLevelSelection } from './source-test-level-selection';

/**
 * Capture root-owned invocation and independent asset selection before lazy provider work.
 * Installed mode binds the exact delivered main. Explicit source mode instead requires its
 * actual main and complete current source capture to match the same producer's relative identity;
 * a role flag, suffix or producer's temporary absolute pathname grants no source authority.
 */
async function readTestLevelContext(supplied: Context) {
  const context = {
    ...supplied,
    installation: { ...supplied.installation },
    lookup: { ...supplied.lookup },
    environment: { ...supplied.environment },
  };
  const required = (name: string): string => {
    const value = context.environment[name];
    if (value === undefined || value === '')
      throw new Error('test levels require explicit ' + name);
    return value;
  };
  const role = context.environment['PUNI_TEST_LEVEL_ROLE'];
  if (role !== undefined && role !== 'installed' && role !== 'source')
    throw new Error('unsupported test-level composition role');
  const source =
    role === 'source'
      ? readSourceTestLevelSelection(required('PUNI_SOURCE_TEST_LEVEL_SELECTION'))
      : undefined;
  const bytes = source === undefined ? Buffer.from(required('PUNI_SELECTION')) : source.record;
  const expected = source === undefined ? required('PUNI_SELECTION_SHA256') : source.recordSha256;
  const directory =
    source === undefined ? required('PUNI_INSTALLATION_DIRECTORY') : source.installationDirectory;
  const executable = source === undefined ? required('PUNI_EXECUTABLE') : source.executable;
  const sourceRoot = source?.sourceRoot;
  if (sourceRoot !== undefined && !isAbsolute(sourceRoot))
    throw new Error('test-level source root must be absolute');
  const installation = await verifyPuniSelection(bytes, expected, directory);
  if (realpathSync.native(executable) !== installation.entrypoint)
    throw new Error('test levels require the actually selected installed assets');
  if (realpathSync.native(context.runtime) !== realpathSync.native(process.execPath))
    throw new Error('test levels require the actual captured Bun executable');
  const provider = await import('@puni/burokrat/test-levels');
  const selected = provider.readInstalledTestLevelAssets(dirname(installation.entrypoint));
  if (role === 'source') {
    if (sourceRoot === undefined) throw new Error('source test-level role lacks its captured root');
    const path = context.lookup.path;
    if (path === undefined) throw new Error('source test levels require captured trusted Git PATH');
    const runtime = provider.readBuildRuntime(path, context.lookup.directory);
    const observation = { hasVerifiedSource: false };
    const status = await provider.runBuildOperation(async ({ subscribeInterrupts }) => {
      const observed = await provider.verifySourceTestLevelRoot(
        { sourceRoot, entrypoint: context.installation.entrypoint, manifest: selected.sourceRoot },
        { runtime, subscribeInterrupts },
      );
      if (observed.kind === 'cancelled') return observed.status;
      observation.hasVerifiedSource = true;
      return 0;
    });
    if (status !== 0) return { kind: 'refused' as const, status };
    if (!observation.hasVerifiedSource)
      throw new Error('source test-level preflight returned without its actual source observation');
  } else if (realpathSync.native(context.installation.entrypoint) !== installation.entrypoint) {
    throw new Error('installed test levels require the exact delivered root main');
  }
  return {
    kind: 'ready' as const,
    context: {
      runtime: context.runtime,
      callerDirectory: context.callerDirectory,
      environment: context.environment,
      assets: selected.assets,
      judge: provider.createPerformanceJudge({
        runtime: context.runtime,
        temporaryDirectory: context.temporaryDirectory,
        environment: context.environment,
        worker: selected.worker,
      }),
    },
  };
}

/** Execute actual owned Browser code only after installed or explicit source composition admission. */
export async function runInstalledBrowser(
  request: BrowserRequest,
  supplied: Context,
): Promise<number> {
  const retained = { ...request },
    selected = await readTestLevelContext(supplied);
  if (selected.kind === 'refused') return selected.status;
  const { runBrowser } = await import('@puni/dash/runtime');
  return await runBrowser(retained, selected.context);
}

/** Execute actual owned Performance code with separately selected policy and authenticated judge assets. */
export async function runInstalledPerformance(
  request: PerformanceRequest,
  supplied: Context,
): Promise<number> {
  const retained = { ...request },
    selected = await readTestLevelContext(supplied);
  if (selected.kind === 'refused') return selected.status;
  const { runPerformance } = await import('@puni/dash/runtime');
  return await runPerformance(retained, selected.context);
}
