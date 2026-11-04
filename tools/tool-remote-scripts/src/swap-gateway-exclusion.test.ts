import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { createEdgeEnvironment } from '../test/edge-state';
import { parseGatewayFenceInvocation } from './swap';

let previousControllerState: string | undefined;
beforeEach(() => {
  previousControllerState = process.env['WBS_EDGE_STATE'];
  const controllerState = scratchSync('direct-controller-edge-');
  writeFileSync(`${controllerState}/edge.lock`, '');
  process.env['WBS_EDGE_STATE'] = controllerState;
});
afterEach(() => {
  if (previousControllerState === undefined) delete process.env['WBS_EDGE_STATE'];
  else process.env['WBS_EDGE_STATE'] = previousControllerState;
});

const sha = 'a'.repeat(40);

test('dedicated fence commands are explicit and mutually exclusive', () => {
  expect(
    parseGatewayFenceInvocation(['gw', '--fence-dependency-gateways', '--execute', `--sha=${sha}`]),
  ).toEqual({ mode: 'fence', sha });
  expect(parseGatewayFenceInvocation(['gw', '--inspect-dependency-gateway-fence'])).toEqual({
    mode: 'inspect',
  });
  expect(parseGatewayFenceInvocation(['gw', '--execute', '--image-gw=ordinary'])).toBeNull();
});

for (const args of [
  ['be', '--fence-dependency-gateways', '--execute', `--sha=${sha}`],
  ['gw,fe', '--fence-dependency-gateways', '--execute', `--sha=${sha}`],
  ['gw,gw', '--inspect-dependency-gateway-fence'],
  ['gw', '--fence-dependency-gateways', `--sha=${sha}`],
  ['gw', '--fence-dependency-gateways', '--execute'],
  ['gw', '--fence-dependency-gateways', '--execute', '--sha=short'],
  ['gw', '--inspect-dependency-gateway-fence', '--execute'],
  ['gw', '--inspect-dependency-gateway-fence', '--fence-dependency-gateways'],
  ['gw', '--fence-dependency-gateways', '--execute', `--sha=${sha}`, '--image-gw=unrelated'],
  ['gw', '--fence-dependency-gateways', '--execute', `--sha=${sha}`, '--preflight'],
  ['gw', '--fence-dependency-gateways', '--execute', `--sha=${sha}`, '--activate-step-blockage'],
  ['gw', '--fence-dependency-gateways', '--execute', `--sha=${sha}`, '--dry-run'],
  ['gw', '--fence-dependency-gateways', '--execute', '--execute', `--sha=${sha}`],
  ['gw', '--fence-dependency-gateways=true', '--execute', `--sha=${sha}`],
]) {
  test(`refuses mixed gateway invocation ${args.join(' ')}`, async () => {
    expect(() => parseGatewayFenceInvocation(args)).toThrow('gateway fence');
    const child = Bun.spawn(
      [process.execPath, fileURLToPath(new URL('./swap.ts', import.meta.url)), ...args],
      {
        env: createEdgeEnvironment(),
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(code).toBe(1);
    expect(stderr).toContain('gateway fence');
    expect(stderr).not.toContain('--image-gw=');
  });
}
