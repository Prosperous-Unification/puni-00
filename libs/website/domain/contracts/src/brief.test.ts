import { expect, test } from 'bun:test';

import { captureBrief, displayReply } from './brief';

const body = ['- Users: workshop volunteers', '- Problem: paper slots', '- First release: booking'];

test('a marked reply yields only the marked body', () => {
  const reply = [
    'Here is the brief as I understand it:',
    '[brief]',
    'A booking tool for a bicycle workshop.',
    ...body,
    '[/brief]',
    'Is this right?',
  ].join('\n');
  expect(captureBrief(reply)).toEqual({
    kind: 'marked',
    body: ['A booking tool for a bicycle workshop.', ...body].join('\n'),
  });
});

test('markers with surrounding spaces still count as their own lines', () => {
  expect(captureBrief(`Intro:\n  [brief]  \n${body.join('\n')}\n [/brief]\nRight?`)).toEqual({
    kind: 'marked',
    body: body.join('\n'),
  });
});

test('without markers the fallback drops a leading colon line and a trailing question', () => {
  const reply = ['Here is the brief as I understand it:', ...body, 'Is this right?'].join('\n');
  expect(captureBrief(reply)).toEqual({ kind: 'fallback', body: body.join('\n') });
});

test('the fallback keeps lines that are not framing', () => {
  expect(captureBrief(body.join('\n'))).toEqual({ kind: 'fallback', body: body.join('\n') });
});

test('markers around an empty body capture nothing', () => {
  expect(captureBrief('Here it is:\n[brief]\n  \n[/brief]\nIs this right?')).toEqual({
    kind: 'empty',
  });
});

test('a reply that is only framing captures nothing', () => {
  expect(captureBrief('Here it is:\nIs this right?')).toEqual({ kind: 'empty' });
});

test('an unclosed marker falls back without leaking the marker', () => {
  expect(captureBrief(`Here it is:\n[brief]\n${body.join('\n')}\nIs this right?`)).toEqual({
    kind: 'fallback',
    body: body.join('\n'),
  });
});

test('inline marker text is not a marker', () => {
  expect(captureBrief(`Use [brief] here [/brief]\n${body.join('\n')}`)).toEqual({
    kind: 'fallback',
    body: `Use [brief] here [/brief]\n${body.join('\n')}`,
  });
});

test('the displayed reply never shows marker lines', () => {
  expect(displayReply(`Here it is:\n[brief]\n${body.join('\n')}\n[/brief]\nIs this right?`)).toBe(
    `Here it is:\n${body.join('\n')}\nIs this right?`,
  );
});

test('a streaming reply hides a partial marker on its last line', () => {
  expect(displayReply('Here it is:\n[bri')).toBe('Here it is:');
  expect(displayReply(`Here it is:\n[brief]\n${body[0] ?? ''}\n[/b`)).toBe(
    `Here it is:\n${body[0] ?? ''}`,
  );
});
