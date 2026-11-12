import * as vm from 'node:vm';

import { captureCompilerDerivative } from '@twilight-burokrat/judge';
import { afterEach, expect, spyOn, test } from 'bun:test';

import type { Monotonic } from '../clock';
import { createLimits, createMembers } from './review-compiler-fixture.test-support';
import { withCompilerDerivative } from './review-compiler-runtime';

function clock(samples: readonly (number | Error | undefined)[]): Monotonic {
  let index = 0;
  return {
    now() {
      const sample = samples[index++];
      if (sample === undefined) throw new Error('clock samples exhausted');
      if (sample instanceof Error) throw sample;
      return sample;
    },
  };
}
function artifact(allowance = 1000) {
  return captureCompilerDerivative(createMembers(), {
    ...createLimits(),
    maximumLoadMilliseconds: allowance,
  });
}
const restorations: (() => void)[] = [];
afterEach(() => {
  for (const restore of restorations.splice(0).reverse()) restore();
  Bun.gc(true);
});
function observeScripts() {
  const timeouts: (number | undefined)[] = [];
  const original: unknown = Reflect.get(vm.Script.prototype, 'runInContext');
  if (typeof original !== 'function') throw new Error('Script runner absent');
  const observation = spyOn(vm.Script.prototype, 'runInContext').mockImplementation(function (
    this: vm.Script,
    context: vm.Context,
    options?: vm.RunningScriptOptions,
  ) {
    timeouts.push(options?.timeout);
    const completion: unknown = Reflect.apply(original, this, [context, options]);
    return completion;
  });
  restorations.push(() => {
    observation.mockRestore();
  });
  return timeouts;
}

for (const timing of [undefined, null, {}, { now: 3 }]) {
  test(`missing or noncallable timing rejects before decoding: ${JSON.stringify(timing)}`, () => {
    const owned = artifact();
    let calls = 0;
    expect(() => {
      withCompilerDerivative(owned, timing as unknown as Monotonic, () => {
        calls++;
      });
    }).toThrow('compiler derivative monotonic required');
    expect(calls).toBe(0);
  });
}
for (const value of [NaN, Infinity, -Infinity]) {
  test(`nonfinite start ${String(value)} refuses before context allocation`, () => {
    const owned = artifact();
    const original = vm.createContext;
    let contexts = 0;
    const observation = spyOn(vm, 'createContext').mockImplementation(
      (...parameters: Parameters<typeof vm.createContext>) => {
        contexts++;
        return original(...parameters);
      },
    );
    restorations.push(() => {
      observation.mockRestore();
    });
    let failure: unknown;
    try {
      withCompilerDerivative(owned, clock([value, 0, 0, 0, 0]), () => undefined);
    } catch (cause) {
      failure = cause;
    }
    expect(contexts).toBe(0);
    expect(String(failure)).toContain('compiler derivative monotonic start nonfinite');
  });
  test(`nonfinite later sample ${String(value)} has a precise temporal boundary refusal`, () => {
    const owned = artifact();
    expect(() => {
      withCompilerDerivative(owned, clock([0, value]), () => undefined);
    }).toThrow('compiler derivative monotonic sample nonfinite');
  });
}

test('backwards monotonic movement cannot reach the consumer', () => {
  const owned = artifact();
  let calls = 0;
  let failure: unknown;
  try {
    withCompilerDerivative(owned, clock([10, 9, 10, 10, 10]), () => {
      calls++;
    });
  } catch (cause) {
    failure = cause;
  }
  expect(calls).toBe(0);
  expect(String(failure)).toContain('compiler derivative monotonic moved backwards');
});
test('finite endpoints with elapsed overflow have a precise temporal boundary refusal', () => {
  const owned = artifact();
  expect(() => {
    withCompilerDerivative(owned, clock([-Number.MAX_VALUE, Number.MAX_VALUE]), () => undefined);
  }).toThrow('compiler derivative monotonic elapsed nonfinite');
});
test('timing method is captured once with its actual receiver', () => {
  const owned = artifact();
  let getters = 0;
  let samples = 0;
  const timing = {
    marker: 'actual receiver',
    get now() {
      getters++;
      if (getters !== 1) throw new Error('timing method reread');
      return function (this: { marker: string }) {
        if (this.marker !== 'actual receiver') throw new Error('timing receiver differs');
        samples++;
        return 0;
      };
    },
  };
  let calls = 0;
  withCompilerDerivative(owned, timing, () => {
    calls++;
  });
  expect(getters).toBe(1);
  expect(samples).toBe(5);
  expect(calls).toBe(1);
});

