import * as filesystem from 'node:fs/promises';
import { join } from 'node:path';

import { mock } from 'bun:test';

import * as authority from './registry-index-authority.fixture';
import { proveRegistryIndexHost } from './registry-maintenance-index.native';

const mode = process.argv.at(2);
const allowed = new Set([
  'advance',
  'error',
  'aggregate',
  'undefined',
  'null',
  'string',
  'close',
  'trace',
  'primary+close',
  'primary+trace',
  'close+report',
  'primary+close+report',
  'primary+trace+report',
  'valid-report',
  'primary+valid-report',
  'valid+invalid-report',
  'primary+outer-report',
  'close+outer-report',
]);
if (mode === undefined || !allowed.has(mode))
  throw new Error('Unknown isolated index completion case');
const original = { ...filesystem };
const directory = await original.mkdtemp('/tmp/task8-index-completion-');
const guard = await original.open(join(directory, 'guard'), 'wx', 0o600);
const primary: unknown =
  mode === 'undefined'
    ? undefined
    : mode === 'null'
      ? null
      : mode === 'string'
        ? 'private operation'
        : mode === 'aggregate'
          ? new AggregateError([new Error('private child')], 'private aggregate')
          : new Error('private operation');
const closing = new Error('private close');
const reporting = new Error('private invalid report');
const validReporting = new Error('private valid report');
const continuation = new Error('intentional retirement boundary');
const outerReporting = new Error('private lifecycle report');
const operationFails =
  ['error', 'aggregate', 'undefined', 'null', 'string'].includes(mode) ||
  mode.startsWith('primary+');
