/** The placement facts a work item is numbered from. */
export interface WorkItemPlacement {
  id: string;
  parentId: string | null;
  position: number;
  frozenNumber: string | null;
}

/**
 * The labels one sibling group takes, in position order.
 *
 * Roots read `010`, `020`, `030` — leading zero so `010` sorts before `100`,
 * trailing zero so `011` can be inserted later without disturbing either
 * neighbour. Children read `1`, `2`, `3` and are joined to their parent's number
 * with a dot.
 *
 * Both widen by the same rule, and the rule exists because the sort is
 * byte-wise: at ten children `010.10` would otherwise sort second, between
 * `010.1` and `010.2`. Width is whatever the highest label needs, so a tenth
 * child takes the whole group to `010.01`–`010.10` and a hundredth root takes
 * every root to `0010`–`1000`.
 */
function labelsFor(count: number, isRoot: boolean): string[] {
  const step = isRoot ? 10 : 1;
  const highest = count * step;
  // Roots never drop below three characters: `010` is the agreed shape even
  // when a project holds one work item.
  const width = isRoot ? Math.max(3, String(highest).length) : String(highest).length;
  return Array.from({ length: count }, (_, i) => String((i + 1) * step).padStart(width, '0'));
}

/** The last segment of a number — the part that belongs to one sibling group. */
function labelOf(number: string, isRoot: boolean): string {
  if (isRoot) return number;
  const segments = number.split('.');
  return segments[segments.length - 1] ?? number;
}

/**
 * A label that sorts strictly before `upper`, used when a work item is added
 * above the first frozen anchor in its group.
 *
 * It walks to the first non-zero digit and steps it down, so `010` yields `005`.
 * A group whose first anchor is all zeros has nothing below it, and that throws
 * rather than returning something that sorts equal.
 */
function below(upper: string): string {
  for (let i = 0; i < upper.length; i++) {
    const digit = upper.charCodeAt(i) - 48;
    if (digit > 0) return `${upper.slice(0, i)}${String(digit - 1)}5`;
  }
  throw new Error(`no label sorts before ${upper}`);
}

/**
 * A label strictly between two others, for a work item inserted between frozen
 * anchors that leave no natural label free.
 *
 * Digit by digit: where the two differ by more than one, take the middle digit;
 * where they are adjacent, keep the lower and append, which is why `010` and
 * `011` yield `0105`. This is the same trick as the numbering scheme itself, so
 * the space between any two numbers is never exhausted.
 */
function between(lower: string, upper: string): string {
  let prefix = '';
  for (let i = 0; ; i++) {
    const low = i < lower.length ? lower.charCodeAt(i) - 48 : -1;
    const high = i < upper.length ? upper.charCodeAt(i) - 48 : 10;
    if (low === high) {
      prefix += String(low);
      continue;
    }
    if (high - low > 1) return prefix + String(Math.floor((low + high) / 2));
    // Adjacent digits do not mean no room: between `010` and `020` the tail of
    // the lower number still has `011` free. Stepping its last digit is tried
    // first and kept only if it still sorts below the ceiling; between `010` and
    // `011` it does not, and appending is the only way down.
    const stepped = stepLastDigit(lower);
    if (stepped < upper) return stepped;
    const appended = `${lower}5`;
    if (appended < upper) return appended;
    // Neither fits. This happens when two frozen anchors sit at different widths
    // — `010` beside `0100` — and nothing digit-shaped sorts between them.
    // Throwing beats returning a number that would sort into the wrong place:
    // that number would look deliberate and could reach an exported ticket.
    throw new Error(`no label sorts between ${lower} and ${upper}`);
  }
}

/** `010` becomes `011`; `019`, having no room in its last digit, becomes `0195`. */
function stepLastDigit(label: string): string {
  const last = label.charCodeAt(label.length - 1) - 48;
  if (last >= 9) return `${label}5`;
  return `${label.slice(0, -1)}${String(last + 1)}`;
}

/**
 * Every work item's number, keyed by id.
 *
 * Pure, and given the whole project at once, because a number is a fact about a
 * work item's place among its siblings rather than about the work item. It reads
 * only `parentId` and `position` and never a number it previously produced, so a
 * wrong number is repaired by running this again — which is what makes deleting
 * a work item safe to follow with a plain re-derivation.
 *
 * A `frozenNumber` is reported verbatim. It still takes part in ordering through
 * its last segment, so an unfrozen sibling inserted beside it lands in the right
 * place, but the number itself is never rebuilt.
 */
