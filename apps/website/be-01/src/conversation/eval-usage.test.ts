import { expect, test } from 'bun:test';

import { meterUsage } from './eval-usage';

const rates = { input: 0.11, output: 0.55, inputCeiling: 0.275, outputCeiling: 0.825 };
const request = { body: JSON.stringify({ max_completion_tokens: 700, messages: [] }) };
function response(usage: unknown) {
  return new Response(
    [usage, usage]
      .map((counts) => 'data: ' + JSON.stringify({ usage: counts, choices: [] }) + '\n\n')
      .join('') + 'data: [DONE]\n\n',
  );
}
test('evaluation accounts reported surcharge once and refuses the next unaffordable call', async () => {
  let calls = 0;
  const meter = meterUsage(
    () => {
      calls += 1;
      return response({
        prompt_tokens: 100,
        completion_tokens: 20,
        cost: 0.004,
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 100 },
      });
    },
    rates,
    4500,
  );
  await (await meter.providerFetch('https://fixture.invalid', request)).text();
  await meter.settle();
  expect(meter.operations[0]).toMatchObject({
    ratedMicroUsd: 22,
    knownMicroUsd: 4000,
    reportedCostUsd: 0.004,
    cacheReadTokens: 0,
    cacheWriteTokens: 100,
  });
  const failure = await Promise.resolve(
    meter.providerFetch('https://fixture.invalid', request),
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain('spend bound');
  expect(calls).toBe(1);
});
for (const cost of [undefined, -1, Number.MAX_SAFE_INTEGER])
  test(`evaluation reserves unknown charge ${String(cost)} at effective ceilings`, async () => {
    const meter = meterUsage(
      () => response({ prompt_tokens: 100, completion_tokens: 20, cost }),
      rates,
    );
    await (await meter.providerFetch('https://fixture.invalid', request)).text();
    await meter.settle();
    expect(meter.operations[0]?.unknownReservedMicroUsd).toBeGreaterThan(1100);
    expect(meter.operations[0]?.knownMicroUsd).toBe(0);
  });

test('evaluation unsafe reservation refuses before transport', async () => {
  let calls = 0;
  const meter = meterUsage(
    () => {
      calls += 1;
      return response({});
    },
    { ...rates, inputCeiling: Number.MAX_SAFE_INTEGER },
  );
  const failure = await Promise.resolve(
    meter.providerFetch('https://fixture.invalid', request),
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain('safe micro-USD');
  expect(calls).toBe(0);
});

test('evaluation invalid optional counters stay unknown without hiding the known charge', async () => {
  const meter = meterUsage(
    () =>
      response({
        prompt_tokens: 100,
        completion_tokens: 20,
        cost: 0.004,
        prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 60 },
        completion_tokens_details: { reasoning_tokens: 21 },
      }),
    rates,
  );
  await (await meter.providerFetch('https://fixture.invalid', request)).text();
  await meter.settle();
  expect(meter.operations[0]).toMatchObject({
    knownMicroUsd: 4000,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    reasoningTokens: null,
  });
});
