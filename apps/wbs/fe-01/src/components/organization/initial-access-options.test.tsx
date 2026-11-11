import { Component, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@/testing/organization-render';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import {
  type InitialRoleId,
  readInitialAccessName,
  readInitialRoleId,
} from './initial-access-options';
import { InvitationsPanel } from './invitations-panel';
import { JoinRequestsPanel } from './join-requests-panel';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
class Captured extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <p role="alert">Initial access could not be rendered.</p>
    ) : (
      this.props.children
    );
  }
}
for (const panel of ['invitation', 'join'] as const) {
  it(
    'routes an impossible initial access selection to the Error Boundary at ' + panel,
    async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const calls = stubServer({
        'GET /api/organization/invitations': [() => answer(200, { invitations: [] })],
        'GET /api/organization/join-requests': [
          () =>
            answer(200, {
              requests: [{ id: 'r', email: 'ada@example.org', status: 'pending', createdAt: 1 }],
            }),
        ],
      });
      render(
        <Captured>
          {panel === 'invitation' ? (
            <InvitationsPanel onAccessLost={() => undefined} />
          ) : (
            <JoinRequestsPanel onAccessLost={() => undefined} />
          )}
        </Captured>,
      );
      const select = await screen.findByLabelText(
        panel === 'invitation' ? 'Initial access' : 'Initial access for ada@example.org',
      );
      const unknown = document.createElement('option');
      unknown.value = 'unexpected';
      unknown.textContent = 'Unexpected';
      select.append(unknown);
      fireEvent.change(select, { target: { value: 'unexpected' } });
      expect(await screen.findByRole('alert')).toHaveProperty(
        'textContent',
        'Initial access could not be rendered.',
      );
      expect(calls.filter((call) => call.route.startsWith('POST'))).toEqual([]);
    },
  );
}
it('throws for impossible role metadata instead of displaying an absent role label', () => {
  expect(() => readInitialAccessName('unexpected' as unknown as InitialRoleId)).toThrow(
    'Unexpected initial access option: unexpected',
  );
});

it('reports impossible DOM selection at its actual bounded reader', () => {
  expect(() => readInitialRoleId('unexpected')).toThrow(
    'Unexpected initial access option: unexpected',
  );
});
