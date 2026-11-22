import { describe, expect, it } from 'bun:test';

import { readInvocation, UsageRefusal } from './cli-parser';

function readRequest(args: readonly string[]) {
  const output: string[] = [];
  const invocation = readInvocation(args, (chunk) => {
    output.push(chunk);
  });
  return { invocation, output: output.join('') };
}

function expectExistingDevelopmentHelp(namespace: string): void {
  const observed = readRequest([namespace, 'dev', '--help']);
  expect(observed.invocation).toEqual({ kind: 'printed' });
  expect(observed.output).toContain('dev');
}

describe('PUNI browser and performance execution grammar', () => {
  for (const namespace of ['dash', 'd']) {
    for (const mode of ['ordinary', 'packaged', 'portable'] as const) {
      it(`composes browser execution for ${namespace} ${mode}`, () => {
        expectExistingDevelopmentHelp(namespace);
        const observed = readRequest([
          namespace,
          'browser',
          mode,
          '--repository',
          '/absent candidate with spaces',
        ]);
        expect(observed).toEqual({
          invocation: {
            kind: 'command',
            command: {
              tool: 'dash',
              request: {
                command: 'browser',
                mode,
                repository: '/absent candidate with spaces',
              },
            },
          },
          output: '',
        });
      });
    }

    it(`composes performance execution with an explicit policy for ${namespace}`, () => {
      expectExistingDevelopmentHelp(namespace);
      const observed = readRequest([
        namespace,
        'performance',
        '--repository',
        '/absent candidate with spaces',
        '--rule-policy',
        '/absent independent policy.json',
      ]);
      expect(observed).toEqual({
        invocation: {
          kind: 'command',
          command: {
            tool: 'dash',
            request: {
              command: 'performance',
              repository: '/absent candidate with spaces',
              rulePolicy: '/absent independent policy.json',
            },
          },
        },
        output: '',
      });
    });

    it(`leaves performance policy selection to captured execution inputs for ${namespace}`, () => {
      expectExistingDevelopmentHelp(namespace);
      const observed = readRequest([
        namespace,
        'performance',
        '--repository',
        '/absent candidate with spaces',
      ]);
      expect(observed).toEqual({
        invocation: {
          kind: 'command',
          command: {
            tool: 'dash',
            request: {
              command: 'performance',
              repository: '/absent candidate with spaces',
              rulePolicy: undefined,
            },
          },
        },
        output: '',
      });
    });
  }

  for (const args of [
    ['dash', 'browser', 'unknown', '--repository', '/absent'],
    ['dash', 'browser', 'portable'],
    ['dash', 'browser', 'portable', '--repository', '   '],
    ['dash', 'browser', 'portable', '--repository', '/absent', '--services', 'arbitrary'],
    ['d', 'performance'],
    ['d', 'performance', '--repository', '/absent', '--rule-policy', '   '],
    ['d', 'performance', '--repository', '/absent', '--command', 'arbitrary'],
    ['d', 'performance', '--repository', '/first', '--repository', '/second'],
  ]) {
    it(`refuses unowned browser/performance arguments: ${args.join(' ')}`, () => {
      expect(() => readRequest(args)).toThrow(UsageRefusal);
    });
  }
});
