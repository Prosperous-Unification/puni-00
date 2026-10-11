# Dependent bar explanation source ownership

`gantt-calendar-axis` remains the active `MODIFIED` owner of "A bar explains itself and finds its row". Its four-scenario replacement binds the caret's position to the calendar scale and keeps a bar's spoken dates on workday arithmetic. The canonical three-scenario predecessor and archived `gantt-view` source stay unchanged.

`gantt-bar-hover` adds the distinctly scoped requirement "A bar's explanation uses the shared accessible surface". Its five scenarios refine that calendar contract after the axis change: the floor sentence appears in the shared surface and accessible label on hover or focus; click still navigates; the not-before caret keeps its own `<title>` at the calendar position; the bar's dates remain workday arithmetic printed through `shortIsoDate`. Its other four `ADDED` requirements remain intact.

The older `MODIFIED` block described the eventual combined product state, but two active full-text replacements for one title cannot both own it in the source selector. This source split preserves both obligations as separate operations without selecting a winner by path order. It does not archive either packet or satisfy the calendar 7.3 and hover 6.2 human review tasks. The unperformed enrichment-inside-`columns` remount negative in `verify.md` remains incomplete.
