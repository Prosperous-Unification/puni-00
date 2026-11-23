import { expect, it } from 'bun:test';

import { type ControlEvent, createGateControl } from './gate-control';

it('latches an already aborted external reason by identity and wakes queue waiting', () => {
  const external = new AbortController(),
    reason = { cancellation: 'caller' };
  external.abort(reason);
  const control = createGateControl(external.signal);
  try {
    expect(control.signal.aborted).toBe(true);
    const first = control.readInterruption();
    expect(first.kind).toBe('external');
    if (first.kind !== 'external') throw Error('external interruption missing');
    expect(first.reason).toBe(reason);
    expect(control.readStatus()).toBe(130);
  } finally {
    control.dispose();
  }
});
it('retains first TERM provenance across later independent external cancellation', () => {
  const external = new AbortController(),
    control = createGateControl(external.signal),
    events: ControlEvent[] = [];
  try {
    control.subscribe((event) => events.push(event));
    process.emit('SIGTERM');
    external.abort({ cancellation: 'later caller' });
    expect(control.readInterruption()).toEqual({ kind: 'native', signal: 'SIGTERM' });
    expect(control.readStatus()).toBe(143);
    expect(events.map((event) => event.kind)).toEqual(['native', 'external']);
    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
  } finally {
    control.dispose();
  }
});
it('replays the same first event while repeated native observations get fresh sequences', () => {
  const control = createGateControl(new AbortController().signal),
    initial: ControlEvent[] = [],
    replayed: ControlEvent[] = [];
  try {
    control.subscribe((event) => initial.push(event));
    process.emit('SIGINT');
    control.subscribe((event) => replayed.push(event));
    process.emit('SIGINT');
    process.emit('SIGTERM');
    expect(initial).toEqual([
      { sequence: 1, kind: 'native', signal: 'SIGINT' },
      { sequence: 2, kind: 'native', signal: 'SIGINT' },
      { sequence: 3, kind: 'native', signal: 'SIGTERM' },
    ]);
    expect(replayed).toEqual(initial);
    expect(replayed[0]).toBe(initial[0]);
    expect(control.readStatus()).toBe(130);
  } finally {
    control.dispose();
  }
});
it('delivers one replay when a queue wake observer subscribes during first cancellation', () => {
  const external = new AbortController(),
    control = createGateControl(external.signal),
    events: ControlEvent[] = [];
  try {
    control.signal.addEventListener('abort', () => {
      control.subscribe((event) => events.push(event));
    });
    external.abort('caller');
    expect(events).toEqual([{ sequence: 1, kind: 'external', reason: 'caller' }]);
  } finally {
    control.dispose();
  }
});
it('unsubscribes and retires native and external listeners on disposal', () => {
  const external = new AbortController(),
    intListeners = process.listenerCount('SIGINT'),
    termListeners = process.listenerCount('SIGTERM'),
    control = createGateControl(external.signal),
    events: ControlEvent[] = [];
  try {
    expect(process.listenerCount('SIGINT')).toBe(intListeners + 1);
    expect(process.listenerCount('SIGTERM')).toBe(termListeners + 1);
    const unsubscribe = control.subscribe((event) => events.push(event));
    unsubscribe();
    external.abort('caller');
    expect(events).toEqual([]);
  } finally {
    control.dispose();
  }
  expect(process.listenerCount('SIGINT')).toBe(intListeners);
  expect(process.listenerCount('SIGTERM')).toBe(termListeners);
  const retired = new AbortController(),
    disposed = createGateControl(retired.signal);
  disposed.subscribe((event) => events.push(event));
  disposed.dispose();
  retired.abort('after disposal');
  expect(disposed.signal.aborted).toBe(false);
  expect(events).toEqual([]);
});
it('refuses a cancellation status without an observed control', () => {
  const control = createGateControl(new AbortController().signal);
  try {
    expect(control.readInterruption()).toEqual({ kind: 'none' });
    expect(() => control.readStatus()).toThrow('checkout cancellation lacks an observed control');
  } finally {
    control.dispose();
  }
});
it('keeps external130 and the original reason when later transport observes native TERM', () => {
  const external = new AbortController(),
    reason = { cancellation: 'external before transport' },
    control = createGateControl(external.signal),
    events: ControlEvent[] = [];
  try {
    external.abort(reason);
    control.subscribe((event) => events.push(event));
    process.emit('SIGTERM');
    const interruption = control.readInterruption();
    expect(interruption.kind).toBe('external');
    if (interruption.kind !== 'external') throw Error('external interruption missing');
    expect(interruption.reason).toBe(reason);
    expect(control.readStatus()).toBe(130);
    expect(events).toEqual([
      { sequence: 1, kind: 'external', reason },
      { sequence: 2, kind: 'native', signal: 'SIGTERM' },
    ]);
  } finally {
    control.dispose();
  }
});
it('delivers native TERM before external cancellation reentered by queue wake', () => {
  const external = new AbortController(),
    reason = { cancellation: 'wake listener' },
    control = createGateControl(external.signal),
    events: ControlEvent[] = [];
  try {
    control.subscribe((event) => events.push(event));
    control.signal.addEventListener('abort', () => {
      external.abort(reason);
    });
    process.emit('SIGTERM');
    expect(events).toEqual([
      { sequence: 1, kind: 'native', signal: 'SIGTERM' },
      { sequence: 2, kind: 'external', reason },
    ]);
    expect(control.readInterruption()).toEqual({ kind: 'native', signal: 'SIGTERM' });
    expect(control.readStatus()).toBe(143);
  } finally {
    control.dispose();
  }
});
it('finishes the current observer cohort before dispatching reentered cancellation', () => {
  const external = new AbortController(),
    reason = { cancellation: 'first observer' },
    control = createGateControl(external.signal),
    trace: string[] = [],
    later: ControlEvent[] = [];
  try {
    control.subscribe((event) => {
      trace.push('first:' + String(event.sequence));
      if (event.sequence === 1) external.abort(reason);
    });
    control.subscribe((event) => {
      trace.push('second:' + String(event.sequence));
      later.push(event);
    });
    process.emit('SIGINT');
    expect(trace).toEqual(['first:1', 'second:1', 'first:2', 'second:2']);
    expect(later).toEqual([
      { sequence: 1, kind: 'native', signal: 'SIGINT' },
      { sequence: 2, kind: 'external', reason },
    ]);
    const cancellation = later.at(1);
    if (cancellation?.kind !== 'external') throw Error('external notification missing');
    expect(cancellation.reason).toBe(reason);
    expect(control.readStatus()).toBe(130);
  } finally {
    control.dispose();
  }
});
it('replays first identity once to a wake subscriber while nested observations remain ordered', () => {
  const external = new AbortController(),
    reason = { cancellation: 'queued before subscription' },
    control = createGateControl(external.signal),
    original: ControlEvent[] = [],
    joined: ControlEvent[] = [];
  try {
    control.subscribe((event) => original.push(event));
    control.signal.addEventListener('abort', () => {
      external.abort(reason);
      control.subscribe((event) => joined.push(event));
      process.emit('SIGINT');
    });
    process.emit('SIGTERM');
    expect(original).toEqual([
      { sequence: 1, kind: 'native', signal: 'SIGTERM' },
      { sequence: 2, kind: 'external', reason },
      { sequence: 3, kind: 'native', signal: 'SIGINT' },
    ]);
    expect(joined).toEqual([
      { sequence: 1, kind: 'native', signal: 'SIGTERM' },
      { sequence: 3, kind: 'native', signal: 'SIGINT' },
    ]);
    expect(joined[0]).toBe(original[0]);
    expect(control.readStatus()).toBe(143);
  } finally {
    control.dispose();
  }
});
it('replays first identity once to a notification subscriber before an applicable nested event', () => {
  const external = new AbortController(),
    reason = { cancellation: 'observer after subscription' },
    control = createGateControl(external.signal),
    original: ControlEvent[] = [],
    joined: ControlEvent[] = [];
  try {
    control.subscribe((event) => {
      original.push(event);
      if (event.sequence === 1) {
        control.subscribe((notification) => joined.push(notification));
        external.abort(reason);
      }
    });
    process.emit('SIGTERM');
    expect(original).toEqual([
      { sequence: 1, kind: 'native', signal: 'SIGTERM' },
      { sequence: 2, kind: 'external', reason },
    ]);
    expect(joined).toEqual([
      { sequence: 1, kind: 'native', signal: 'SIGTERM' },
      { sequence: 2, kind: 'external', reason },
    ]);
    expect(joined[0]).toBe(original[0]);
  } finally {
    control.dispose();
  }
});
it('suppresses a captured notification when queue wake removes that registration', () => {
  const control = createGateControl(new AbortController().signal),
    events: ControlEvent[] = [];
  try {
    const unsubscribe = control.subscribe((event) => events.push(event));
    control.signal.addEventListener('abort', unsubscribe);
    process.emit('SIGTERM');
    expect(events).toEqual([]);
    expect(control.readStatus()).toBe(143);
  } finally {
    control.dispose();
  }
});
it('suppresses a later observer removed during the current notification', () => {
  const external = new AbortController(),
    control = createGateControl(external.signal),
    events: ControlEvent[] = [];
  let unsubscribe: () => void = () => undefined;
  try {
    control.subscribe((event) => {
      if (event.sequence === 1) {
        unsubscribe();
        external.abort('after removal');
      }
    });
    unsubscribe = control.subscribe((event) => events.push(event));
    process.emit('SIGINT');
    expect(events).toEqual([]);
    expect(control.readInterruption()).toEqual({ kind: 'native', signal: 'SIGINT' });
  } finally {
    control.dispose();
  }
});
it('retires only one registration when the same callback subscribes twice', () => {
  const control = createGateControl(new AbortController().signal),
    events: ControlEvent[] = [],
    observe = (event: ControlEvent) => events.push(event);
  try {
    const removeFirst = control.subscribe(observe),
      removeSecond = control.subscribe(observe);
    process.emit('SIGINT');
    expect(events).toEqual([
      { sequence: 1, kind: 'native', signal: 'SIGINT' },
      { sequence: 1, kind: 'native', signal: 'SIGINT' },
    ]);
    removeFirst();
    removeFirst();
    process.emit('SIGTERM');
    expect(events).toEqual([
      { sequence: 1, kind: 'native', signal: 'SIGINT' },
      { sequence: 1, kind: 'native', signal: 'SIGINT' },
      { sequence: 2, kind: 'native', signal: 'SIGTERM' },
    ]);
    removeSecond();
    process.emit('SIGINT');
    expect(events).toHaveLength(3);
  } finally {
    control.dispose();
  }
});
it('executable facade disposal suppresses its already captured undelivered cohort', () => {
  const events: ControlEvent[] = [];
  function runExecutable(): void {
    const control = createGateControl(new AbortController().signal);
    let isClosed = false;
    function closeExecutable(): void {
      if (isClosed) return;
      isClosed = true;
      control.dispose();
    }
    try {
      control.subscribe((event) => events.push(event));
      control.signal.addEventListener('abort', closeExecutable, { once: true });
      process.emit('SIGTERM');
    } finally {
      closeExecutable();
    }
  }
  runExecutable();
  expect(events).toEqual([]);
});
