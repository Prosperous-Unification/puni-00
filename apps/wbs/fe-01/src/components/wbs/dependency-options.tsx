import type { CSSProperties, FocusEvent, MouseEvent } from 'react';

import { REFUSAL_SUFFIX } from './dep-picker';
import type { DependencyOption, EndpointOption } from './dependency-selection';
import { statusStripStyle } from './depends-card';
import { DEP_LIST_WIDTH } from './plan-cell-props';
import type { DependencySearch } from './use-dependency-search';

/** The actual table and phone share project/endpoint actions and visible lookup outcomes. */
export function DependencyOptions({
  search,
  onChoose,
  onCustomize,
  activeKey,
  label = 'Dependency choices',
  id,
  style,
  isPending = () => false,
  phone = false,
  onLeave,
  onReturnFocus,
}: {
  phone?: boolean;
  onLeave?: () => void;
  onReturnFocus?: () => void;
  search: DependencySearch;
  onChoose: (option: EndpointOption) => void;
  onCustomize: (option: EndpointOption) => void;
  activeKey?: string;
  label?: string;
  id?: string;
  style?: CSSProperties;
  isPending?: (key: string) => boolean;
}) {
  const choose = (option: DependencyOption) => {
    if (option.kind === 'project') search.chooseProject(option.project);
    else onChoose(option);
  };
  const Option = phone ? 'button' : 'span';
  const desktopInteractions = phone
    ? {}
    : {
        onBlur: (event: FocusEvent<HTMLUListElement>) => {
          const target = event.relatedTarget;
          if (
            target instanceof HTMLElement &&
            (event.currentTarget.contains(target) ||
              target.closest('.typed-dependency-editor') !== null)
          )
            return;
          onLeave?.();
        },
        onMouseDown: (event: MouseEvent<HTMLUListElement>) => {
          event.preventDefault();
        },
      };
  return (
    <ul
      {...desktopInteractions}
      // Proof: CI browser shard 2 could not find the phone's named Rows list when it became a listbox.
      role={phone ? 'list' : 'listbox'}
      aria-label={label}
      id={id}
      className={
        phone ? 'm-0 flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto p-0' : undefined
      }
      style={style}
      ref={(list) => {
        if (list === null || phone) return;
        const room = window.innerWidth - list.getBoundingClientRect().left - 8;
        list.style.maxWidth = `${String(Math.max(DEP_LIST_WIDTH, room))}px`;
      }}
    >
      {search.options.map((option) => (
        <li
          key={option.key}
          className={phone ? 'flex min-w-0 items-center gap-2' : undefined}
          style={
            phone
              ? undefined
              : {
                  display: 'flex',
                  alignItems: 'center',
                  ...(option.kind === 'endpoint' && option.status !== undefined
                    ? statusStripStyle(option.status)
                    : {}),
                }
          }
          role="presentation"
          data-status={option.kind === 'endpoint' ? option.status : undefined}
        >
          <Option
            type={phone ? 'button' : undefined}
            disabled={
              phone &&
              option.kind === 'endpoint' &&
              (option.refusal !== undefined || isPending(option.key))
            }
            data-card-depends-option={
              phone && option.kind === 'endpoint'
                ? option.selection.kind === 'remote'
                  ? option.selection.candidate.number
                  : option.label.split(' - ')[0]
                : undefined
            }
            data-refusal={option.kind === 'endpoint' ? option.refusal : undefined}
            className={
              phone
                ? 'border-control-edge flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md border px-3 text-left disabled:opacity-50'
                : undefined
            }
            id={`dep-option-${option.key}`}
            role={phone ? undefined : 'option'}
            tabIndex={phone ? undefined : -1}
            ref={(element) => {
              // jsdom omits scrollIntoView; real options keep keyboard highlights in view.
              if (
                option.key === activeKey &&
                element !== null &&
                typeof element.scrollIntoView === 'function'
              )
                element.scrollIntoView({ block: 'nearest' });
            }}
            style={
              phone
                ? undefined
                : {
                    padding: '2px 6px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                    flex: '0 1 auto',
                    cursor:
                      option.kind === 'endpoint' && option.refusal !== undefined
                        ? 'default'
                        : 'pointer',
                    color:
                      option.kind === 'endpoint' && option.refusal !== undefined
                        ? 'var(--muted-foreground)'
                        : undefined,
                  }
            }
            aria-selected={option.key === activeKey}
            aria-disabled={
              option.kind === 'endpoint' && (option.refusal !== undefined || isPending(option.key))
            }
            aria-label={
              option.kind === 'project'
                ? `Project ${option.project.abbreviation} - ${option.project.name}`
                : `${option.label}${option.refusal === undefined ? '' : ` — ${REFUSAL_SUFFIX[option.refusal]}`}`
            }
            // Proof: CI browser shard 3 failed the existing overflow assertion when this title was absent.
            title={
              option.kind === 'project'
                ? `Project ${option.project.abbreviation} - ${option.project.name}`
                : `${option.label}${option.refusal === undefined ? '' : ` — ${REFUSAL_SUFFIX[option.refusal]}`}`
            }
            onClick={() => {
              if (
                option.kind === 'project' ||
                (option.refusal === undefined && !isPending(option.key))
              )
                choose(option);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.currentTarget.click();
              }
            }}
          >
            {option.kind === 'project'
              ? `Project ${option.project.abbreviation} - ${option.project.name}`
              : `${option.label}${option.refusal === undefined ? '' : ` — ${REFUSAL_SUFFIX[option.refusal]}`}`}
          </Option>
          {option.kind === 'endpoint' && (
            <button
              type="button"
              className={
                phone
                  ? 'border-control-edge min-h-11 min-w-11 shrink-0 rounded-md border px-3'
                  : 'typed-dependency-customize'
              }
              aria-label={`Customize ${option.label}`}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onReturnFocus?.();
                }
              }}
              onClick={() => {
                onCustomize(option);
              }}
            >
              {phone ? '›' : null}
            </button>
          )}
        </li>
      ))}
      {search.state === 'loading' && <li role="status">Loading dependency choices…</li>}
      {search.state === 'empty' && <li role="status">No matching dependency choices.</li>}
      {/* Proof: omitting this outcome hid current cancellation in the mounted actual field probe. */}
      {search.state === 'cancelled' && (
        <li role="status">
          Dependency lookup cancelled.{' '}
          <button type="button" onClick={search.retry}>
            Retry lookup
          </button>
        </li>
      )}
      {search.state === 'failure' && (
        <li role="alert">
          {search.message}{' '}
          <button type="button" onClick={search.retry}>
            Retry lookup
          </button>
        </li>
      )}
      {search.state === 'refused' && <li role="alert">Lookup refused: {search.message}</li>}
      {search.state === 'stale' && (
        <li role="alert">
          Addresses changed; refresh choices.{' '}
          <button type="button" onClick={search.retry}>
            Refresh choices
          </button>
        </li>
      )}
      {search.more !== null && (
        <li role="presentation">
          <button type="button" onClick={search.more}>
            More choices
          </button>
        </li>
      )}
    </ul>
  );
}
