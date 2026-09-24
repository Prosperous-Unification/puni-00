/**
 * Raw access to this browser's key-value store, and nothing else.
 *
 * A repository: it holds no decisions, does no parsing and refuses nothing.
 * Three members, because three is what the whole app uses.
 *
 * **Access errors propagate.** A store that throws on access — a browser with
 * site data blocked is the real case — throws out of these members and out of
 * {@link Preferences} above them, exactly as the hand-written stores have always
 * done. Nothing here catches it, and nothing may be made to: turning a blocked
 * store into a silent default is a behaviour change with its own intent and its
 * own negative tests. What {@link Preferences} recovers from is a *stored value
 * this app can no longer read*, which is a different thing entirely.
 */
export interface BrowserStorage {
  readonly read: (key: string) => string | null;
  readonly write: (key: string, value: string) => void;
  readonly forget: (key: string) => void;
}

/**
 * What storage holds for one key: a value, nothing at all, or something that is
 * no longer a `T`.
 *
 * Three states and not two, because one caller answers each of them
 * differently: the chart's detail switch opens **on** for a plan with dependency
 * edges when nothing is stored, and **off** when a stored answer was refused — a
 * reader who once turned it off and then hand-edited the value has still said
 * something, and it is not "show me the arrows".
 */
export type Claim<T> = { status: 'held'; value: T } | { status: 'absent' | 'refused' };

/**
 * Members are method signatures on purpose, as they were in `lib/remembered.ts`: a method's
 * parameter is checked bivariantly, so a `Remembered<string[]>` still satisfies a
 * `Remembered<readonly string[]>`, which `remembered-layout.ts` relies on. Property-style
 * functions made `write` contravariant and broke that assignment.
 */
export interface Remembered<T> {
  /** The three states, for the callers that answer `absent` and `refused` differently. */
  claim(): Claim<T>;
  /**
   * The stored value, or null when there is none to read — **writing nothing**,
   * which is what a React render is allowed to do.
   */
  read(): T | null;
  /**
   * The same read, **dropping** a key whose contents are no longer a `T`.
   *
   * The drop is the observable half of a refusal: without it the same unreadable
   * value is read again on every load, and a control that silently falls back
   * looks recovered while storage still holds the answer nobody can use.
   */
  readAndDrop(): T | null;
  write(value: T): void;
  /** Removes the key — never a default written over it. */
  forget(): void;
}

/**
 * Everything this browser remembers for its reader, over one store.
 *
 * A **resource**-service: it holds the parsing, the guard, and the one refusal
 * rule the whole app shares — a stored value that is no longer a `T` takes the
 * key with it and the caller's own default stands. Deliberately **not** rule
 * R5's "unknown is not OK" throw: every caller stores a preference, and the
 * alternative is a page nobody can open until they clear storage by hand, over
 * the colour of a stripe. The refusal **is** the recovery.
 *
 * Three shapes, because the keys in a reader's browser are already three shapes
 * and none of them may change.
 */
export interface Preferences {
  /** The store for one JSON-written key, judged by one guard. */
  readonly json: <T>(key: string, isValid: (claimed: unknown) => claimed is T) => Remembered<T>;
  /**
   * The store for one key written as **bare text** rather than as JSON.
   *
   * One caller stores a plain string — the settings modal's open section — and
   * has to keep doing so: JSON would write it with quotes, and every reader who
   * has ever opened that modal would lose the tab they were on.
   */
  readonly text: <T extends string>(
    key: string,
    isValid: (stored: string) => stored is T,
  ) => Remembered<T>;
  /**
   * The store for one bare-text key that **refuses nothing**.
   *
   * For the keys whose validity is not a shape: the remembered project id is
   * judged against the project list this load just fetched, and that rule is
   * different on every load, so there is nothing to hand a guard built once. The
   * retired chart key is the other, and it is only ever dropped. Every stored
   * string is held, the empty one included — which is what keeps the project
   * page's own cleanup reachable.
   */
  readonly unchecked: (key: string) => Remembered<string>;
}

/**
 * The named answers this browser holds, which is what delivery is given.
 *
 * A **feature**-service, and the only preferences surface a component or a hook
 * may import: rule K2 says delivery sees a feature-service and never the
 * resource beneath it. Each member is one answer over the one key that holds it,
 * so a screen never names a key and never chooses a shape.
 *
 * The guards stay with their callers rather than moving here, because each is
 * the caller's own domain rule — which three words a theme may be, which five
 * sections a settings modal has — and a registry of other modules' unions is a
 * second place for them to go stale.
 */
export interface RememberedPreferences {
  readonly themeChoice: <T extends string>(
    isValid: (claimed: unknown) => claimed is T,
  ) => Remembered<T>;
  readonly ganttDetail: Remembered<boolean>;
  /** Reached only to be dropped: its value is never looked at. */
  readonly retiredGanttArrows: Remembered<string>;
  /** Holds every string, including the empty one. Judged against the fetched list. */
  readonly lastOpenedProject: Remembered<string>;
  readonly projectSettingsSection: <T extends string>(
    projectId: string,
    isValid: (stored: string) => stored is T,
  ) => Remembered<T>;
}

/**
 * The store this module owns for the lifetime of one installation.
 *
 * A {@link BrowserStorage} that can be **revoked**: the module's disposal calls
 * `revoke`, and every later access throws. That is the whole of what the module
 * owns, and the reason it has a disposer at all — a preference written by a
 * component that outlived its runtime would reach the reader's browser after the
 * page had given that runtime up, which is a write nobody owns.
 */
export interface RevocableBrowserStorage extends BrowserStorage {
  /** Refuses every later read, write and forget on this store. Idempotent. */
  readonly revoke: () => void;
}

