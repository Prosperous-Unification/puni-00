import { invokeRegistryCallback } from './registry-callback';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import { createRegistryPermitHttpProbe } from './registry-permit-http.fixture';
import {
  RegistryPermitHttpOutcome,
  RegistryPermitHttpRequest,
} from './registry-permit-http-observation.fixture';

const request = RegistryPermitHttpRequest.assert(JSON.parse(process.argv.at(2) ?? 'null'));
const nativeFetch = globalThis.fetch,
  nativeNow = Date.now,
  nativeSleep = Bun.sleep,
  nativeSpawn = Bun.spawn,
  nativeSpawnSync = Bun.spawnSync;
const deadline = new AbortController(),
  cancellation = new Error('owned cancellation');
const failure: unknown =
  request.scenario === 'non-error' ? { code: 'ECONNRESET' } : new Error('unknown transport');
const categories: string[] = [],
  requests: unknown[] = [];
let calls = 0,
  elapsed = 0,
  savedUploads: number | null = null;
const probe = createRegistryPermitHttpProbe(deadline.signal);
const reset = () => Object.assign(new TypeError('owned socket closed'), { code: 'ECONNRESET' });
const response = (status: number, uuid?: string) =>
  new Response('', { status, headers: uuid === undefined ? {} : { 'docker-upload-uuid': uuid } });
const valid = '11111111-1111-4111-8111-111111111111';
const refuseEffect = () => {
  throw new Error('Unexpected native permit HTTP effect');
};
let observed: typeof RegistryPermitHttpOutcome.infer | undefined;
await completeRegistryFixture(async () => {
  Date.now = () => elapsed;
  Bun.sleep = new Proxy(nativeSleep, {
    apply(_sleep, _receiver, args: unknown[]) {
      return invokeRegistryCallback(() => {
        const milliseconds = args[0];
        if (milliseconds !== 50 && milliseconds !== 100)
          throw new Error('Unexpected HTTP retry delay');
        categories.push(probe.readObservation().lastHttp);
        elapsed += milliseconds;
      });
    },
  });
  Bun.spawn = new Proxy(nativeSpawn, { apply: refuseEffect });
  Bun.spawnSync = new Proxy(nativeSpawnSync, { apply: refuseEffect });
  globalThis.fetch = new Proxy(nativeFetch, {
    apply(_fetch, _receiver, args: unknown[]) {
      return invokeRegistryCallback(() => {
        const options = args[1];
        if (
          args[0] !== 'http://127.0.0.1:5052/v2/guard-proof/blobs/uploads/' ||
          typeof options !== 'object' ||
          options === null ||
          Reflect.get(options, 'method') !== 'POST'
        )
          throw new Error('Unexpected native HTTP request');
        const signal: unknown = Reflect.get(options, 'signal');
        if (!(signal instanceof AbortSignal)) throw new Error('Missing actual HTTP abort signal');
        requests.push({ url: args[0], method: 'POST', aborted: signal.aborted });
        calls++;
        if (request.scenario === 'reset') {
          if (calls === 1) throw reset();
          return calls === 2 ? response(202, valid) : response(405);
        }
        if (request.scenario === 'resets') {
          if (calls > 120) throw new Error('test rescue after missing convergence bound');
          throw reset();
        }
        if (request.scenario === 'unknown' || request.scenario === 'non-error') throw failure;
        if (request.scenario === 'cancellation') {
          deadline.abort(cancellation);
          throw reset();
        }
        if (request.scenario === 'unexpected') return response(500);
        if (request.scenario === 'refused' || request.scenario === 'timeout') {
          if (calls === 1)
            throw request.scenario === 'refused'
              ? Object.assign(new TypeError('fixed refusal'), { code: 'ECONNREFUSED' })
              : Object.assign(new Error('fixed timeout'), { name: 'TimeoutError' });
          return response(405);
        }
        if (request.scenario === 'uuid-missing' || request.scenario === 'uuid-invalid')
          return calls === 1
            ? response(202, request.scenario === 'uuid-invalid' ? 'z'.repeat(36) : undefined)
            : response(405);
        if (request.scenario === 'oversized')
          return new Response('x'.repeat(4097), { status: 405 });
        if (request.scenario === 'body-error')
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.error(failure);
              },
            }),
            { status: 405 },
          );
        if (request.scenario === 'cap') return response(202, valid);
        if (request.scenario === 'writable') return response(202, valid);
        throw new Error('Pre-cancel scenario unexpectedly reached fetch');
      });
    },
  });
  let completion: { state: 'fulfilled' } | { state: 'rejected'; cause: unknown };
  try {
    if (request.scenario === 'pre-cancel') deadline.abort(cancellation);
    if (request.scenario === 'cap') {
      for (let count = 0; count < 256; count++) await probe.awaitStatus(202);
      const saved = probe.readObservation();
      Reflect.set(saved, 'uploads', 0);
      savedUploads = saved.uploads;
      await probe.awaitStatus(202);
    } else await probe.awaitStatus(request.scenario === 'writable' ? 202 : 405);
    completion = { state: 'fulfilled' };
  } catch (cause) {
    completion = { state: 'rejected', cause };
  }
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  const members: unknown[] = cause instanceof AggregateError ? cause.errors : [];
  observed = RegistryPermitHttpOutcome.assert({
    state: completion.state,
    message: cause instanceof Error ? cause.message : null,
    isOriginalFailure: completion.state === 'rejected' && cause === failure,
    isAggregateError: cause instanceof AggregateError,
    originalMembers: members.filter((member) => member === failure).length,
    hasOriginalCause: cause instanceof Error && cause.cause === failure,
    isCancellation: completion.state === 'rejected' && cause === cancellation,
    calls,
    elapsed,
    categories,
    requests,
    ...probe.readObservation(),
    savedUploads,
  });
}, [
  () =>
    invokeRegistryCallback(() => {
      globalThis.fetch = nativeFetch;
      Date.now = nativeNow;
      Bun.sleep = nativeSleep;
      Bun.spawn = nativeSpawn;
      Bun.spawnSync = nativeSpawnSync;
    }),
]);
console.log(JSON.stringify(RegistryPermitHttpOutcome.assert(observed)));
