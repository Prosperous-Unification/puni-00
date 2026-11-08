import type { S3ClientConfig } from '@aws-sdk/client-s3';
import * as sdk from '@aws-sdk/client-s3';
import { mock } from 'bun:test';

import { createWire, scope, uploads, versioning, versions } from './registry-s3-census.fixture';

const mode = process.argv[2];
class FaultClient extends sdk.S3Client {
  constructor(configuration: S3ClientConfig) {
    if (mode === 'constructor') throw new Error('fixture-secret constructor');
    super(configuration);
  }
  override destroy(): void {
    super.destroy();
    throw new Error('fixture-secret destructor');
  }
}
if (mode !== 'ambient')
  await mock.module('@aws-sdk/client-s3', () => ({ ...sdk, S3Client: FaultClient }));
else {
  Object.assign(process.env, {
    AWS_USE_FIPS_ENDPOINT: 'true',
    AWS_USE_DUALSTACK_ENDPOINT: 'true',
    AWS_AUTH_SCHEME_PREFERENCE: 'sigv4a',
    AWS_SDK_UA_APP_ID: 'fixture-poison-app',
    AWS_REGION: 'wrong-region',
    AWS_DEFAULTS_MODE: 'auto',
    AWS_CONFIG_FILE: '/tmp/registry-s3-absent-fixture-config',
    AWS_SHARED_CREDENTIALS_FILE: '/tmp/registry-s3-absent-fixture-credentials',
  });
}
const { createRegistryS3Store, RegistryS3Error } = await import('./registry-s3-census');
const wire = createWire([versioning, mode === 'both' ? '<Unexpected/>' : versions(), uploads()]);
let failure: unknown;
try {
  const census = await createRegistryS3Store({
    ...scope,
    signal: new AbortController().signal,
    fetch: wire.fetch,
  }).census();
  if (mode === 'ambient')
    console.log(
      JSON.stringify({
        codes: [],
        payloadBytes: census.payloadBytes,
        ambientAgent: wire.requests.some((request) =>
          (request.headers.get('user-agent') ?? '').includes('fixture-poison-app'),
        ),
      }),
    );
} catch (cause) {
  failure = cause;
}
if (failure instanceof AggregateError) {
  console.log(
    JSON.stringify({
      name: failure.name,
      message: failure.message,
      codes: failure.errors.map((cause: unknown) =>
        cause instanceof RegistryS3Error ? cause.code : 'unexpected',
      ),
      primary: failure.cause instanceof RegistryS3Error ? failure.cause.code : 'unexpected',
    }),
  );
} else if (failure instanceof RegistryS3Error) {
  console.log(
    JSON.stringify({ name: failure.name, message: failure.message, codes: [failure.code] }),
  );
} else if (mode !== 'ambient') {
  throw new Error('S3 failure was not modeled');
}