export function deriveNumbers(placements: readonly WorkItemPlacement[]): Map<string, string> {
  const childrenOf = new Map<string | null, WorkItemPlacement[]>();
  for (const placement of placements) {
    const group = childrenOf.get(placement.parentId) ?? [];
    group.push(placement);
    childrenOf.set(placement.parentId, group);
  }
  for (const group of childrenOf.values()) group.sort((a, b) => a.position - b.position);

  const numbers = new Map<string, string>();
  const numberGroup = (parentId: string | null, parentNumber: string | null): void => {
    const group = childrenOf.get(parentId) ?? [];
    const isRoot = parentNumber === null;
    const natural = labelsFor(group.length, isRoot);
    const frozenLabels = group.map((placement) =>
      placement.frozenNumber === null ? null : labelOf(placement.frozenNumber, isRoot),
    );

    let nextNatural = 0;
    let previous: string | null = null;
    group.forEach((placement, i) => {
      const label = frozenLabels[i] ?? claimLabel();
      // A stored number is reported exactly as it was written down, never
      // rebuilt from the current parent. Rebuilding is how a frozen `010.1.1`
      // became `010.1` when its parent was promoted — colliding with a frozen
      // sibling and pointing one exported ticket number at two work items.
      // The label still drives ordering among siblings; only the reported
      // number differs.
      const number = placement.frozenNumber ?? (isRoot ? label : `${parentNumber}.${label}`);
      previous = label;
      numbers.set(placement.id, number);
      numberGroup(placement.id, number);

      function claimLabel(): string {
        // The next frozen anchor is the ceiling: whatever this work item takes
        // has to sort below a number that has already left the tool.
        const ceiling = frozenLabels.slice(i + 1).find((l) => l !== null) ?? null;
        while (nextNatural < natural.length) {
          const candidate = natural[nextNatural] ?? '';
          if (ceiling !== null && candidate >= ceiling) break;
          nextNatural++;
          if (previous === null || candidate > previous) return candidate;
        }
        if (previous === null && ceiling !== null) return below(ceiling);
        if (previous !== null && ceiling !== null) return between(previous, ceiling);
        // No ceiling and every natural label used or too low: extend the last
        // one, which always sorts after it.
        return `${previous ?? natural.at(0) ?? '010'}5`;
      }
    });
  };
  numberGroup(null, null);

  // Every work item must have been reached. One that was not is either an
  // orphan — its `parentId` names a work item outside this project — or part of
  // a parent cycle, and both mean the caller is holding something that is not a
  // tree. Returning the reachable ones would hand back a project silently
  // missing rows, and a cycle would not even return.
  if (numbers.size !== placements.length) {
    const unreachable = placements.filter((p) => !numbers.has(p.id)).map((p) => p.id);
    throw new Error(`work items unreachable from any root: ${unreachable.join(', ')}`);
  }

  return numbers;
}

/**
 * What the scheduler reads off a work item: where it sits, and how it ranks.
 *
 * `apps/libs/domain/src/schedule.ts` is 2,200 lines of pure planning that
 * imported one type from the storage barrel and used it for this and nothing
 * else. Declaring what it needs — rather than the row it happened to be handed —
 * is what lets the engine live beside the rules it already shares
 * (`snapWorkdays`, `ASSUMED_SLICE_WORKDAYS`, `DependencyReach`) instead of on
 * the far side of a repository.
 *
 * **Extends {@link WorkItemPlacement} rather than restating three fields.** The
 * engine numbers the rows it schedules — `schedule.ts` calls
 * {@link deriveNumbers} on the way past — so it needs everything numbering
 * needs, plus the priority the leveller ranks by. The first draft named `id`,
 * `parentId` and `priority` alone and the compiler refused it on exactly that
 * call.
 *
 * `WorkItem` satisfies this structurally, so every caller keeps passing the rows
 * it already has and nothing maps anything.
 */
export interface PlannedRow extends WorkItemPlacement {
  priority: number | null;
}
