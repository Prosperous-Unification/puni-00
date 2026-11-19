import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  readBuildFile,
  readBuildRuntime,
  readInstallRepository,
  runBuildOperation,
  runInstallChild,
  verifyPuniInstallation,
} from '@puni/burokrat/packaging';

import type { Context } from '../execute-command';
import { createLaunch } from '../startup';
import { createPackageMetadata } from './metadata';
import { createSelectedSelectionRecord, verifyPuniSelection } from './selection';
import { admitArchiveMembers, readArchive } from './archive';

interface Request {
  readonly command: 'install-puni';
  readonly archive: string;
  readonly sha256: string;
  readonly destination: string;
}
class InstallRefusal extends Error {}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const anchor = (path: string, directory: string) =>
  isAbsolute(path) ? path : directory + sep + path;
function within(directory: string, path: string): boolean {
  const offset = relative(directory, path);
  return (
    offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset))
  );
}
function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (cause) {
    if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT')
      return false;
    throw cause;
  }
}
/** Require the exact current producer bytes, rejecting duplicate/alternate JSON semantics before install. */
function readMetadata(bytes: Uint8Array, bunVersion: string): void {
  const expected = createPackageMetadata(bunVersion);
  if (!Buffer.from(bytes).equals(expected))
    throw new InstallRefusal('archive is not a dependency-free hook-free current PUNI package');
}

/**
 * Provision a separate client from explicit expected archive bytes, never a registry/default pin.
 * Existing process/output owners settle each stage before selection; partial destinations remain
 * owned and visible on failure/cancellation. The controlling package and original archive stay put.
 * @throws unexpected acquisition/verification/child failures through the existing bounded reporter.
 */
