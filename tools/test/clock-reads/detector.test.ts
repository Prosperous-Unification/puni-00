import { expect, test } from 'bun:test';

import { findClockReads } from './detector';

const pureLines = [
  '// new Date() and Date.now() in a comment are not reads',
  'const parsed = new Date(1_000);',
  'const parsedText = new Date("2026-10-11T00:00:00.000Z");',
  'const parsedMillis = Date.parse("2026-10-11T00:00:00.000Z");',
  'const utc = Date.UTC(2026, 9, 11);',
  'const isDate = value instanceof Date;',
  'let typed: Date | undefined;',
  'const env = process.env["HOME"]; const argv = process.argv; const v = Bun.version;',
  'const policy = { performance: 1 }; const threshold = policy.performance === 1;',
  "import { tmpdir } from 'node:os';",
  "const lazy = await import('./review/exhaustive-coverage');",
];

const clockLines = [
  'const a = Date.now();',
  'const b = new Date();',
  'const c = new Date;',
  'const d = Date();',
  'const e = Date.now?.();',
  'const { now } = Date;',
  'const C = Date;',
  'const f = Date["now"]();',
  'const g = new (Date)();',
  'const h = new Date(undefined);',
  'const i = new Date(...[]);',
  'const j = [1].map(Date.now);',
  'const k = Reflect.apply(Date.now, null, []);',
  'const l = Date.now.call(null);',
  'class Clock extends Date {}',
  'const m = globalThis.Date.now();',
  'const n = new globalThis.Date();',
  'const o = performance.now();',
  'const p = performance.timeOrigin;',
  'const q = process.hrtime();',
  'const r = process.hrtime.bigint();',
  'const s = process.uptime();',
  'const t = process["hrtime"]();',
  'const u = process[key];',
  'const { hrtime } = process;',
  'const P = process;',
  'const w = Bun.nanoseconds();',
  'const { nanoseconds } = Bun;',
  'const x = Temporal.Now.instant();',
  'const { Now } = Temporal;',
  'const y = os.uptime();',
  'const uuid = Bun.randomUUIDv7();',
  'const formatted = new Intl.DateTimeFormat("en").format();',
  "import { hrtime as clock } from 'node:process';",
  "import { performance as perf } from 'node:perf_hooks';",
  "import * as hooks from 'perf_hooks';",
  "const z = await import('node:perf_hooks');",
  'const dynamic = await import(specifier);',
  "const required = require('perf_hooks');",
];

test('findClockReads names every clock reference and ignores pure dates, types and comments', () => {
  const source = [...pureLines, ...clockLines].join('\n');
  const flaggedLines = new Set(findClockReads('sample.ts', source).map((read) => read.line));
  const expectedLines = clockLines.map((_, index) => pureLines.length + index + 1);
  // Proof (2026-10-11): switching off one rule at a time dropped its lines from this set: the Date
  // rule (15 lines, `Date.now()` to `extends Date`), clock globals (`globalThis`, `performance`,
  // `Temporal`), clock holders (`process[key]`, `const P = process`), clock members
  // (`os.uptime()`, `Bun.randomUUIDv7()`,
  // `Intl.DateTimeFormat`, `import { hrtime as clock }`), module loads (the four `perf_hooks` and
  // computed specifiers) and the `undefined` argument test (`new Date(undefined)`). Switching off
  // the type-position skip flagged `let typed: Date` here and four type uses in the package.
  expect([...flaggedLines].sort((left, right) => left - right)).toEqual(expectedLines);
});
