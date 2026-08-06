import { useState } from 'react';

export interface PickableEntry {
  id: string;
  name: string;
  /** Shown after the name, greyed — a person's teams, say. */
  detail?: string;
}

export interface CreatablePickerProps {
  label: string;
  /** Everything on offer, in the order the server sent it. */
  entries: readonly PickableEntry[];
  /** The chosen entry's id, or null. */
  value: string | null;
  onChoose: (id: string) => void;
  /** Called with a name that is not in the list. The caller creates it and chooses it. */
  onCreate: (name: string) => void;
  onClear: () => void;
  placeholder?: string;
}

/**
 * A combobox you can also type a new entry into — the "Jira label" shape Dany
 * asked for on 2026-08-06.
 *
 * Filtering is a case-insensitive substring, the same rule the dependency and
 * project pickers use; three pickers side by side that filter differently is a
 * surprise with nothing to gain from it. Order is the order given, always.
 *
 * "Add" appears only when what has been typed matches no entry **exactly**.
 * Offering it beside an exact match is how a list grows a second `Platform`
 * with a trailing space, and be-01 is idempotent by name precisely because
 * that will still happen from two browsers at once.
 */
export function CreatablePicker({
  label,
  entries,
  value,
  onChoose,
  onCreate,
  onClear,
  placeholder,
}: CreatablePickerProps) {
  /** What has been typed, or null while the picker is closed. */
  const [typed, setTyped] = useState<string | null>(null);

  // Derived from the label so two pickers in one row do not share an id.
  const listId = `creatable-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const chosen = entries.find((entry) => entry.id === value);
  const wanted = typed === null ? '' : typed.trim().toLowerCase();
  const offered =
    typed === null
      ? []
      : entries.filter((entry) => wanted === '' || entry.name.toLowerCase().includes(wanted));
  const exact = entries.some((entry) => entry.name.toLowerCase() === wanted);
  const canCreate = typed !== null && wanted !== '' && !exact;
  const open = typed !== null && (offered.length > 0 || canCreate);

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <input
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        placeholder={placeholder}
        size={14}
        style={{ font: 'inherit' }}
        value={typed ?? chosen?.name ?? ''}
        onFocus={() => {
          setTyped('');
        }}
        // A blur discards the typing and shows the choice again. It does not
        // create anything: leaving a field is not a decision to add a team to
        // a list everybody shares.
        onBlur={() => {
          setTyped(null);
        }}
        onChange={(e) => {
          setTyped(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setTyped(null);
            return;
          }
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (typed === null) return;
          const first = offered.at(0);
          if (first !== undefined) {
            onChoose(first.id);
            setTyped(null);
            return;
          }
          if (canCreate) {
            onCreate(typed.trim());
            setTyped(null);
          }
        }}
      />
      {chosen !== undefined && typed === null && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          title="Clear"
          onClick={onClear}
          style={{ marginLeft: 2 }}
        >
          ✕
        </button>
      )}
      {open && (
        <ul
          role="listbox"
          id={listId}
          aria-label={label}
          // One preventDefault for the whole list, options included, by
          // bubbling: a mousedown here must not blur the input, or the list
          // would close before the click could land.
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            margin: 0,
            padding: 0,
            listStyle: 'none',
            background: '#fff',
            border: '1px solid #ccc',
            maxHeight: 200,
            overflowY: 'auto',
            zIndex: 15,
            minWidth: '100%',
          }}
        >
          {offered.map((entry) => (
            // The ARIA combobox pattern is the boundary that makes this safe:
            // options are not focusable and the keyboard drives them from the
            // input above.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={entry.id}
              role="option"
              aria-selected={entry.id === value}
              style={{ padding: '2px 6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => {
                onChoose(entry.id);
                setTyped(null);
              }}
            >
              {entry.name}
              {entry.detail !== undefined && (
                <span style={{ color: '#666' }}> — {entry.detail}</span>
              )}
            </li>
          ))}
          {canCreate && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              role="option"
              aria-selected={false}
              style={{ padding: '2px 6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => {
                onCreate(typed.trim());
                setTyped(null);
              }}
            >
              Add “{typed.trim()}”
            </li>
          )}
        </ul>
      )}
    </span>
  );
}
