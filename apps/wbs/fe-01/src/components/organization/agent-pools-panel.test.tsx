import { render as renderBare } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppFaultBoundary } from '@/components/chrome/app-fault';
import { type ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@/testing/organization-render';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { type AgentPool, AgentPoolsPanel, AgentPoolsSlot } from './agent-pools-panel';
import { type AccessLoss } from './organization-access';
import { useOrganizationRole } from './organization-role';

const LIST = 'GET /api/organization/agent-pools';
const LIMITS = 'GET /api/organization/limits';
const CREATE = 'POST /api/organization/agent-pools';
const REKEY = (id: string) => `POST /api/organization/agent-pools/${id}/rekey`;
const REVOKE = (id: string) => `DELETE /api/organization/agent-pools/${id}`;
/** Shaped like a key so a leak is unmistakable; it opens nothing. */
const KEY = 'wbs_mk_6f1c2a8e-0000-4000-8000-0000000000a1.cG9vbC1rZXktc2hvd24tbmV2ZXI';
const DAY = 86_400_000;

const scopeOf = (organizationId: string): ResourceScope => ({
  organization: { kind: 'active', organizationId },
  isCurrent: () => true,
  refuse: () => undefined,
});

const credentialOf = (index: number) => ({
  id: `cred-${String(index)}`,
  source: 'api_key',
  name: `swarm-a-${String(index)}`,
  personId: `p-${String(index)}`,
  issuedBy: 'u1',
  issuer: null,
  subject: null,
  createdAt: Date.UTC(2026, 9, 28, 9, 0),
  lastUsedAt: null,
  revokedAt: null,
  rotationEndsAt: null,
  secrets: [{ id: `s-${String(index)}`, createdAt: 1, expiresAt: null }],
});

const poolOf = (fields: Partial<AgentPool> & { liveKeys?: number } = {}): AgentPool => {
  const { liveKeys = fields.size ?? 8, ...rest } = fields;
  return {
    id: 'pool-1',
    name: 'swarm-a',
    size: 8,
    expiresAt: null,
    revokedAt: null,
    createdAt: Date.UTC(2026, 9, 28, 9, 0),
    createdBy: 'u1',
    credentials: Array.from({ length: liveKeys }, (_, index) => credentialOf(index + 1)),
    ...rest,
  } as AgentPool;
};

const swarm = poolOf({ expiresAt: Date.now() + 30 * DAY });
const partlyKeyed = poolOf({ id: 'pool-2', name: 'swarm-b', size: 9, liveKeys: 8 });
const expired = poolOf({ id: 'pool-3', name: 'swarm-old', expiresAt: Date.now() - DAY });
const revoked = poolOf({
  id: 'pool-4',
  name: 'swarm-gone',
  revokedAt: Date.UTC(2026, 9, 27, 12, 0),
  liveKeys: 0,
});

const keysOf = (poolId: string, name: string, count: number, expiresAt: number | null = null) => ({
  format: 'wbs-agent-pool-keys',
  version: 1,
  organizationId: 'org-a',
  authorizationServer: 'https://wbs.example/mcp/oauth',
  mcpResource: 'https://wbs.example/mcp',
  poolId,
  name,
  expiresAt,
  issuedAt: Date.UTC(2026, 9, 28, 10, 0),
  agents: Array.from({ length: count }, (_, index) => ({
    personId: `p-${String(index + 1)}`,
    personName: `${name}-${String(index + 1)}`,
    credentialId: `cred-${String(index + 1)}`,
    key: index === 0 ? KEY : `${KEY}${String(index)}`,
  })),
});

const role = (value: string) => () =>
  answer(200, { organizationId: 'org-a', name: 'Acme', role: value });
const listing =
  (...pools: AgentPool[]) =>
  () =>
    answer(200, { pools });
const limitsOf =
  (agentPersons: number, maxAgentPersons = 20) =>
  () =>
    answer(200, {
      source: 'default',
      limits: { maxAgentPersons, maxConcurrentClaims: 50, maxCapacityUnitsPerResource: 100 },
      usage: { agentPersons, concurrentClaims: 0, capacityUnits: [] },
    });

function RoleReadSlot({ onAccessLost }: { onAccessLost: (loss: AccessLoss) => void }) {
  return <AgentPoolsSlot role={useOrganizationRole(onAccessLost)} onAccessLost={onAccessLost} />;
}

function mount(onAccessLost: (loss: AccessLoss) => void = () => undefined) {
  render(
    <OrganizationResourcesProvider scope={scopeOf('org-a')}>
      <RoleReadSlot onAccessLost={onAccessLost} />
    </OrganizationResourcesProvider>,
  );
}

function stub(routes: Parameters<typeof stubServer>[0]) {
  return stubServer({
    'GET /api/organization/active': [role('admin')],
    [LIMITS]: [limitsOf(3)],
    ...routes,
  });
}

const region = () => screen.findByRole('region', { name: 'Agent pools' });
const row = (name: string) => screen.findByRole('listitem', { name });
/** The address a stubbed `fetch` was called with. */
const addressOf = (url: RequestInfo | URL): string =>
  url instanceof Request ? url.url : url.toString();
const routesOf = (sent: ReturnType<typeof stubServer>) => sent.map((request) => request.route);

/**
 * Captures every file the page saves, by the anchor click a download is.
 * The production download runs unchanged up to the click.
 */
interface Downloads {
  /** Every blob handed to `createObjectURL`. */
  blobs: Blob[];
  /** The file name of every save, in order. */
  names: string[];
  /** The URL of every save, in order. */
  hrefs: string[];
  /** Whether each save's anchor was in the document when clicked. */
  attached: boolean[];
  /** Every URL revoked. */
  revoked: string[];
}

function captureDownloads(): Downloads {
  const saved: Downloads = { blobs: [], names: [], hrefs: [], attached: [], revoked: [] };
  const urls = URL as unknown as {
    createObjectURL: (blob: Blob) => string;
    revokeObjectURL: (url: string) => void;
  };
  urls.createObjectURL = (blob: Blob) => {
    saved.blobs.push(blob);
    return `blob:pool-keys-${String(saved.blobs.length)}`;
  };
  urls.revokeObjectURL = (url: string) => {
    saved.revoked.push(url);
  };
  HTMLAnchorElement.prototype.click = function capture(this: HTMLAnchorElement) {
    saved.names.push(this.download);
    saved.hrefs.push(this.href);
    saved.attached.push(this.isConnected);
  };
  return saved;
}

/** A blob's text through `FileReader`: jsdom's Blob has no `text()`. */
const readBlobText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      if (typeof text === 'string') resolve(text);
      else reject(new Error('the saved file read back as something else'));
    };
    reader.onerror = () => {
      reject(new Error('the saved file could not be read'));
    };
    reader.readAsText(blob);
  });

