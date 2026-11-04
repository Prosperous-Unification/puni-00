import * as filesystem from 'node:fs/promises';

import { mock } from 'bun:test';

import * as authority from './registry-authority-host';
import { invokeRegistryCallback } from './registry-callback';
import * as deletion from './registry-deletion.fixture';
import {
  RegistryDeletionOwnerObservation,
  RegistryDeletionOwnerRequest,
} from './registry-deletion-owner-observation.fixture';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import * as http from './registry-http-observation.fixture';
import * as journal from './registry-journal';
import * as maintenance from './registry-maintenance';
import * as clock from './registry-maintenance-clock.fixture';
import * as installation from './registry-maintenance-installation';
import * as publication from './registry-maintenance-publication.fixture';
import * as runtime from './registry-maintenance-runtime';

const request = RegistryDeletionOwnerRequest.assert(JSON.parse(process.argv.at(2) ?? 'null'));
const originalFiles = { ...filesystem },
  originalAuthority = { ...authority },
  originalDeletion = { ...deletion },
  originalHttp = { ...http },
  originalJournal = { ...journal },
  originalMaintenance = { ...maintenance },
  originalClock = { ...clock },
  originalInstallation = { ...installation },
  originalRuntime = { ...runtime },
  originalPublication = { ...publication };
const uid = Object.getOwnPropertyDescriptor(process, 'getuid'),
  gid = Object.getOwnPropertyDescriptor(process, 'getgid'),
  kill = Object.getOwnPropertyDescriptor(process, 'kill');
if (uid === undefined || gid === undefined || kill === undefined)
  throw new Error('Missing native owner identity descriptors');
const nativeNow = Date.now;
const nativeSpawn = Bun.spawn,
  nativeSpawnSync = Bun.spawnSync,
  nativeKill = process.kill.bind(process),
  nativeLog = console.log,
  nativeError = console.error;
const events: string[] = [],
  output: string[] = [],
  errors: string[] = [],
  received: unknown[] = [];
let selectedPublication: 'expired' | 'protected' | null = null,
  observerFinishes = 0,
  journalReads = 0;
const installed = { registryId: 'owned-reporting-registry' },
  ports: { now?: () => string } = {},
  backup = {},
  configured = { backup };
const primary: unknown =
  request.fault === 'aggregate'
    ? new AggregateError([new Error('Missing child manifest revision')], 'PRIVATE nested')
    : request.fault === 'undefined'
      ? undefined
      : request.fault === 'null'
        ? null
        : request.fault === 'opaque'
          ? { message: 'Missing child manifest revision' }
          : new Error(
              request.fault === 'unrelated'
                ? 'PRIVATE unrelated'
                : 'Missing child manifest revision',
            );
const reporter = new Error('fixed category reporter'),
  observer = new Error('fixed HTTP observer'),
  httpReporter = new Error('fixed HTTP reporter'),
  writer = new Error('fixed output reporter');
const isProtected = request.family === 'publication' && request.kind === 'protected';
const receipt = originalDeletion.RegistryDeletionPublication.assert({
  kind: isProtected ? 'protected' : 'expired',
  operationId: 'owned-publication',
  repository: isProtected ? 'retained/index' : 'retained/expired',
  root: 'sha256:' + 'a'.repeat(64),
  manifests: (isProtected ? ['a', 'c', 'd'] : ['a']).map((letter) => 'sha256:' + letter.repeat(64)),
  blobs: (isProtected ? ['b', 'e', 'f', '0'] : ['b', 'e', 'f']).map(
    (letter) => 'sha256:' + letter.repeat(64),
  ),
});
let releaseConfirmation: (() => void) | undefined;
const confirmation = new Promise<void>((resolve) => {
  releaseConfirmation = resolve;
});
let settledBeforeConfirmation: boolean | null = null,
  publishedBeforeConfirmation: boolean | null = null;