test('fractional finite and equal samples produce positive integer phase timeouts', () => {
  const timeouts = observeScripts();
  let calls = 0;
  withCompilerDerivative(artifact(1000), clock([0.25, 0.75, 1.25, 1.25, 1.25]), () => {
    calls++;
  });
  expect(timeouts).toEqual([999, 999, 999]);
  expect(calls).toBe(1);
});
test('huge captured allowance clamps every actual Script timeout', () => {
  const timeouts = observeScripts();
  withCompilerDerivative(artifact(2147483648), clock([0, 0, 0, 0, 0]), () => undefined);
  expect(timeouts).toEqual([2147483647, 2147483647, 2147483647]);
});

for (const phase of [1, 2, 3] as const) {
  test(`aggregate deadline refuses before actual Script phase ${String(phase)}`, () => {
    const timeouts = observeScripts();
    const samples = [0, 0, 0, 0, 0];
    samples[phase] = 1000;
    // Later samples stay expired so a skipped target check cannot create backwards noise.
    for (let index = phase + 1; index < samples.length; index++) samples[index] = 1000;
    let failure: unknown;
    let calls = 0;
    try {
      withCompilerDerivative(artifact(1000), clock(samples), () => {
        calls++;
      });
    } catch (cause) {
      failure = cause;
    }
    // Observe forbidden actual phase admission before inspecting subsequent error wording.
    expect(timeouts).toHaveLength(phase - 1);
    expect(calls).toBe(0);
    expect(String(failure)).toContain('compiler derivative load timeout exceeded');
  });
}
test('one diminishing allowance spans all phases and the final compatibility check', () => {
  const timeouts = observeScripts();
  let failure: unknown;
  let calls = 0;
  try {
    withCompilerDerivative(artifact(1000), clock([0, 300, 600, 900, 1000]), () => {
      calls++;
    });
  } catch (cause) {
    failure = cause;
  }
  expect(calls).toBe(0);
  expect(timeouts).toEqual([700, 400, 100]);
  expect(String(failure)).toContain('compiler derivative load timeout exceeded');
});
for (const samples of [
  [new Error('start clock threw')],
  [0, new Error('allocated clock threw')],
  [0, 0, 0, 0, new Error('final clock threw')],
]) {
  test(`thrown timing dependency propagates: ${String(samples.at(-1))}`, () => {
    const failure = samples.at(-1);
    expect(() => {
      withCompilerDerivative(artifact(), clock(samples), () => undefined);
    }).toThrow(failure);
  });
}

test('request-shaped extra timing cannot replace separately required timing authority', () => {
  const owned = artifact();
  const timing = clock([0, 0, 0, 0, 0]);
  const hostile = Object.assign(() => undefined, { monotonic: clock([NaN]) });
  expect(() => {
    withCompilerDerivative(owned, timing, hostile);
  }).not.toThrow();
});

test('the original start precedes actual decode under controlled monotonic progression', () => {
  const owned = artifact(1000);
  let milliseconds = 0;
  const timing = { now: () => milliseconds };
  const Decoder = globalThis.TextDecoder;
  globalThis.TextDecoder = new Proxy(Decoder, {
    construct(target, parameters) {
      const decoder = Reflect.construct(target, parameters) as TextDecoder;
      const decode = decoder.decode.bind(decoder);
      decoder.decode = (...input: Parameters<TextDecoder['decode']>) => {
        milliseconds = 1500;
        return decode(...input);
      };
      return decoder;
    },
  });
  let calls = 0;
  try {
    let failure: unknown;
    try {
      withCompilerDerivative(owned, timing, () => {
        calls++;
      });
    } catch (cause) {
      failure = cause;
    }
    expect(calls).toBe(0);
    expect(String(failure)).toContain('compiler derivative load timeout exceeded');
  } finally {
    globalThis.TextDecoder = Decoder;
  }
});

test('a throwing timing getter propagates before decode', () => {
  const owned = artifact();
  const failure = new Error('timing getter threw');
  const timing = {
    get now(): () => number {
      throw failure;
    },
  };
  expect(() => {
    withCompilerDerivative(owned, timing, () => undefined);
  }).toThrow(failure);
});
