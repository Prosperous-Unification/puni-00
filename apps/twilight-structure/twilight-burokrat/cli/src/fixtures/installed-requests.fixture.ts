import type { Usage, UsageTerm } from '@optique/core';

import { installedGrammar, readInvocation } from '../cli-parser';

const separate = new Set(['lint', 'prepare-activation', 'prepare-relocation-activation']);

function sample(metavar: string): string {
  if (metavar === 'SELECTION' || metavar === 'KIND') return 'committed';
  if (metavar === 'MODE') return 'ordinary';
  if (metavar === 'SPEC') return 'openspec/specs/example/spec.md';
  if (metavar === 'STEPS') return 'design,build';
  if (metavar === 'INSTANT') return '2026-11-09T00:00:00.000Z';
  if (metavar === 'REQUIREMENT') return 'allow-local';
  return 'fixture ' + metavar.toLowerCase();
}

function expandTerm(term: UsageTerm): string[][] {
  switch (term.type) {
    case 'command':
      return [[term.name]];
    case 'argument':
      return [[sample(term.metavar)]];
    case 'option': {
      const name = term.names[0];
      return [[name, ...(term.metavar === undefined ? [] : [sample(term.metavar)])]];
    }
    case 'exclusive':
      return term.terms.flatMap(expand);
    case 'optional':
      return [[]];
    case 'sequence':
      return expand(term.terms);
    case 'multiple':
      return expand(term.terms);
    case 'literal':
      return [[term.value]];
    case 'passthrough':
    case 'ellipsis':
      throw new Error('installed grammar contains an untyped tail');
  }
}

function expand(terms: Usage): string[][] {
  return terms.reduce<string[][]>(
    (prefixes, term) =>
      prefixes.flatMap((prefix) => expandTerm(term).map((words) => [...prefix, ...words])),
    [[]],
  );
}

export const requests = expand(installedGrammar.parser.usage).flatMap((argv) => {
  if (separate.has(argv[0] ?? '')) return [];
  const invocation = readInvocation(installedGrammar, argv, {
    stdout: () => {
      throw new Error('fixture printed');
    },
  });
  if (invocation.kind !== 'command') throw new Error('fixture printed instead of parsing');
  return [invocation.command];
});
