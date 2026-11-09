import { describe, expect, it } from 'bun:test';

import { requests } from './fixtures/installed-requests.fixture';
import { decodeRequest } from './validator-request';

function envelope(request: unknown): object {
  return { version: 1, callerDirectory: '/caller with spaces', request };
}

describe('installed validator JSON request boundary', () => {
  it('covers all fifty validator variants from the independently composed installed grammar', () => {
    expect(requests).toHaveLength(50);
  });

  for (const request of requests) {
    const name = request.command + ('action' in request ? ' ' + request.action : '');
    it(name + ' survives JSON without reparsing argv or changing its typed shape', () => {
      expect(decodeRequest(JSON.stringify(envelope(request))) as unknown).toStrictEqual(
        envelope(request),
      );
    });
    it(name + ' rejects unknown request properties', () => {
      expect(() =>
        decodeRequest(JSON.stringify(envelope({ ...request, injected: 'secret' }))),
      ).toThrow('invalid installed validator request');
    });
  }

  for (const request of requests) {
    const variant = request.command + ('action' in request ? ' ' + request.action : '');
    for (const [field, value] of Object.entries(request)) {
      it(variant + ' refuses wrong transport type for ' + field, () => {
        expect(() => decodeRequest(JSON.stringify(envelope({ ...request, [field]: 123 })))).toThrow(
          'invalid installed validator request',
        );
      });
      const selectionCommands = [
        'read-candidate',
        'classify-candidate',
        'content-manifest',
        'validate-artifacts',
        'extract-relationships',
        'check-indexes',
        'check-root-migration',
        'check',
        'template',
      ];
      if (
        ['command', 'action', 'requirement'].includes(field) ||
        (field === 'kind' && selectionCommands.includes(request.command)) ||
        (field === 'mode' && request.command.startsWith('inspect-'))
      ) {
        it(variant + ' refuses unsupported transport selection ' + field, () => {
          expect(() =>
            decodeRequest(
              JSON.stringify(envelope({ ...request, [field]: 'unsupported-selection' })),
            ),
          ).toThrow('invalid installed validator request');
        });
      }
      if (value === undefined) continue;
      it(variant + ' requires transport field ' + field, () => {
        const incomplete = { ...request };
        Reflect.deleteProperty(incomplete, field);
        expect(() => decodeRequest(JSON.stringify(envelope(incomplete)))).toThrow(
          'invalid installed validator request',
        );
      });
      if (typeof value === 'string') {
        it(variant + ' refuses blank transport field ' + field, () => {
          expect(() =>
            decodeRequest(JSON.stringify(envelope({ ...request, [field]: '  ' }))),
          ).toThrow('invalid installed validator request');
        });
      }
    }
  }

  for (const request of [
    { command: 'candidate-identity', repository: '.', kind: 'committed', revision: 'HEAD' },
    {
      command: 'inspect-browser',
      repository: '.',
      revision: 'HEAD',
      rulePolicy: 'p',
      mode: 'ordinary',
    },
    { command: 'lint', kind: 'committed', repository: '.', revision: 'HEAD' },
    { command: 'prepare-activation' },
    { command: 'prepare-relocation-activation' },
    { command: 'template', action: 'missing' },
    { command: 'template', action: 'show' },
    { command: 'template', action: 'show', template: '   ' },
    { command: 'validate workflow-binding', file: 'binding.json', steps: [] },
    { command: 'validate workflow-binding', file: 'binding.json', steps: ['same', 'same'] },
    { command: 'validate workflow-binding', file: 'binding.json', steps: ['two words'] },
    { command: 'scenario', action: 'validate', repository: '.', source: '../outside.md' },
    {
      command: 'check',
      kind: 'committed',
      repository: '.',
      revision: 'HEAD',
      rulePolicy: 'p',
      now: 'tomorrow',
    },
    {
      command: 'check',
      kind: 'committed',
      repository: '.',
      revision: 'HEAD',
      rulePolicy: 'p',
      now: '2026-02-30T00:00:00Z',
    },
    { command: 'read-candidate', kind: 'missing', repository: '.', revision: 'HEAD' },
    { command: 'validate workflow-binding', file: 'binding.json', steps: ['a', 3] },
    { command: 'explain', rule: 'R1', policy: { repository: '.', rulePolicy: 'p', secret: 's' } },
    {
      command: 'check',
      kind: 'committed',
      repository: '.',
      revision: 'HEAD',
      rulePolicy: 'p',
      now: null,
    },
  ]) {
    it('rejects malformed or separately dispatched ' + JSON.stringify(request), () => {
      expect(() => decodeRequest(JSON.stringify(envelope(request)))).toThrow(
        'invalid installed validator request',
      );
    });
  }

  for (const source of [
    '',
    '{',
    'null',
    '[]',
    JSON.stringify({ ...envelope({ command: 'template', action: 'list' }), version: 2 }),
    JSON.stringify({
      ...envelope({ command: 'template', action: 'list' }),
      callerDirectory: 'relative',
    }),
    JSON.stringify({ ...envelope({ command: 'template', action: 'list' }), unexpected: true }),
    JSON.stringify({ version: 1, request: { command: 'template', action: 'list' } }),
  ]) {
    it('rejects malformed envelopes without echoing source: ' + source, () => {
      expect(() => decodeRequest(source)).toThrow('invalid installed validator request');
    });
  }
  it('accepts the complete optional explanation policy pair', () => {
    const selected = {
      command: 'explain',
      rule: 'RULE',
      policy: { repository: '.', rulePolicy: './policy' },
    };
    expect(decodeRequest(JSON.stringify(envelope(selected))).request as unknown).toStrictEqual(
      selected,
    );
  });
  for (const field of ['repository', 'rulePolicy']) {
    it('requires optional explanation policy member ' + field, () => {
      const policy = { repository: '.', rulePolicy: './policy' };
      Reflect.deleteProperty(policy, field);
      expect(() =>
        decodeRequest(JSON.stringify(envelope({ command: 'explain', rule: 'RULE', policy }))),
      ).toThrow('invalid installed validator request');
    });
  }
  for (const field of ['version', 'callerDirectory', 'request']) {
    it('requires envelope member ' + field, () => {
      const incomplete = envelope({ command: 'template', action: 'list' });
      Reflect.deleteProperty(incomplete, field);
      expect(() => decodeRequest(JSON.stringify(incomplete))).toThrow(
        'invalid installed validator request',
      );
    });
    it('refuses wrong envelope type for ' + field, () => {
      const malformed = envelope({ command: 'template', action: 'list' });
      Reflect.set(malformed, field, field === 'version' ? '1' : 123);
      expect(() => decodeRequest(JSON.stringify(malformed))).toThrow(
        'invalid installed validator request',
      );
    });
  }
});
