import { column } from './column';

/** Builds the finish column from the immutable reading attached to each row. */
export function createFinishColumn() {
  return column.display({
    id: 'finish',
    header: () => <span>End</span>,
    cell: ({ row }) => {
      const { finish, hasSchedule } = row.original.readings;
      // Both facts in one `title`, because a cell has one: the day in full,
      // and — where the figure is a guess — what the marker beside it means.
      const unestimated = row.original.schedule !== null && !row.original.schedule.estimated;
      const said = [finish.iso, unestimated ? 'No estimate yet' : null]
        .filter((part) => part !== null)
        .join(' — ');
      return (
        <span data-finish data-fact={said === '' ? undefined : said}>
          {finish.text}
          {hasSchedule && unestimated ? ' ?' : ''}
        </span>
      );
    },
  });
}
