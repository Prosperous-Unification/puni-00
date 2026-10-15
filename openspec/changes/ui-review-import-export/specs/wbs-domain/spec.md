## ADDED Requirements

### Requirement: A refused copy names the download that saves the same thing

When the clipboard is absent or refuses the write, Copy as Markdown and Copy as
Mermaid SHALL each say so in an error toast that names Download as Markdown,
the Export menu item whose file holds the Markdown table and the Mermaid chart.
Neither SHALL point at the CSV.

#### Scenario: a refused Markdown copy

- **WHEN** the browser refuses the clipboard on Copy as Markdown
- **THEN** the toast reads `The browser refused the clipboard, so nothing was copied. Use Download as Markdown instead.`

#### Scenario: a refused Mermaid copy

- **WHEN** the browser refuses the clipboard on Copy as Mermaid
- **THEN** the toast reads `The browser refused the clipboard, so nothing was copied. Download as Markdown saves the same Mermaid chart.`
