import { join } from 'node:path';

import { expect, test } from 'bun:test';
import { parseDocument, stringify } from 'yaml';

import { createObservabilityComposition } from './observability-composition';
import { assertRetainedReaderConfiguration } from './observability-reader';
const root = join(import.meta.dir, '../../..');
const request = {
  placement: 'production',
  instances: [
    { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
    { environment: 'prod', namespace: 'observability', policy: 'retained-production' },
  ],
};
async function configuration() {
  const assembly = await createObservabilityComposition(root, request);
  return stringify(
    parseDocument(assembly.retainedReader.desiredManifest).getIn(
      ['spec', 'values', 'alternateConfig'],
      true,
    ),
  );
}
test('retained reader desired contract excludes dev paths and absent-environment dev records without dropping shared diagnostics', async () => {
  expect(assertRetainedReaderConfiguration(await configuration())).toEqual({
    pathExcluded: true,
    namespaceRejected: true,
    effectiveReaderVerified: false,
  });
});
test.each([
  'path',
  'namespace',
  'pipeline',
  'bypass',
  'diagnostics',
  'parse',
  'filter-mode',
  'yaml',
])('retained reader production source validator refuses independent %s fault', async (fault) => {
  const assembly = await createObservabilityComposition(root, request);
  const document = parseDocument(assembly.retainedReader.desiredManifest);
  const base = ['spec', 'values', 'alternateConfig'];
  if (fault === 'path')
    document.setIn(
      [...base, 'receivers', 'filelog', 'exclude'],
      ['/var/log/pods/observability_otel-collector-*/*/*.log'],
    );
  if (fault === 'namespace')
    document.setIn(
      [...base, 'processors', 'filter/platform-only', 'logs', 'log_record'],
      ['resource.attributes["deployment.environment.name"] != nil'],
    );
  if (fault === 'pipeline')
    document.setIn(
      [...base, 'service', 'pipelines', 'logs', 'processors'],
      ['memory_limiter', 'transform/redact', 'resource/stream', 'batch'],
    );
  if (fault === 'bypass')
    document.setIn([...base, 'service', 'pipelines', 'logs/forwarding'], {
      receivers: ['otlp/mtls'],
      processors: ['batch'],
      exporters: ['elasticsearch'],
    });
  if (fault === 'filter-mode')
    document.setIn([...base, 'processors', 'filter/platform-only', 'error_mode'], 'ignore');
  if (fault === 'diagnostics')
    document.setIn(
      [...base, 'receivers', 'filelog', 'include'],
      ['/var/log/pods/observability_*/*/*.log'],
    );
  const config = stringify(document.getIn(base, true));
  expect(() =>
    assertRetainedReaderConfiguration(
      fault === 'parse'
        ? 'PRIVATE invalid source'
        : fault === 'yaml'
          ? config + 'extensions: {}\nextensions: {}\n'
          : config,
    ),
  ).toThrow(/Retained reader configuration/);
});

test('retained reader accepts pinned chart file_log rewrite and refuses both receiver identities', async () => {
  const source = await configuration();
  expect(
    assertRetainedReaderConfiguration(source.replaceAll('filelog', 'file_log')).pathExcluded,
  ).toBe(true);
  const document = parseDocument(source);
  document.setIn(['receivers', 'file_log'], document.getIn(['receivers', 'filelog'], true));
  expect(() => assertRetainedReaderConfiguration(document.toString())).toThrow(/receiver/);
});
