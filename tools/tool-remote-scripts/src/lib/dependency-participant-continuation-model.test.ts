import { expect, test } from 'bun:test';

import { GATEWAY_RESTORATION_CASES } from '../fixtures/gateway-restoration-cases';
import {
  assertRealHostReader,
  runModelChild,
  withModelFixture,
} from '../fixtures/model-child-custody';
import { createReadinessByteTransportFixture } from '../fixtures/product-readiness-byte-transport';
import { SOLVER_BACKEND_CASES } from '../fixtures/solver-backend-cases';

for (const scenario of [...SOLVER_BACKEND_CASES, ...GATEWAY_RESTORATION_CASES])
  test(`isolated ${scenario.name}`, async () => {
    const deadline = performance.now() + 310000;
    await assertRealHostReader();
    const project = new URL('../..', import.meta.url).pathname;
    const fixture = await createReadinessByteTransportFixture();
    await withModelFixture(fixture.directory, async () => {
      const name = scenario.name;
      const childWork = Math.min(300000, deadline - performance.now() - 10000);
      if (childWork <= 0) throw new Error('solver-backend child cleanup reserve unavailable');
      const child = await runModelChild(
        [
          process.execPath,
          'test',
          'test/dependency-solver-backend-model-child.test.ts',
          '-t',
          `^${name}$`,
          '--preload',
          '../test/scratch/preload.ts',
          '--timeout=300000',
        ],
        childWork,
        project,
        fixture.environment,
      );
      process.stderr.write(child.output);
      expect(child.expired).toBe(false);
      expect(child.signal).toBeNull();
      expect(child.exit).toBe(0);
      expect(child.output).toMatch(/\b1 pass\b/);
      expect(child.output).toMatch(/\b0 fail\b/);
      expect(child.output).toMatch(
        new RegExp(
          `\\b${String(27 + SOLVER_BACKEND_CASES.length + GATEWAY_RESTORATION_CASES.length)} filtered out\\b`,
        ),
      );
      const passed = [...child.output.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map(
        (match) => match[1],
      );
      expect(passed).toEqual([name]);
    });
    await assertRealHostReader();
  }, 310000);
