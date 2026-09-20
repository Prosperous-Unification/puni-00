import { expect, test } from 'vitest';

import { fakeBrowserStorage } from './fake-browser-storage';
import { createRememberedPreferences } from './preferences.feature';
import { createPreferences } from './preferences.resource';

const isChoice = (claimed: unknown): claimed is 'light' | 'dark' =>
  claimed === 'light' || claimed === 'dark';
const isSection = (stored: string): stored is 'teams' => stored === 'teams';

test('each named answer reaches the key readers already have', () => {
  const store = fakeBrowserStorage();
  const named = createRememberedPreferences(createPreferences(store));

  named.themeChoice(isChoice).write('dark');
  named.ganttDetail.write(true);
  named.lastOpenedProject.write('p1');
  named.projectSettingsSection('p9', isSection).write('teams');

  // Names and bytes together, because both are compatibility facts: two of
  // these are bare text and eleven are JSON, and a reader has them now.
  expect(store.held()).toEqual({
    'wbs.theme': '"dark"',
    'wbs.ganttDetail': 'true',
    'wbs.project': 'p1',
    'wbs.projectSettingsSection.p9': 'teams',
  });
});

test('the retired chart key is reachable only to be dropped', () => {
  const store = fakeBrowserStorage({ 'wbs.ganttArrows': 'true' });
  const named = createRememberedPreferences(createPreferences(store));

  named.retiredGanttArrows.forget();
  expect(store.held()['wbs.ganttArrows']).toBeUndefined();
});

test('the chart detail refuses anything that is not a boolean', () => {
  const store = fakeBrowserStorage({ 'wbs.ganttDetail': '"yes"' });
  const named = createRememberedPreferences(createPreferences(store));

  expect(named.ganttDetail.claim()).toEqual({ status: 'refused' });
  expect(named.ganttDetail.readAndDrop()).toBeNull();
  expect(store.held()['wbs.ganttDetail']).toBeUndefined();
});

test('the last opened project holds the empty string rather than refusing it', () => {
  const store = fakeBrowserStorage({ 'wbs.project': '' });
  const named = createRememberedPreferences(createPreferences(store));

  expect(named.lastOpenedProject.read()).toBe('');
});