const refuseEffect = () => {
  throw new Error('Unexpected native deletion owner effect');
};
let observed: typeof RegistryDeletionOwnerObservation.infer | undefined;
await completeRegistryFixture(async () => {
  await mock.module('node:fs/promises', () => ({
    ...originalFiles,
    readFile: refuseEffect,
    writeFile: refuseEffect,
    appendFile: refuseEffect,
    mkdir: refuseEffect,
    readdir: refuseEffect,
    rename: refuseEffect,
  }));
  await mock.module('./registry-maintenance-installation', () => ({
    ...originalInstallation,
    readRegistryMaintenanceInstallation: () =>
      invokeRegistryCallback(() => {
        events.push('installation');
        return installed;
      }),
  }));
  await mock.module('./registry-authority-host', () => ({
    ...originalAuthority,
    createRegistryAuthorityPorts: () => {
      events.push('ports');
      return ports;
    },
  }));
  await mock.module('./registry-maintenance-clock.fixture', () => ({
    ...originalClock,
    readRegistryFixtureRetirementClock: () =>
      invokeRegistryCallback(() => {
        events.push('clock');
        return '2026-11-08T00:00:00.000Z';
      }),
  }));
  await mock.module('./registry-maintenance-runtime', () => ({
    ...originalRuntime,
    createRegistryMaintenanceRuntime: () => {
      events.push('runtime');
      return configured;
    },
  }));
  await mock.module('./registry-journal', () => ({
    ...originalJournal,
    executeRegistryCommand: (directory: string, command: unknown, actualPorts: unknown) =>
      invokeRegistryCallback(() => {
        if (request.family === 'population') {
          if (
            directory !== '/var/lib/puni-registry/journal/contents' ||
            JSON.stringify(command) !== '{"command":"check-capacity"}' ||
            actualPorts !== ports
          )
            throw new Error('Unexpected population confirmation boundary');
          events.push('confirmation');
          received.push({ directory, command, hasPorts: actualPorts === ports });
          if (['confirmation', 'confirmation-observation'].includes(request.fault)) throw primary;
          if (request.fault === 'delayed-confirmation')
            return confirmation.then(() => ({ state: { fenced: true } }));
          return { state: { fenced: true } };
        }
        if (
          directory !== '/var/lib/puni-registry/journal/contents' ||
          JSON.stringify(command) !== '{"command":"read"}' ||
          actualPorts !== ports
        )
          throw new Error('Unexpected native owner journal command');
        events.push('journal-read');
        journalReads++;
        return {
          state:
            journalReads === 1
              ? { maintenance: null }
              : {
                  schemaVersion: 4,
                  maintenance: null,
                  lastVerifiedBackup: { snapshotId: 'verified' },
                  fenced: true,
                },
        };
      }),
  }));
  await mock.module('./registry-maintenance', () => ({
    ...originalMaintenance,
    maintainRegistry: (input: Parameters<typeof maintenance.maintainRegistry>[0]) =>
      invokeRegistryCallback(() => {
        events.push('maintenance');
        received.push({
          directory: input.directory,
          operationId: input.operationId,
          owner: input.owner,
          kind: input.kind,
          recover: input.recover,
          hasPorts: input.ports === ports,
          hasRuntime: Object.is(input.runtime, configured),
          hasBackup: input.backup === backup,
          clock: ports.now?.(),
        });
        if (!['success', 'success-observation', 'success-report'].includes(request.fault))
          throw primary;
      }),
  }));
  await mock.module('./registry-deletion.fixture', () => ({
    ...originalDeletion,
    publishRegistryDeletionFixture: (
      kind: 'expired' | 'protected',
      actualInstalled: unknown,
      actualPorts: unknown,
    ) =>
      invokeRegistryCallback(() => {
        if (actualInstalled !== installed || actualPorts !== ports)
          throw new Error('Publication ownership ports changed');
        events.push('publication');
        selectedPublication = kind;
        if (request.fault === 'publication' || request.fault === 'both') throw primary;
        return receipt;
      }),
  }));
  await mock.module('./registry-maintenance-publication.fixture', () => ({
    ...originalPublication,
    populateRegistryHostFixture: (actualInstalled: unknown, actualPorts: unknown) =>
      invokeRegistryCallback(() => {
        if (
          request.family !== 'population' ||
          actualInstalled !== installed ||
          actualPorts !== ports
        )
          throw new Error('Unexpected population ownership boundary');
        events.push('publication');
        if (['publication', 'both'].includes(request.fault)) throw primary;
        return { published: true };
      }),
  }));
  await mock.module('./registry-http-observation.fixture', () => ({
    ...originalHttp,
    startRegistryHttpObservation: () => {
      events.push('observer-start');
      return {
        finish: () => {
          events.push('observer-finish');
          observerFinishes++;
          if (
            [
              'observation',
              'both',
              'success-observation',
              'reporter-observation',
              'output-observation',
              'confirmation-observation',
            ].includes(request.fault)
          )
            throw observer;
          return { pending: 0, events: [], truncated: false };
        },
      };
    },
  }));
  Object.defineProperty(process, 'getuid', {
    ...uid,
    value: () => (request.fault === 'caller-uid' ? 0 : 59001),
  });
  Object.defineProperty(process, 'getgid', {
    ...gid,
    value: () => (request.fault === 'caller-gid' ? 0 : 59001),
  });
  Bun.spawn = new Proxy(nativeSpawn, { apply: refuseEffect });
  Bun.spawnSync = new Proxy(nativeSpawnSync, { apply: refuseEffect });
  process.kill = new Proxy(nativeKill, { apply: refuseEffect });
  console.log = (line: string) => {
    events.push('output');
    if (['output', 'output-observation'].includes(request.fault)) throw writer;
    output.push(line);
  };
  console.error = (line: string) => {
    if (line.startsWith('task8-deletion-retained:')) {
      events.push('category-report');
      if (['reporter', 'both-reporters', 'reporter-observation'].includes(request.fault))
        throw reporter;
    } else if (line.startsWith('task8-population-http:')) {
      events.push('http-report');
      if (['both-reporters', 'success-report'].includes(request.fault)) throw httpReporter;
    } else throw new Error('Unexpected native owner diagnostic');
    errors.push(line);
  };
  Date.now = () => Date.parse('2026-10-31T00:00:00.000Z');
  const { owner } = await import('./registry-maintenance-host.native');
  let completion: { state: 'fulfilled' } | { state: 'rejected'; cause: unknown };
  try {
    let settled = false;
    const pending = owner(
      request.family === 'maintenance'
        ? 'deletion-retire'
        : request.family === 'population'
          ? 'populate'
          : 'deletion-publish-' + request.kind,
    ).finally(() => {
      settled = true;
    });
    if (request.family === 'population' && request.fault === 'delayed-confirmation') {
      await Bun.sleep(20);
      settledBeforeConfirmation = settled;
      publishedBeforeConfirmation = output.length !== 0;
      if (releaseConfirmation === undefined) throw new Error('Missing held confirmation release');
      releaseConfirmation();
    }
    await pending;
    completion = { state: 'fulfilled' };
  } catch (cause) {
    completion = { state: 'rejected', cause };
  }
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  const members: unknown[] =
    completion.state === 'fulfilled'
      ? []
      : cause instanceof AggregateError && cause !== primary
        ? cause.errors
        : [cause];
  const label = (cause: unknown) =>
    cause === primary
      ? 'primary'
      : cause === reporter
        ? 'category-reporter'
        : cause === observer
          ? 'observation'
          : cause === httpReporter
            ? 'http-reporter'
            : cause === writer
              ? 'output'
              : 'other';
  observed = RegistryDeletionOwnerObservation.assert({
    state: completion.state,
    message: cause instanceof Error ? cause.message : null,
    isAggregateError: cause instanceof AggregateError,
    isExactPrimary: completion.state === 'rejected' && cause === primary,
    hasPrimaryCause: cause instanceof AggregateError && cause.cause === primary,
    hasObserverCause: cause instanceof AggregateError && cause.cause === observer,
    hasOutputCause: cause instanceof AggregateError && cause.cause === writer,
    members: members.map(label),
    events,
    output,
    errors,
    received,
    selectedPublication,
    observerFinishes,
    settledBeforeConfirmation,
    publishedBeforeConfirmation,
  });
}, [
  async () => {
    Date.now = nativeNow;
    Object.defineProperty(process, 'getuid', uid);
    Object.defineProperty(process, 'getgid', gid);
    Bun.spawn = nativeSpawn;
    Bun.spawnSync = nativeSpawnSync;
    Object.defineProperty(process, 'kill', kill);
    console.log = nativeLog;
    console.error = nativeError;
    await mock.module('node:fs/promises', () => originalFiles);
    await mock.module('./registry-maintenance-installation', () => originalInstallation);
    await mock.module('./registry-authority-host', () => originalAuthority);
    await mock.module('./registry-maintenance-clock.fixture', () => originalClock);
    await mock.module('./registry-maintenance-runtime', () => originalRuntime);
    await mock.module('./registry-journal', () => originalJournal);
    await mock.module('./registry-maintenance', () => originalMaintenance);
    await mock.module('./registry-deletion.fixture', () => originalDeletion);
    await mock.module('./registry-http-observation.fixture', () => originalHttp);
    await mock.module('./registry-maintenance-publication.fixture', () => originalPublication);
  },
]);
console.log(JSON.stringify(RegistryDeletionOwnerObservation.assert(observed)));