export async function runInstallPuni(request: Request, context: Context): Promise<number> {
  const selected = { ...request };
  const caller = {
    ...context,
    installation: { ...context.installation },
    lookup: { ...context.lookup },
    environment: { ...context.environment },
  };
  const bunVersion = Bun.version;
  return await runBuildOperation(async (execution) => {
    let first: 'SIGINT' | 'SIGTERM' | undefined;
    const unsubscribe = execution.subscribeInterrupts((signal) => {
      first ??= signal;
    });
    const cancellation = () => (first === undefined ? undefined : first === 'SIGINT' ? 130 : 143);
    let owned: string | undefined;
    async function cancel(status: 130 | 143): Promise<number> {
      if (owned !== undefined) {
        const report = await execution.outputs.reportDiagnostic(
          Buffer.from('puni install-puni: cancelled; retained destination: ' + owned + '\n'),
        );
        if (report.kind === 'abandoned') return 1;
      }
      return status;
    }
    async function perform(): Promise<number> {
      try {
        const early = cancellation();
        if (early !== undefined) return early;
        const callerDirectory = realpathSync.native(caller.callerDirectory);
        const installation = realpathSync.native(caller.installation.directory);
        const runtime = realpathSync.native(caller.runtime);
        if (!lstatSync(runtime).isFile())
          throw new Error('selected Bun runtime is not a regular file');
        verifyPuniInstallation(dirname(installation));
        const path = caller.lookup.path;
        if (path === undefined)
          throw new Error('trusted executable PATH is required for PUNI installation');
        const lookup = readBuildRuntime(path, caller.lookup.directory);
        const repository = await readInstallRepository(
          callerDirectory,
          lookup,
          execution.subscribeInterrupts,
        );
        if (repository.kind === 'cancelled') return repository.status;
        const archive = realpathSync.native(anchor(selected.archive, callerDirectory));
        const destinationInput = anchor(selected.destination, callerDirectory);
        if (exists(destinationInput)) throw new InstallRefusal('destination already exists');
        const parent = realpathSync.native(dirname(destinationInput));
        const destination = join(parent, basename(destinationInput));
        for (const protectedPath of [
          repository.directory,
          dirname(installation),
          dirname(runtime),
          dirname(archive),
        ])
          if (within(protectedPath, destination) || within(destination, protectedPath))
            throw new InstallRefusal(
              'destination overlaps protected caller, installation, runtime or archive authority',
            );
        if (within(repository.directory, archive))
          throw new InstallRefusal('archive must be outside the caller repository');
        const retained = readArchive(archive);
        if (hash(retained) !== selected.sha256) throw new InstallRefusal('archive digest mismatch');
        admitArchiveMembers(retained);
        const entries = await new Bun.Archive(retained).files([
          'package/package.json',
          'package/dist/puni.mjs',
        ]);
        const metadata = entries.get('package/package.json');
        const main = entries.get('package/dist/puni.mjs');
        if (metadata === undefined || main === undefined || entries.size !== 2)
          throw new InstallRefusal('archive has no regular current PUNI metadata and main');
        const metadataBytes = new Uint8Array(await metadata.arrayBuffer());
        const mainBytes = new Uint8Array(await main.arrayBuffer());
        readMetadata(metadataBytes, bunVersion);
        const beforeReservation = cancellation();
        if (beforeReservation !== undefined) return beforeReservation;
        mkdirSync(destination, { mode: 0o700 });
        owned = destination;
        const consumer = join(destination, 'consumer'),
          home = join(destination, 'home'),
          cache = join(destination, 'cache');
        for (const directory of [consumer, home, cache]) mkdirSync(directory, { mode: 0o700 });
        const retainedArchive = join(destination, 'authenticated-puni.tgz');
        writeFileSync(retainedArchive, retained, { flag: 'wx', mode: 0o400 });
        if (hash(readBuildFile(retainedArchive)) !== selected.sha256)
          throw new Error('retained installation archive readback differs');
        writeFileSync(join(consumer, 'package.json'), '{"private":true}\n', {
          flag: 'wx',
          mode: 0o600,
        });
        const environment = {
          PATH: lookup.environment['PATH'],
          HOME: home,
          BUN_INSTALL_CACHE_DIR: cache,
        };
        const errors: Uint8Array[] = [];
        const installed = await runInstallChild({
          argv: [
            runtime,
            '--no-env-file',
            '--config=/dev/null',
            'add',
            '--ignore-scripts',
            retainedArchive,
          ],
          directory: consumer,
          environment,
          stdout: () => ({ kind: 'written' }),
          stderr: (bytes) => {
            errors.push(bytes.slice());
            return { kind: 'written' };
          },
          subscribeInterrupts: execution.subscribeInterrupts,
        });
        if (installed.kind === 'cancelled') return await cancel(installed.status);
        if (installed.status !== 0)
          throw new Error(
            'Bun local package installation failed with status ' + String(installed.status),
            {
              cause: new Error(Buffer.concat(errors).toString('utf8')),
            },
          );
        if (hash(readBuildFile(retainedArchive)) !== selected.sha256)
          throw new Error('owned installation archive changed during installation');
        const packageDirectory = realpathSync.native(join(consumer, 'node_modules/puni'));
        if (!within(consumer, packageDirectory))
          throw new Error('installed package escapes its owned consumer');
        readMetadata(readBuildFile(join(packageDirectory, 'package.json')), bunVersion);
        const verified = verifyPuniInstallation(packageDirectory);
        if (
          !within(destination, verified.entrypoint) ||
          hash(readBuildFile(verified.entrypoint)) !== hash(mainBytes)
        )
          throw new Error('installed PUNI main differs from the authenticated archive');
        const probe = join(destination, 'verify-main.mjs');
        writeFileSync(
          probe,
          'const entry=await import(' +
            JSON.stringify(pathToFileURL(verified.entrypoint).href) +
            ');if(typeof entry.main!=="function")throw new Error("installed PUNI main export is absent");process.stdout.write("puni-main-ready\\n");',
          { flag: 'wx', mode: 0o400 },
        );
        const probed = await runInstallChild({
          argv: createLaunch(runtime, probe),
          directory: home,
          environment,
          stdout: () => ({ kind: 'written' }),
          stderr: (bytes) => {
            errors.push(bytes.slice());
            return { kind: 'written' };
          },
          subscribeInterrupts: execution.subscribeInterrupts,
        });
        if (probed.kind === 'cancelled') return await cancel(probed.status);
        if (probed.status !== 0 || Buffer.from(probed.stdout).toString() !== 'puni-main-ready\n')
          throw new Error('installed PUNI main export verification failed', {
            cause: new Error(Buffer.concat(errors).toString('utf8')),
          });
        const beforeSelection = cancellation();
        if (beforeSelection !== undefined) return await cancel(beforeSelection);
        if(verified.profileVersion!=='0.4.0')throw new Error('current PUNI installation requires the selected-source profile');
        const selectionBytes = createSelectedSelectionRecord(destination, selected.sha256, verified.entrypoint,verified.sourceSelection);
        await verifyPuniSelection(selectionBytes, hash(selectionBytes), destination);
        const beforeRecord = cancellation();
        if (beforeRecord !== undefined) return await cancel(beforeRecord);
        const selectionPath = join(destination, 'puni-selection.json');
        writeFileSync(selectionPath, selectionBytes, { flag: 'wx', mode: 0o400 });
        if (!Buffer.from(readBuildFile(selectionPath)).equals(Buffer.from(selectionBytes)))
          throw new Error('owned PUNI selection record readback differs');
        const written = await execution.outputs.stdout(
          Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              archiveSha256: selected.sha256,
              entrypoint: verified.entrypoint,
            }) + '\n',
          ),
        );
        return written.kind === 'cancelled'
          ? await cancel(written.signal === 'SIGINT' ? 130 : 143)
          : 0;
      } catch (cause) {
        if (cause instanceof InstallRefusal && owned === undefined) {
          const written = await execution.outputs.stderr(
            Buffer.from('puni install-puni: ' + cause.message + '\n'),
          );
          return written.kind === 'cancelled' ? (written.signal === 'SIGINT' ? 130 : 143) : 78;
        }
        throw new AggregateError(
          [cause],
          'PUNI installation failed' +
            (owned === undefined ? '' : '; retained destination: ' + owned),
          { cause },
        );
      }
    }
    const settled = await perform().then(
      (value) => ({ ok: true as const, value }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    let release: { cause: unknown } | undefined;
    try {
      unsubscribe();
    } catch (cause) {
      release = { cause };
    }
    if (!settled.ok) {
      if (release !== undefined)
        throw new AggregateError(
          [settled.cause, release.cause],
          'PUNI installation and interruption release failed',
          { cause: settled.cause },
        );
      throw settled.cause;
    }
    if (release !== undefined) throw release.cause;
    return settled.value;
  });
}