/**
 * Whether the runtime that owns a store is still the one a lifetime slot is
 * publishing, checked synchronously.
 *
 * `createLifetimeSlot`'s own `accept()` (`runtime/lifetime-slot.ts`) assigns its
 * published state **synchronously** — only the subscriber notification is
 * deferred to a microtask — so `() => slot.snapshot().status === 'live'` is
 * already correct the instant withdrawal is accepted, including from inside a
 * caller-supplied validator that re-enters and asks for a replacement or a
 * retirement of its own. Nothing about this predicate is specific to
 * preferences; it is named here because this module is its first caller. See
 * `preferences.resource.ts`'s `ensureLive` for what refuses once it answers
 * `false`.
 *
 * **Scoped to the slot, not to one runtime's identity.** A stale reference
 * from a runtime the slot has since *replaced* (rather than emptied) reads
 * `true` again once the newer runtime is live — this predicate answers "is
 * something live here", not "is it still me". For a `replace`d (not merely
 * `retire`d) runtime, a stale reference's own storage is what still refuses,
 * once that runtime's own disposal has revoked it (`browser-storage.repository.ts`'s
 * `REVOKED`) — see
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-d-withdrawal-and-page-lifecycle.md`
 * section 4.4 for the precedence this implies and the test that proves it.
 */
export type IsRuntimeLive = () => boolean;

/**
 * What a host graph must supply to install the preferences module.
 *
 * The raw store adapter, and a way to ask whether this installation's own
 * runtime is still live. Both are **required** registrations of the module
 * itself (`module.ts`'s `preferences` factory declares `isLive` as a
 * dependency the same way it declares `preferencesStore`): a host that omits
 * `isLive` gets `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "preferences":
 * dependency "isLive" is not registered.` — not a silent default, and not the
 * `DI_BAG_MISSING_REGISTRATION` code, which is what resolving a name nobody
 * ever registered (`preferencesStore` itself, from outside the module)
 * answers instead; see `module.ts`'s own JSDoc for that distinct case.
 * `createPreferences`'s own always-`true` default (`preferences.resource.ts`)
 * only applies to code that builds a `Preferences` directly, bypassing this
 * module — it is not a fallback the module's own DI Bag registration can use.
 * Both are requirements rather than module-private bindings so that a host
 * which forgets one is told **which module** asked: see
 * {@link PREFERENCES_LABEL}.
 */
export interface PreferencesRequirements {
  readonly browserStore: BrowserStorage;
  readonly isLive: IsRuntimeLive;
}

/**
 * What installing the preferences module adds to a host graph.
 *
 * `preferences`, the resource, is public and that is **recorded K2 debt, not
 * compliance**: delivery must take {@link RememberedPreferences}, and the only
 * reason the resource is exported is `apps/wbs/fe-01/src/lib/remembered.ts`,
 * which builds a store per project id for the layout module and so cannot be a
 * fixed named answer. The map's claim that the generic factory is "not a reason
 * to expose the resource" is half right: it is not a reason to put it in a React
 * context, and it is still the reason the module exports it.
 *
 * Since the module-load duplicate was deleted, `lib/remembered.ts` reaches this
 * export only through the page's own runtime, read from its lifetime slot at the
 * instant of each access — never through a React context, and never through an
 * instance of its own. Whether the resource then moves behind a feature of its
 * own or stays as accepted debt with that one caller named is OpenSpec task 12
 * of `adopt-frontend-lifetimes`.
 */
export interface PreferencesExports {
  readonly preferences: Preferences;
  readonly remembered: RememberedPreferences;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `frontend` is the **runtime segment**, not a ring: a module under an app is named
 * by where it runs, so the wiki module identifier is {@link PREFERENCES_MODULE_ID}
 * and the label drops the `module.` prefix. A library module carries its ring
 * instead, which is why the backend's first sealed module is
 * `application.plan-history`.
 */
export const PREFERENCES_LABEL = 'frontend.preferences';

/** The wiki module identifier, which the module index will declare. */
export const PREFERENCES_MODULE_ID = 'module.frontend.preferences';

/**
 * A refusal a delivery-layer caller may recover from, told apart from every
 * other failure a store can raise.
 *
 * Two call sites throw it, over the same two messages they always have — this
 * class changes nothing about *when* a refusal happens or what it says, only
 * whether a caller can tell it apart from an unmodelled failure without
 * matching on message text:
 *
 * - `preferences.resource.ts`'s `ensureLive`, `kind: 'withdrawn'` — the slot is
 *   not `live` right now, checked synchronously.
 * - `browser-storage.repository.ts`'s `revocableStorage`, `kind: 'revoked'` —
 *   this store's own runtime has already given it back.
 *
 * A delivery consumer (`lib/theme.ts`'s `useTheme`) catches only this class —
 * {@link isPreferenceStoreLifecycleError} — and rethrows everything else: R5's
 * rule that a catch is for modeled recovery, never a blanket swallow. A storage
 * failure that is not a lifecycle refusal (a browser with site data blocked,
 * {@link BrowserStorage}'s own JSDoc) still propagates out of a delivery call
 * site exactly as it always has.
 */
export class PreferenceStoreLifecycleError extends Error {
  readonly kind: 'withdrawn' | 'revoked';

  constructor(message: string, kind: 'withdrawn' | 'revoked') {
    super(message);
    this.name = 'PreferenceStoreLifecycleError';
    this.kind = kind;
  }
}

/** Whether a caught value is a {@link PreferenceStoreLifecycleError}, for a narrow catch. */
export function isPreferenceStoreLifecycleError(
  error: unknown,
): error is PreferenceStoreLifecycleError {
  return error instanceof PreferenceStoreLifecycleError;
}
