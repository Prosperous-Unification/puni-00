## ADDED Requirements

### Requirement: Commands refuse several types

Patch and batch commands, over HTTP and MCP, SHALL keep the `typeIds` and `typeRefs` list shapes and SHALL refuse a list of more than one with the typed 4xx `work_item_takes_one_type`, writing nothing in that request or batch. A list of zero or one SHALL replace the work item's types. Undo and redo SHALL restore the exact prior type set, including a type conflict, and a batch SHALL apply the one-type check to the state produced by its earlier commands.

#### Scenario: Two types in one request are refused

- **WHEN** a patch carries two `typeIds`
- **THEN** it is refused with `work_item_takes_one_type` and the work item is unchanged

#### Scenario: Successive single-type patches replace

- **GIVEN** a work item typed `Story`
- **WHEN** a batch patches it to `Spike` and then to `Epic`
- **THEN** it carries `Epic` only

#### Scenario: An MCP batch is atomic

- **GIVEN** a batch whose third command patches a work item with two `typeRefs`
- **WHEN** the batch runs
- **THEN** it is refused naming the third command and the first two are not applied
