import { throws } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { decodeSourceRestorationConfiguration } from './source-restoration-configuration';

const files = {
  backend: 'PORT=3100\nMIGRATE_ON_STARTUP=false\n',
  gateway: 'PORT=3200\nBE_URL=http://localhost:3100\n',
  mcp: 'WBS_API_URL=https://dev.wbs.bulletpoints.club\n',
  frontend: 'VITE_BE_URL=http://localhost:3100\nVITE_GW_URL=http://localhost:3200\n',
};
test('source effective routes bind all four roles to their own fixed development deployment', () => {
  const profile = decodeSourceRestorationConfiguration(files, []);
  expect(profile.ports).toEqual({ backend: 3100, gateway: 3200, mcp: 3300, frontend: 4200 });
  expect(profile.gatewayBackend).toBe('http://localhost:3100');
  expect(profile.mcpBackend).toBe('https://dev.wbs.bulletpoints.club');
  expect(profile.frontendBackend).toBe('http://localhost:3100');
  expect(profile.frontendGateway).toBe('http://localhost:3200');
});
for (const [name, changed, environment] of [
  ['wrong backend port', { ...files, backend: 'PORT=3101\nMIGRATE_ON_STARTUP=false\n' }, []],
  ['wrong gateway target', { ...files, gateway: 'PORT=3200\nBE_URL=http://be-01-blue:3100\n' }, []],
  ['wrong MCP target', { ...files, mcp: 'WBS_API_URL=https://wbs.bulletpoints.club\n' }, []],
  [
    'wrong frontend target',
    {
      ...files,
      frontend: 'VITE_BE_URL=http://localhost:3100\nVITE_GW_URL=http://elsewhere:3200\n',
    },
    [],
  ],
  ['inherited port overrides dotenv', files, ['PORT=3100']],
  ['inherited wrong gateway', files, ['BE_URL=http://elsewhere:3100']],
  ['quoted inherited target is literal runtime text', files, ['BE_URL="http://localhost:3100"']],
  ['startup migration override', files, ['MIGRATE_ON_STARTUP=true']],
  ['dynamic target', { ...files, gateway: 'PORT=3200\nBE_URL="http://${TARGET}:3100"\n' }, []],
  [
    'duplicate inherited target',
    files,
    ['BE_URL=http://localhost:3100', 'BE_URL=http://elsewhere:3100'],
  ],
] as const)
  test(`source effective configuration refuses ${name}`, () => {
    throws(() => decodeSourceRestorationConfiguration(changed, environment));
  });
