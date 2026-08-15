## ADDED Requirements

### Requirement: A plan can be exported as a bundled Mermaid document

A client SHALL be able to take a plan as one Markdown document holding a header
block, a Mermaid `gantt` fence of the plan's chart, and the same table
`planToMarkdown` writes, in that order. The document SHALL exist only where the
diagram exists: it SHALL be refused with the same sentence, and for the same
reason, wherever a Mermaid gantt of the plan is refused.

The header block SHALL state that the document holds the whole plan — every row
and slice, including any a collapsed branch or a running search had hidden on
screen — because the chart on screen may draw fewer.

The fence SHALL be long enough that no run of backticks anywhere in the
diagram's text, including inside a work item's name, can close it before the
diagram ends.

#### Scenario: a plan on a calendar becomes one document

- **GIVEN** a plan on a calendar with a placed slice
- **WHEN** it is exported as a bundled Mermaid document
- **THEN** the document SHALL hold, in order, a header block, a Mermaid gantt
  fence, and the exported table
- **AND** the header block SHALL state that the document holds the whole plan

#### Scenario: a plan with no start date is refused, and no document is given

- **GIVEN** a plan whose start date is not set
- **WHEN** a bundled Mermaid document is asked for
- **THEN** the answer SHALL be the same refusal a Mermaid gantt of that plan is
  given
- **AND** SHALL carry no document

#### Scenario: a task name carrying a run of backticks cannot close the fence early

- **GIVEN** a work item whose name holds three backticks
- **WHEN** the plan is exported as a bundled Mermaid document
- **THEN** the fence around the diagram SHALL use more backticks than the
  longest run inside it
- **AND** the table SHALL still follow the diagram inside that fence, not fall
  outside it as prose
