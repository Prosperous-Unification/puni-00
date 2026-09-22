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
 * What a host graph must supply to install the preferences module.
 *
 * The raw store adapter and nothing else. It is the host's because reaching this
 * browser's own key-value store is the page's infrastructure, and it is a
 * requirement rather than a module-private binding so that a host which forgets
 * it is told **which module** asked: see {@link PREFERENCES_LABEL}.
 */
export interface PreferencesRequirements {
  readonly browserStore: BrowserStorage;
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
