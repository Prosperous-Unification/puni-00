import { describe, expect, it } from 'bun:test';

import { Presence } from './presence';

const socket = () => {
  const sent: string[] = [];
  return { sent, send: (s: string) => sent.push(s) };
};

describe('Presence', () => {
  it('lists a joined user once per name, not once per connection', () => {
    const p = new Presence();
    p.join('c1', 'ada', socket());
    p.join('c2', 'ada', socket());
    p.join('c3', 'grace', socket());
    expect(p.list()).toEqual(['ada', 'grace']);
    expect(p.connectionCount).toBe(3);
  });

  it('keeps a user online while any of their connections remains', () => {
    const p = new Presence();
    p.join('c1', 'ada', socket());
    p.join('c2', 'ada', socket());
    p.leave('c1');
    expect(p.list()).toEqual(['ada']);
    p.leave('c2');
    expect(p.list()).toEqual([]);
  });

  it('broadcasts the roster to every connection', () => {
    const p = new Presence();
    const a = socket();
    const b = socket();
    p.join('c1', 'ada', a);
    p.join('c2', 'grace', b);
    p.broadcast();
    const expected = JSON.stringify({ type: 'presence', users: ['ada', 'grace'] });
    expect(a.sent.at(-1)).toBe(expected);
    expect(b.sent.at(-1)).toBe(expected);
  });

  it('still reaches the other clients when one socket throws', () => {
    const p = new Presence();
    const good = socket();
    p.join('c1', 'broken', {
      send: () => {
        throw new Error('socket closed');
      },
    });
    p.join('c2', 'ada', good);
    expect(() => {
      p.broadcast();
    }).not.toThrow();
    expect(good.sent).toHaveLength(1);
  });

  it('resolves the username behind a connection id', () => {
    const p = new Presence();
    p.join('c1', 'ada', socket());
    expect(p.usernameOf('c1')).toBe('ada');
    expect(p.usernameOf('missing')).toBeNull();
  });
});