const closeFails = mode.split('+').includes('close');
const traceFails = mode.split('+').includes('trace');
const invalidReportFails = mode.split('+').includes('report') || mode === 'valid+invalid-report';
const validReportFails = mode.includes('valid-report') || mode === 'valid+invalid-report';
const writes = new Map([
  ['/root/task8-fixture/admission', 'admission'],
  ['/etc/puni/ordinary-writer.json', 'configuration'],
  ['/etc/puni/registry-index-publications.json', 'publications'],
  ['/etc/puni/registry-fixture-retirement-clock.json', 'clock'],
]);
await mock.module('node:fs/promises', () => ({
  ...original,
  async writeFile(
    path: string,
    contents: string,
    options: Parameters<typeof original.writeFile>[2],
  ) {
    const name = writes.get(path);
    if (name === undefined) throw new Error('Index completion attempted an unexpected host write');
    await original.writeFile(join(directory, name), contents, options);
  },
}));
// Boundary: this isolated case models installation/guard ownership and owner responses. The actual index caller, response schemas, guard trace parser, descriptor close and private filesystem effects remain real; no root or native service readiness is claimed.
await mock.module('./registry-maintenance-host.fixture', () => ({
  async prepareRegistryHostFixture() {
    await original.writeFile(join(directory, 'setup'), 'modeled');
    return { installed: { ordinary: { path: directory } } };
  },
}));
await mock.module('./registry-index-authority.fixture', () => ({
  ...authority,
  async prepareRegistryIndexReaders() {
    await original.writeFile(join(directory, 'readers'), 'modeled');
  },
  async refreshRegistryIndexHistory() {
    await original.writeFile(join(directory, 'history'), 'modeled');
  },
}));
await mock.module('./registry-maintenance-guard.fixture', () => ({
  async startRegistryFixtureGuard() {
    await original.writeFile(join(directory, 'guard-started'), 'modeled');
    return {
      async waitMode() {
        await original.writeFile(join(directory, 'writable'), 'modeled');
      },
      async close() {
        await guard.close();
        await original.writeFile(join(directory, 'closed'), 'closed');
        if (closeFails) throw closing;
      },
      readErrors() {
        return traceFails ? '' : 'task8-decision 1 1.00 writable allowed final 1\n';
      },
    };
  },
}));
const log = console.log;
const fetch = globalThis.fetch;
const records: string[] = [];
console.log = (line: unknown) => {
  if (typeof line !== 'string') throw new Error('Unexpected index diagnostic type');
  if (line.includes('"indexFailure":') && mode.endsWith('+outer-report')) throw outerReporting;
  if (line.includes('"guardDecisions":{"valid":false') && invalidReportFails) throw reporting;
  if (line.includes('"guardDecisions":{"valid":true') && validReportFails) throw validReporting;
  records.push(line);
};
// Boundary: the fixture's sole tag-list request receives a synthetic bounded response. It is not an HTTP/server proof.
globalThis.fetch = new Proxy(fetch, {
  apply(_fetch, _receiver, arguments_: unknown[]) {
    if (arguments_.at(0) !== 'http://127.0.0.1:5052/v2/retained/index/tags/list')
      throw new Error('Unexpected index completion request');
    return Promise.resolve(
      new Response(
        JSON.stringify({
          name: 'retained/index',
          tags: ['release-1', 'release-2', 'release-3', 'release-4'],
        }),
        { status: 200 },
      ),
    );
  },
});
let completion: { state: 'returned' } | { state: 'threw'; cause: unknown };
try {
  await proveRegistryIndexHost(
    async (command) => {
      if (command === 'initialize') return { code: 0, stdout: 'initialized', stderr: '' };
      if (command === 'backup') return { code: 0, stdout: 'verified-native-backup', stderr: '' };
      if (command === 'index-reopen') {
        if (operationFails) {
          // Boundary: malformed nullish/primitive rejection is intentional and tests the actual caller's error-preservation contract.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return await Promise.reject(primary);
        }
        return { code: 0, stdout: 'population-writable-permitted', stderr: '' };
      }
      if (/^index-publish-[1-4]$/.test(command)) {
        const revision = Number(command.slice(-1));
        const digest = 'sha256:' + String(revision).repeat(64);
        return {
          code: 0,
          stdout: JSON.stringify({
            revision,
            operationId: 'owned-' + String(revision),
            root: digest,
            manifests: [digest, digest, digest],
            blobs: [digest, digest, digest, digest],
          }),
          stderr:
            'task8-population-http:' +
            JSON.stringify({ events: [], truncated: false, pending: 0 }) +
            '\n',
        };
      }
      if (/^index-promote-[2-4]$/.test(command))
        return { code: 0, stdout: 'index-promoted', stderr: '' };
      if (command === 'retire') {
        await original.writeFile(join(directory, 'advanced'), 'retirement entered');
        throw continuation;
      }
      throw new Error('Unexpected index completion owner command');
    },
    () => Promise.reject(new Error('Isolated completion must stop before retained pulls')),
  );
  completion = { state: 'returned' };
} catch (cause) {
  completion = { state: 'threw', cause };
} finally {
  console.log = log;
  globalThis.fetch = fetch;
}
try {
  const cause = completion.state === 'threw' ? completion.cause : undefined;
  const compound = cause instanceof AggregateError && cause !== primary;
  const members: unknown = compound ? cause.errors : [cause];
  if (!Array.isArray(members)) throw new Error('Unexpected index aggregate members');
  const label = (failure: unknown): string => {
    if (failure === primary) return 'primary';
    if (failure === closing) return 'close';
    if (failure === reporting) return 'invalid-report';
    if (failure === validReporting) return 'valid-report';
    if (failure === continuation) return 'retire';
    if (failure === outerReporting) return 'outer-report';
    if (failure instanceof Error && failure.message === 'Missing guard decisions') return 'trace';
    return 'unexpected';
  };
  const descriptorClosed = guard.fd === -1;
  const closedReceipt = descriptorClosed
    ? await original.readFile(join(directory, 'closed'), 'utf8')
    : null;
  let advanced = false;
  try {
    advanced =
      (await original.readFile(join(directory, 'advanced'), 'utf8')) === 'retirement entered';
  } catch (cause) {
    if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
  }
  const failures: string[] = members.map((failure: unknown) => label(failure));
  const report = {
    rejected: completion.state === 'threw',
    compound,
    failures,
    originalCause: compound && cause.cause === members.at(0),
    singleExact:
      !compound &&
      ['primary', 'close', 'invalid-report', 'valid-report', 'retire', 'outer-report'].includes(
        label(cause),
      ),
    descriptorClosed,
    closedReceipt,
    advanced,
  };
  if (guard.fd !== -1) await guard.close();
  await original.rm(directory, { recursive: true });
  log(JSON.stringify(report));
} catch (cause) {
  if (guard.fd !== -1) await guard.close();
  await original.rm(directory, { recursive: true });
  throw cause;
}
