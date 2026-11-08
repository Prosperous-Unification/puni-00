import { expect, test } from 'bun:test';

import { assertSolverExecutionIdentity } from './solver-execution';
import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
} from './solver-supervisor-install-contract';

const execution = () => ({
  executable: SOLVER_SUPERVISOR_BUN,
  kernelExecutable: SOLVER_SUPERVISOR_BUN,
  executableIdentity: '1:2',
  kernelIdentity: '1:2',
  module: SOLVER_SUPERVISOR_BUNDLE.remote,
  argv: [
    SOLVER_SUPERVISOR_BUN,
    SOLVER_SUPERVISOR_BUNDLE.remote,
    `--config=${SOLVER_SUPERVISOR_CONFIG}`,
    '--admission=policy',
  ],
});
test('restoring execution binds actual Bun kernel inode bundled module and exact startup arguments', () => {
  expect(() => {
    assertSolverExecutionIdentity(execution());
  }).not.toThrow();
  for (const observed of [
    { ...execution(), executable: '/foreign/bun' },
    { ...execution(), kernelExecutable: '/foreign/bun' },
    { ...execution(), kernelIdentity: '1:3' },
    { ...execution(), module: '/source/solver-execution.ts' },
    { ...execution(), argv: [...execution().argv, '--extra'] },
    {
      ...execution(),
      argv: [
        SOLVER_SUPERVISOR_BUN,
        '/foreign/bundle',
        `--config=${SOLVER_SUPERVISOR_CONFIG}`,
        '--admission=policy',
      ],
    },
  ])
    expect(() => {
      assertSolverExecutionIdentity(observed);
    }).toThrow();
});