let downloads: Downloads;

beforeEach(() => {
  downloads = captureDownloads();
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  Reflect.deleteProperty(HTMLAnchorElement.prototype, 'click');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Nothing of any key reached the page, the console or browser storage. */
function expectNoKeyAnywhere(logged: { mock: { calls: unknown[][] } }[], stored: unknown) {
  expect(document.body.innerHTML).not.toContain('wbs_mk_');
  for (const spy of logged) expect(JSON.stringify(spy.mock.calls)).not.toContain('wbs_mk_');
  expect(stored).not.toHaveBeenCalled();
}

describe('agent pools panel states', () => {
  it('renders loading, then each pool with its size, live keys, expiry and creation', async () => {
    stub({ [LIST]: [listing(swarm, partlyKeyed, expired, revoked)] });
    mount();
    expect(screen.getByText('Loading agent pools…')).toBeDefined();
    const first = await row('swarm-a');
    expect(within(first).getByText('Live')).toBeDefined();
    expect(within(first).getByText('Agents').nextSibling).toHaveTextContent('8');
    expect(within(first).getByText('Live keys').nextSibling).toHaveTextContent('8');
    expect(within(first).getByText('Expires').nextSibling).toHaveTextContent(/UTC$/);
    expect(within(first).getByText('Created').nextSibling).toHaveTextContent(
      '2026-10-28 09:00 UTC',
    );
    const second = await row('swarm-b');
    expect(within(second).getByText('Live keys').nextSibling).toHaveTextContent('8');
    expect(within(second).getByText('Expires').nextSibling).toHaveTextContent('Never');
    expect(within(await row('swarm-old')).getByText('Expired')).toBeDefined();
    const gone = await row('swarm-gone');
    expect(within(gone).getAllByText('Revoked')).toHaveLength(2);
    expect(within(gone).queryByRole('button')).toBeNull();
    expect(within(await region()).queryByRole('alert')).toBeNull();
  });

  it('renders the empty state with the create action', async () => {
    stub({ [LIST]: [listing()] });
    mount();
    const panel = await region();
    expect(await within(panel).findByText(/No agent pool yet/)).toBeDefined();
    expect(within(panel).getByRole('button', { name: 'Create agent pool' })).toBeDefined();
    expect(within(panel).queryByRole('list', { name: 'Agent pools list' })).toBeNull();
  });

  it('renders a failed read with retry, and recovers', async () => {
    stub({ [LIST]: [() => answer(503, {}), listing(swarm)] });
    mount();
    const panel = await region();
    expect(await within(panel).findByRole('alert')).toBeDefined();
    expect(within(panel).queryByRole('button', { name: 'Create agent pool' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Retry agent pools' }));
    expect(await row('swarm-a')).toBeDefined();
    expect(within(panel).queryByRole('alert')).toBeNull();
  });

  it('renders a failed limits read as the panel failure, never counts without it', async () => {
    stub({ [LIST]: [listing(swarm)], [LIMITS]: [() => answer(503, {}), limitsOf(3)] });
    mount();
    const panel = await region();
    expect(await within(panel).findByRole('alert')).toBeDefined();
    expect(within(panel).queryByRole('listitem', { name: 'swarm-a' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Retry agent pools' }));
    expect(await row('swarm-a')).toBeDefined();
  });

  it.each([LIST, LIMITS])('renders no panel when %s answers forbidden', async (route) => {
    const sent = stub({
      [LIST]: [listing(swarm)],
      [route]: [() => answer(403, { error: 'forbidden' })],
    });
    mount();
    await waitFor(() => {
      expect(routesOf(sent)).toContain(route);
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading agent pools…')).toBeNull();
    });
    expect(screen.queryByRole('region', { name: 'Agent pools' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['member', 'viewer'])(
    'sends no pools request and renders no panel for a %s',
    async (value) => {
      const sent = stubServer({
        'GET /api/organization/active': [role(value)],
        [LIST]: [listing(swarm)],
        [LIMITS]: [limitsOf(3)],
      });
      mount();
      await waitFor(() => {
        expect(screen.queryByText('Loading agent pools…')).toBeNull();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(routesOf(sent)).toEqual(['GET /api/organization/active']);
      expect(screen.queryByRole('region', { name: 'Agent pools' })).toBeNull();
    },
  );

  it('renders a failed role read with retry, and recovers', async () => {
    const sent = stubServer({
      'GET /api/organization/active': [() => answer(503, {}), role('super_admin')],
      [LIST]: [listing(swarm)],
      [LIMITS]: [limitsOf(3)],
    });
    mount();
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(routesOf(sent)).toEqual(['GET /api/organization/active']);
    fireEvent.click(screen.getByRole('button', { name: 'Retry agent pools' }));
    expect(await row('swarm-a')).toBeDefined();
  });

  it('gives the page up when the read says access was lost', async () => {
    const lost = vi.fn();
    stub({ [LIST]: [() => answer(403, { error: 'not_a_member' })] });
    mount(lost);
    await waitFor(() => {
      expect(lost).toHaveBeenCalledWith('removed');
    });
  });

  it("never shows the previous organization's pools after a switch", async () => {
    stubServer({ [LIST]: [listing(partlyKeyed)], [LIMITS]: [limitsOf(3)] });
    const original = vi.mocked(fetch).getMockImplementation();
    if (original === undefined) throw new Error('stub missing');
    let release: ((reply: Response) => void) | undefined;
    let reads = 0;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (addressOf(url).endsWith('/agent-pools') && reads++ === 0)
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return original(url, init);
    });
    const panelUnder = (organizationId: string) => (
      <OrganizationResourcesProvider scope={scopeOf(organizationId)}>
        <AgentPoolsPanel onAccessLost={() => undefined} />
      </OrganizationResourcesProvider>
    );
    const mounted = renderBare(panelUnder('org-a'));
    mounted.rerender(panelUnder('org-b'));
    await row('swarm-b');
    await act(async () => {
      release?.(answer(200, { pools: [swarm] }));
      await Promise.resolve();
    });
    expect(screen.getByRole('listitem', { name: 'swarm-b' })).toBeDefined();
    expect(screen.queryByRole('listitem', { name: 'swarm-a' })).toBeNull();
  });

  it('a thrown write reaches the error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stub({ [LIST]: [listing(swarm)] });
    let isBroken = false;
    const breaking: ResourceScope = {
      ...scopeOf('org-a'),
      isCurrent: () => {
        if (isBroken) throw new Error('fixture runtime fault');
        return true;
      },
    };
    render(
      <AppFaultBoundary>
        <OrganizationResourcesProvider scope={breaking}>
          <AgentPoolsPanel onAccessLost={vi.fn()} />
        </OrganizationResourcesProvider>
      </AppFaultBoundary>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke swarm-a' }));
    isBroken = true;
    fireEvent.click(screen.getByRole('button', { name: 'Revoke pool' }));
    await waitFor(() => {
      expect(document.querySelector('[data-app-fault]')).not.toBeNull();
    });
  });
});

describe('agent pools panel create', () => {
  async function openCreate() {
    fireEvent.click(
      await within(await region()).findByRole('button', { name: 'Create agent pool' }),
    );
    return screen.findByRole('dialog', { name: 'Create an agent pool' });
  }

  it('states the counts before confirming', async () => {
    stub({ [LIST]: [listing()] });
    mount();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'swarm-a' } });
    const counts = within(dialog).getByLabelText('What this creates');
    expect(counts).toHaveTextContent(
      'Creates 8 agent persons, swarm-a-1 to swarm-a-8, each with one API key, bound to your account.',
    );
    expect(counts).toHaveTextContent('The organization holds 3 of 20 agent persons; 17 more fit.');
    fireEvent.change(within(dialog).getByLabelText('Agents'), { target: { value: '1' } });
    expect(counts).toHaveTextContent('Creates 1 agent person, swarm-a-1, each');
    fireEvent.change(within(dialog).getByLabelText('Agents'), { target: { value: '101' } });
    expect(counts).toHaveTextContent('Choose from 1 to 100 agents.');
    expect(within(dialog).getByRole('button', { name: 'Create and download keys' })).toBeDisabled();
  });

  it('states the counts and holds a pool that does not fit', async () => {
    const sent = stub({ [LIST]: [listing()], [LIMITS]: [limitsOf(15)] });
    mount();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'swarm-a' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      '8 agents do not fit. Choose at most 5, or remove agent persons first.',
    );
    const submit = within(dialog).getByRole('button', { name: 'Create and download keys' });
    expect(submit).toBeDisabled();
    const form = submit.closest('form');
    if (form === null) throw new Error('the submit button has no form');
    fireEvent.submit(form);
    await act(async () => {
      await Promise.resolve();
    });
    expect(routesOf(sent)).not.toContain(CREATE);
  });

  it('creates a pool, downloads its keys exactly once and never renders them', async () => {
    const stored = vi.spyOn(Storage.prototype, 'setItem');
    const logged = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ];
    const keys = keysOf('pool-9', 'swarm-c', 3);
    const sent = stub({
      [LIST]: [listing(), listing(poolOf({ id: 'pool-9', name: 'swarm-c', size: 3 }))],
      [LIMITS]: [limitsOf(3), limitsOf(6)],
      [CREATE]: [() => answer(201, keys)],
    });
    mount();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: ' swarm-c ' } });
    fireEvent.change(within(dialog).getByLabelText('Agents'), { target: { value: '3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and download keys' }));
    const note = await screen.findByRole('status', { name: 'Keys downloaded' });
    expect(note).toHaveTextContent('Keys downloaded as pool-pool-9.keys.json');
    expect(note).toHaveTextContent(
      'Created swarm-c: 3 keys were saved to that file. They are not shown here. If no file appeared, save it again before pressing Done; after Done it cannot be saved again, and a lost file means re-keying the pool.',
    );
    expect(note).toHaveTextContent(
      'Import it with twilight-dash pool import pool-pool-9.keys.json, then delete the file.',
    );
    expect(await row('swarm-c')).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent.find((request) => request.route === CREATE)?.body).toEqual({
      name: 'swarm-c',
      size: 3,
    });
    // Proof: 2026-10-28, rendering `reply.body.agents[0].key` in the note failed
    // this line (the page held `wbs_mk_…`); calling the download twice failed
    // the `names` line below (2 files).
    expectNoKeyAnywhere(logged, stored);
    expect(downloads.names).toEqual(['pool-pool-9.keys.json']);
    expect(JSON.parse(await readBlobText(downloads.blobs[0]))).toEqual(keys);
    expect(downloads.attached).toEqual([true]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh agent pools' }));
    await row('swarm-c');
    expect(downloads.names).toHaveLength(1);
    // A refresh keeps the note: its file may still need saving.
    expect(screen.getByRole('status', { name: 'Keys downloaded' })).toBeDefined();
    expectNoKeyAnywhere(logged, stored);
  });

  it('saves the same file again without a request, and releases it on Done', async () => {
    const sent = stub({
      [LIST]: [listing()],
      [CREATE]: [() => answer(201, keysOf('pool-9', 'swarm-c', 3))],
    });
    mount();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'swarm-c' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and download keys' }));
    const note = await screen.findByRole('status', { name: 'Keys downloaded' });
    fireEvent.click(within(note).getByRole('button', { name: 'Save the file again' }));
    expect(downloads.names).toEqual(['pool-pool-9.keys.json', 'pool-pool-9.keys.json']);
    expect(downloads.hrefs[1]).toBe(downloads.hrefs[0]);
    expect(downloads.blobs).toHaveLength(1);
    expect(routesOf(sent).filter((route) => route === CREATE)).toHaveLength(1);
    expect(downloads.revoked).toEqual([]);
    fireEvent.click(within(note).getByRole('button', { name: 'Done' }));
    expect(downloads.revoked).toEqual(['blob:pool-keys-1']);
    expect(screen.queryByRole('status', { name: 'Keys downloaded' })).toBeNull();
  });

  it('releases the held file when the panel unmounts', async () => {
    stub({
      [LIST]: [listing()],
      [CREATE]: [() => answer(201, keysOf('pool-9', 'swarm-c', 3))],
    });
    mount();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'swarm-c' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and download keys' }));
    await screen.findByRole('status', { name: 'Keys downloaded' });
    expect(downloads.revoked).toEqual([]);
    cleanup();
    expect(downloads.revoked).toEqual(['blob:pool-keys-1']);
  });

  it('releases the previous file when the next write starts', async () => {
    stub({
      [LIST]: [listing(swarm)],
      [REKEY('pool-1')]: [() => answer(201, keysOf('pool-1', 'swarm-a', 8))],
      [REVOKE('pool-1')]: [
        () => answer(200, { poolId: 'pool-1', revokedCredentials: 8, removedPersons: 0 }),
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Re-key swarm-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-key and download keys' }));
    await screen.findByRole('status', { name: 'Keys downloaded' });
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke swarm-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke pool' }));
    await screen.findByText(/Revoked swarm-a/);
    expect(downloads.revoked).toEqual(['blob:pool-keys-1']);
  });

  it('a save that throws reaches the error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stub({
      [LIST]: [listing()],
      [CREATE]: [() => answer(201, keysOf('pool-9', 'swarm-c', 3))],
    });
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => {
      throw new Error('fixture: no object URLs here');
    };
    render(
      <AppFaultBoundary>
        <OrganizationResourcesProvider scope={scopeOf('org-a')}>
          <AgentPoolsPanel onAccessLost={vi.fn()} />
        </OrganizationResourcesProvider>
      </AppFaultBoundary>,
    );
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'swarm-c' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and download keys' }));
    await waitFor(() => {
      expect(document.querySelector('[data-app-fault]')).not.toBeNull();
    });
  });

  it('says the keys could not be read and rereads', async () => {
    const sent = stub({
      [LIST]: [listing(), listing(poolOf({ id: 'pool-9', name: 'swarm-c', size: 3 }))],
      [CREATE]: [() => answer(201, { pool: 'unexpected' })],
    });
    mount();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'swarm-c' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and download keys' }));
    expect(await within(await region()).findByRole('alert')).toHaveTextContent(
      'The keys could not be read; the pool may exist — refresh and re-key it.',
    );
    expect(await row('swarm-c')).toBeDefined();
    expect(routesOf(sent).filter((route) => route === LIST)).toHaveLength(2);
    expect(downloads.names).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("never saves a create's keys after an organization switch", async () => {
    stubServer({ [LIST]: [listing()], [LIMITS]: [limitsOf(3)] });
    const original = vi.mocked(fetch).getMockImplementation();
    if (original === undefined) throw new Error('stub missing');
    let release: ((reply: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (init?.method === 'POST')
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return original(url, init);
    });
    const panelUnder = (organizationId: string) => (
      <OrganizationResourcesProvider scope={scopeOf(organizationId)}>
        <AgentPoolsPanel onAccessLost={() => undefined} />
      </OrganizationResourcesProvider>
    );
    const mounted = renderBare(panelUnder('org-a'));
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'swarm-c' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and download keys' }));
    await waitFor(() => {
      expect(release).toBeDefined();
    });
    mounted.rerender(panelUnder('org-b'));
    await act(async () => {
      release?.(answer(201, keysOf('pool-9', 'swarm-c', 3)));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(downloads.names).toEqual([]);
    expect(screen.queryByRole('status', { name: 'Keys downloaded' })).toBeNull();
  });

  it('keeps the keys note when the reread hides the panel', async () => {
    stub({
      [LIST]: [listing(), () => answer(403, { error: 'forbidden' })],
      [CREATE]: [() => answer(201, keysOf('pool-9', 'swarm-c', 3))],
    });
    mount();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'swarm-c' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and download keys' }));
    const note = await screen.findByRole('status', { name: 'Keys downloaded' });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Create agent pool' })).toBeNull();
    });
    expect(within(note).getByRole('button', { name: 'Save the file again' })).toBeDefined();
    fireEvent.click(within(note).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('region', { name: 'Agent pools' })).toBeNull();
  });

  it('sends a chosen expiry as 00:00 UTC on that day', async () => {
    const sent = stub({
      [LIST]: [listing()],
      [CREATE]: [() => answer(201, keysOf('pool-9', 'swarm-c', 8))],
    });
    mount();
    const dialog = await openCreate();
    const day = new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10);
    const expiry = within(dialog).getByLabelText('Expiry (optional)');
    expect(expiry).toHaveAttribute('min', new Date(Date.now() + DAY).toISOString().slice(0, 10));
    expect(expiry).toHaveAttribute(
      'max',
      new Date(Date.now() + 89 * DAY).toISOString().slice(0, 10),
    );
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'swarm-c' } });
    fireEvent.change(expiry, { target: { value: day } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and download keys' }));
    await screen.findByRole('status', { name: 'Keys downloaded' });
    expect(sent.find((request) => request.route === CREATE)?.body).toEqual({
      name: 'swarm-c',
      size: 8,
      expiresAt: Date.parse(`${day}T00:00:00Z`),
    });
  });

  it.each([
    [
      'name_taken',
      409,
      {},
      'A live pool, a person or a credential here already has this name. Choose another name.',
    ],
    [
      'agent_person_limit',
      409,
      { cap: 20, current: 15, added: 8 },
      'This pool needs 8 agent persons, and the organization holds 15 of its 20. At most 5 fit; remove agent persons or ask an operator to raise the limit. Nothing was created.',
    ],
    ['forbidden', 403, {}, 'Only an admin can manage agent pools. Nothing was changed.'],
    [
      'invalid_body',
      400,
      {},
      'Choose a plain name of at most 60 characters that does not look like a key, from 1 to 100 agents, and an expiry up to 90 days ahead. Nothing was created.',
    ],
  ] as const)(
    'renders %s on create and keeps the draft, never as success',
    async (error, status, extra, text) => {
      stub({
        [LIST]: [listing()],
        [CREATE]: [() => answer(status, { error, ...extra })],
      });
      mount();
      const dialog = await openCreate();
      fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'swarm-a' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create and download keys' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
      expect(within(dialog).getByLabelText('Name')).toHaveValue('swarm-a');
      expect(screen.queryByRole('status', { name: 'Keys downloaded' })).toBeNull();
      expect(downloads.names).toEqual([]);
    },
  );
});

describe('agent pools panel re-key', () => {
  it('re-keys with a JSON body, {} when the expiry is kept, and states the counts first', async () => {
    const stored = vi.spyOn(Storage.prototype, 'setItem');
    const sent = stub({
      [LIST]: [listing(partlyKeyed)],
      [REKEY('pool-2')]: [() => answer(201, keysOf('pool-2', 'swarm-b', 8))],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Re-key swarm-b' }));
    const confirm = screen.getByRole('form', { name: 'Re-key swarm-b' });
    expect(confirm).toHaveTextContent(
      'Re-key swarm-b? Its 8 live keys stop working now, and 8 new keys are saved once as a file. No agent person is created. 1 agent without a live key stays keyless.',
    );
    expect(routesOf(sent)).not.toContain(REKEY('pool-2'));
    fireEvent.click(within(confirm).getByRole('button', { name: 'Re-key and download keys' }));
    const note = await screen.findByRole('status', { name: 'Keys downloaded' });
    expect(note).toHaveTextContent('Re-keyed swarm-b: 8 keys were saved to that file.');
    // The body is checked here; the proof of sending it is at the call in
    // `agent-pools-panel.tsx`.
    expect(sent.find((request) => request.route === REKEY('pool-2'))?.body).toEqual({});
    expect(downloads.names).toEqual(['pool-pool-2.keys.json']);
    expectNoKeyAnywhere([], stored);
  });

  it('sends a new expiry when one is chosen', async () => {
    const sent = stub({
      [LIST]: [listing(swarm)],
      [REKEY('pool-1')]: [() => answer(201, keysOf('pool-1', 'swarm-a', 8))],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Re-key swarm-a' }));
    const confirm = screen.getByRole('form', { name: 'Re-key swarm-a' });
    const day = new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10);
    fireEvent.change(within(confirm).getByLabelText('New expiry (optional)'), {
      target: { value: day },
    });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Re-key and download keys' }));
    await screen.findByRole('status', { name: 'Keys downloaded' });
    expect(sent.find((request) => request.route === REKEY('pool-1'))?.body).toEqual({
      expiresAt: Date.parse(`${day}T00:00:00Z`),
    });
  });

  it('offers a new expiry when the pool expired', async () => {
    const sent = stub({
      [LIST]: [listing(swarm)],
      [REKEY('pool-1')]: [
        () => answer(409, { error: 'pool_expired' }),
        () => answer(201, keysOf('pool-1', 'swarm-a', 8)),
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Re-key swarm-a' }));
    const confirm = screen.getByRole('form', { name: 'Re-key swarm-a' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Re-key and download keys' }));
    expect(await within(confirm).findByRole('alert')).toHaveTextContent(
      'This pool has expired. Choose a new expiry to re-key it.',
    );
    const expiry = within(confirm).getByLabelText('New expiry');
    expect(expiry).toBeRequired();
    expect(downloads.names).toEqual([]);
    const day = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
    fireEvent.change(expiry, { target: { value: day } });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Re-key and download keys' }));
    await screen.findByRole('status', { name: 'Keys downloaded' });
    expect(
      sent.filter((request) => request.route === REKEY('pool-1')).map((request) => request.body),
    ).toEqual([{}, { expiresAt: Date.parse(`${day}T00:00:00Z`) }]);
  });

  it('asks for a new expiry up front when the list says the pool expired', async () => {
    stub({ [LIST]: [listing(expired)] });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Re-key swarm-old' }));
    const confirm = screen.getByRole('form', { name: 'Re-key swarm-old' });
    expect(within(confirm).getByRole('alert')).toHaveTextContent('This pool has expired.');
    expect(within(confirm).getByLabelText('New expiry')).toBeRequired();
  });

  it.each([
    ['pool_changed', 409, /An agent of this pool was removed while its keys were being issued/],
    ['invalid_body', 400, 'Choose an expiry up to 90 days ahead. No key was replaced.'],
    [
      'insufficient_scope',
      403,
      'This sign-in is read-only here. Sign in to WBS again to make changes.',
    ],
  ] as const)('renders %s on re-key in place', async (error, status, text) => {
    stub({ [LIST]: [listing(swarm)], [REKEY('pool-1')]: [() => answer(status, { error })] });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Re-key swarm-a' }));
    const confirm = screen.getByRole('form', { name: 'Re-key swarm-a' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Re-key and download keys' }));
    expect(await within(confirm).findByRole('alert')).toHaveTextContent(text);
    expect(downloads.names).toEqual([]);
  });

  it('says a re-keyed pool is gone, rereads, and drops its row', async () => {
    const sent = stub({
      [LIST]: [listing(swarm, partlyKeyed), listing(partlyKeyed)],
      [REKEY('pool-1')]: [() => answer(404, { error: 'not_found' })],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Re-key swarm-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-key and download keys' }));
    expect(await within(await region()).findByRole('alert')).toHaveTextContent(
      'This pool is revoked or no longer exists. Refresh the list.',
    );
    await waitFor(() => {
      expect(screen.queryByRole('listitem', { name: 'swarm-a' })).toBeNull();
    });
    expect(routesOf(sent).filter((route) => route === LIST)).toHaveLength(2);
  });

  it('rereads after pool_expired so the row says Expired', async () => {
    const lapsed = { ...swarm, expiresAt: Date.now() - DAY };
    stub({
      [LIST]: [listing(swarm), listing(lapsed)],
      [REKEY('pool-1')]: [() => answer(409, { error: 'pool_expired' })],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Re-key swarm-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-key and download keys' }));
    const first = await row('swarm-a');
    expect(await within(first).findByText('Expired')).toBeDefined();
    expect(within(first).getByLabelText('New expiry')).toBeRequired();
  });

  it('closes a re-key whose pool the reread shows revoked', async () => {
    const gone = { ...swarm, revokedAt: Date.now(), credentials: [] };
    stub({
      [LIST]: [listing(swarm), listing(gone)],
      [REKEY('pool-1')]: [() => answer(409, { error: 'pool_changed' })],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Re-key swarm-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-key and download keys' }));
    await waitFor(() => {
      expect(
        within(screen.getByRole('listitem', { name: 'swarm-a' })).getAllByText('Revoked'),
      ).toHaveLength(2);
    });
    expect(screen.queryByRole('form', { name: 'Re-key swarm-a' })).toBeNull();
  });

  it('serializes a double-clicked re-key', async () => {
    let answerRekey: ((reply: Response) => void) | undefined;
    const sent = stub({ [LIST]: [listing(swarm)] });
    const original = vi.mocked(fetch).getMockImplementation();
    if (original === undefined) throw new Error('stub missing');
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (addressOf(url).endsWith('/rekey')) {
        sent.push({ route: REKEY('pool-1'), body: undefined });
        return new Promise<Response>((resolve) => {
          answerRekey = resolve;
        });
      }
      return original(url, init);
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Re-key swarm-a' }));
    const form = screen.getByRole('form', { name: 'Re-key swarm-a' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    await act(async () => {
      answerRekey?.(answer(201, keysOf('pool-1', 'swarm-a', 8)));
      await Promise.resolve();
    });
    await screen.findByRole('status', { name: 'Keys downloaded' });
    expect(routesOf(sent).filter((route) => route === REKEY('pool-1'))).toHaveLength(1);
    expect(downloads.names).toHaveLength(1);
  });
});

describe('agent pools panel revoke', () => {
  it('revokes without removing persons unless asked, stating the counts first', async () => {
    const sent = stub({
      [LIST]: [listing(swarm), listing({ ...swarm, revokedAt: Date.now(), credentials: [] })],
      [REVOKE('pool-1')]: [
        () => answer(200, { poolId: 'pool-1', revokedCredentials: 8, removedPersons: 0 }),
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke swarm-a' }));
    const confirm = screen.getByRole('group', { name: 'Revoke swarm-a' });
    expect(confirm).toHaveTextContent(
      'Revoke swarm-a? Its 8 live keys stop working now and their claims are released. Its 8 agent persons stay and keep counting toward the agent-person limit.',
    );
    // Proof: 2026-10-28, starting the checkbox checked failed this line (and
    // four more revoke cases); always sending `?removePersons=true` failed the
    // `search` line below (received '?removePersons=true').
    expect(
      within(confirm).getByRole('checkbox', { name: 'Also remove the 8 agent persons' }),
    ).not.toBeChecked();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke pool' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Revoked swarm-a: 8 keys no longer work.',
    );
    const request = sent.find((each) => each.route === REVOKE('pool-1'));
    expect(request?.search).toBeUndefined();
  });

  it('removes the persons when asked', async () => {
    const sent = stub({
      [LIST]: [listing(swarm), listing()],
      [REVOKE('pool-1')]: [
        () => answer(200, { poolId: 'pool-1', revokedCredentials: 8, removedPersons: 8 }),
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke swarm-a' }));
    const confirm = screen.getByRole('group', { name: 'Revoke swarm-a' });
    fireEvent.click(
      within(confirm).getByRole('checkbox', { name: 'Also remove the 8 agent persons' }),
    );
    expect(confirm).toHaveTextContent(
      'Its 8 agent persons are then removed, with their claims, assignments and credentials, releasing 8 of the agent-person limit.',
    );
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke and remove persons' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Revoked swarm-a: 8 keys no longer work, and 8 agent persons were removed.',
    );
    expect(sent.find((each) => each.route === REVOKE('pool-1'))?.search).toBe(
      '?removePersons=true',
    );
  });

  it('renders persons_not_removed as revoked with persons kept', async () => {
    stub({
      [LIST]: [listing(swarm), listing({ ...swarm, revokedAt: Date.now(), credentials: [] })],
      [REVOKE('pool-1')]: [
        () =>
          answer(409, {
            error: 'persons_not_removed',
            poolId: 'pool-1',
            revokedCredentials: 8,
          }),
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke swarm-a' }));
    const confirm = screen.getByRole('group', { name: 'Revoke swarm-a' });
    fireEvent.click(
      within(confirm).getByRole('checkbox', { name: 'Also remove the 8 agent persons' }),
    );
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke and remove persons' }));
    const kept = await screen.findByRole('status', { name: 'Revoked, persons kept' });
    expect(kept).toHaveTextContent('swarm-a is revoked; its persons were kept');
    expect(kept).toHaveTextContent(
      'Its 8 live keys no longer work, but removing its agent persons was refused, so they stay and still count toward the agent-person limit. Remove them from the Directory to release it.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(await row('swarm-a')).getAllByText('Revoked')).toHaveLength(2);
  });

  it('renders a refused revoke in place and rereads after not_found', async () => {
    const sent = stub({
      [LIST]: [listing(swarm), listing()],
      [REVOKE('pool-1')]: [() => answer(404, { error: 'not_found' })],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke swarm-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke pool' }));
    expect(await within(await region()).findByRole('alert')).toHaveTextContent(
      'This pool is revoked or no longer exists. Refresh the list.',
    );
    await waitFor(() => {
      expect(screen.queryByRole('listitem', { name: 'swarm-a' })).toBeNull();
    });
    expect(routesOf(sent).filter((route) => route === LIST)).toHaveLength(2);
  });

  it('renders insufficient_scope on revoke', async () => {
    stub({
      [LIST]: [listing(swarm)],
      [REVOKE('pool-1')]: [() => answer(403, { error: 'insufficient_scope' })],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke swarm-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke pool' }));
    expect(await within(await region()).findByRole('alert')).toHaveTextContent(
      'This sign-in is read-only here. Sign in to WBS again to make changes.',
    );
  });

  it('renders a transport failure on revoke and keeps the pool', async () => {
    stub({ [LIST]: [listing(swarm)], [REVOKE('pool-1')]: [() => answer(503, {})] });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke swarm-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke pool' }));
    expect(await within(await region()).findByRole('alert')).toBeDefined();
    expect(within(await row('swarm-a')).getByText('Live')).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
