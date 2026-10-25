import { parseArgs } from 'node:util';

import { readCheckpoint, writeCheckpoint } from './checkpoint';
import { createOtlpPublisher } from './otlp';
import { collectProbe, runProbe } from './probe';
import { createHttpHealthReader, createSshHealthReader } from './source';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    local: { type: 'string' },
    otlp: { type: 'string' },
    version: { type: 'string' },
    checkpoint: { type: 'string' },
    initialize: { type: 'boolean' },
    once: { type: 'boolean' },
    'expected-revision': { type: 'string' },
  },
  strict: true,
  allowPositionals: false,
});
if (values.otlp === undefined || values.version === undefined || values.checkpoint === undefined)
  throw new Error(
    'Required: --otlp http://127.0.0.1:<tunnel-port> --version <producer-version> --checkpoint <path>; first start also --initialize',
  );
const checkpointPath = values.checkpoint;
const previous = readCheckpoint(checkpointPath, values.initialize === true);
const controller = new AbortController();
const stop = () => {
  controller.abort();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
const options = {
  readHealth:
    values.local === undefined ? createSshHealthReader() : createHttpHealthReader(values.local),
  publication: createOtlpPublisher(
    values.otlp,
    previous?.publication.state === 'acknowledged' ? previous.revision : null,
  ),
  producerVersion: values.version,
  expectedRevision: values['expected-revision'],
  signal: controller.signal,
};
try {
  const onCompleted = (observation: Awaited<ReturnType<typeof collectProbe>>) => {
    writeCheckpoint(checkpointPath, observation);
    console.log(JSON.stringify(observation));
    return Promise.resolve();
  };
  if (values.once === true) {
    const observation = await collectProbe(options);
    await onCompleted(observation);
    if (!observation.success || observation.publication.state !== 'acknowledged')
      process.exitCode = 1;
  } else await runProbe({ ...options, previous, onCompleted });
} finally {
  process.off('SIGTERM', stop);
  process.off('SIGINT', stop);
}
