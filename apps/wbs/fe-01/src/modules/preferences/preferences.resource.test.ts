import { expect, test } from 'vitest';

import { fakeBrowserStorage } from './fake-browser-storage';
import { createPreferences } from './preferences.resource';

const isColour = (claimed: unknown): claimed is 'light' | 'dark' =>
  claimed === 'light' || claimed === 'dark';
const isSection = (stored: string): stored is 'teams' | 'steps' =>
  stored === 'teams' || stored === 'steps';

test('a JSON-written value comes back as it was written', () => {
  const store = fakeBrowserStorage();
  const held = createPreferences(store).json('wbs.demo', isColour);
  held.write('dark');
  expect(store.held()['wbs.demo']).toBe('"dark"');
  expect(held.read()).toBe('dark');
  expect(held.claim()).toEqual({ status: 'held', value: 'dark' });
});

test('nothing stored is absent, and is not a refusal', () => {
  const held = createPreferences(fakeBrowserStorage()).json('wbs.demo', isColour);
  expect(held.claim()).toEqual({ status: 'absent' });
  expect(held.read()).toBeNull();
});

test('a read that drops removes the refused key; a plain read writes nothing', () => {
  const store = fakeBrowserStorage({ 'wbs.demo': '"midnight"' });
  const held = createPreferences(store).json('wbs.demo', isColour);
  expect(held.read()).toBeNull();
  expect(store.held()['wbs.demo']).toBe('"midnight"');
  expect(held.readAndDrop()).toBeNull();
  expect(store.held()['wbs.demo']).toBeUndefined();
});

test('bytes that will not parse are refused rather than thrown', () => {
  const store = fakeBrowserStorage({ 'wbs.demo': '{not json' });
  const held = createPreferences(store).json('wbs.demo', isColour);
  expect(held.claim()).toEqual({ status: 'refused' });
  expect(held.readAndDrop()).toBeNull();
  expect(store.held()['wbs.demo']).toBeUndefined();
});

test('a bare-text key is written without quotes and read without a parse', () => {
  const store = fakeBrowserStorage();
  const held = createPreferences(store).text('wbs.demo.section', isSection);
  held.write('steps');
  expect(store.held()['wbs.demo.section']).toBe('steps');
  expect(held.read()).toBe('steps');
});

test('a bare-text value the guard refuses takes its key with it', () => {
  const store = fakeBrowserStorage({ 'wbs.demo.section': '7' });
  const held = createPreferences(store).text('wbs.demo.section', isSection);
  expect(held.readAndDrop()).toBeNull();
  expect(store.held()['wbs.demo.section']).toBeUndefined();
});

test('an unchecked key holds every string, the empty one included', () => {
  const store = fakeBrowserStorage({ 'wbs.demo.id': '' });
  const held = createPreferences(store).unchecked('wbs.demo.id');
  expect(held.claim()).toEqual({ status: 'held', value: '' });
  expect(held.read()).toBe('');
  expect(held.readAndDrop()).toBe('');
  expect(store.held()['wbs.demo.id']).toBe('');
});

test('an unchecked key is written as bare text', () => {
  const store = fakeBrowserStorage();
  const held = createPreferences(store).unchecked('wbs.demo.id');
  held.write('p1');
  expect(store.held()['wbs.demo.id']).toBe('p1');
});

test('forgetting removes the key and writes no default over it', () => {
  const store = fakeBrowserStorage({ 'wbs.demo': '"dark"' });
  const held = createPreferences(store).json('wbs.demo', isColour);
  held.forget();
  expect(store.held()).toEqual({});
});

test('a store that refuses access is not recovered from', () => {
  const refusing = {
    read: (): string | null => {
      throw new Error('site data blocked');
    },
    write: (): void => {
      throw new Error('site data blocked');
    },
    forget: (): void => {
      throw new Error('site data blocked');
    },
  };
  const held = createPreferences(refusing).json('wbs.demo', isColour);
  expect(() => held.read()).toThrow('site data blocked');
});
