## ADDED Requirements

### Requirement: Production reset shell command

The command SHALL open the production operator reset URL in the default browser or print it with `--print`. It SHALL show help with `-h` and `--help` and refuse unsupported options before opening a browser.

#### Scenario: The operator selects their own browser

- **WHEN** the operator runs the command with `--print`
- **THEN** it prints the production reset URL without opening a browser or retrieving credentials
