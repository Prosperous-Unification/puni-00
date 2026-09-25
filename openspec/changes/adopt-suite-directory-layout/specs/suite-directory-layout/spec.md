## ADDED Requirements

### Requirement: A declared suite holds its products one directory deeper

The namespace layout gate SHALL read a declared list of suite directories under `apps/`. An
application under a listed suite SHALL sit at exactly `apps/<suite>/<product>/<project>`, carry
`product:<product>` and be named `<product>-<project>` unless a name exception names its exact
root. An application under any other directory SHALL keep the `apps/<product>/<project>` shape.

#### Scenario: A suite product is accepted

- **WHEN** a project at `apps/twilight-structure/twilight-probe/cli` is named `twilight-probe-cli`
  and tagged `product:twilight-probe`
- **THEN** the layout gate reports no violation

#### Scenario: A suite project claims the suite as its product

- **WHEN** the same root carries `product:twilight-structure` and the name
  `twilight-structure-twilight-probe`
- **THEN** the gate names the directory product `twilight-probe` and the expected name
  `twilight-probe-cli`

#### Scenario: A suite project sits at the wrong depth

- **WHEN** a project sits at `apps/twilight-structure/cli`, or one directory below a suite
  product's project
- **THEN** the gate refuses each root as not `apps/<suite>/<product>/<project>` in suite
  `twilight-structure`

#### Scenario: An undeclared directory is not a suite

- **WHEN** a project sits at `apps/probe-suite/probe/cli`
- **THEN** the gate refuses it as not `apps/<product>/<project>`

### Requirement: A suite product keeps its lint policy beside it

Product lint policy discovery SHALL load `apps/<suite>/<product>/eslint.product.mjs` for every
product directory of a declared suite and SHALL refuse an `eslint.product.mjs` placed directly in
a suite directory, naming the file. Nx SHALL declare every suite product's policy as a lint cache
input.

#### Scenario: A suite product's policy applies

- **WHEN** `apps/twilight-structure/probe/eslint.product.mjs` forbids an import that
  `apps/twilight-structure/probe/app` makes
- **THEN** that project's real Nx lint fails on the forbidden import

#### Scenario: A policy sits in the suite directory itself

- **WHEN** `apps/twilight-structure/eslint.product.mjs` exists
- **THEN** lint fails naming that file instead of reading it or passing over it

### Requirement: Twilight Burokrat lives in the Twilight Structure suite

Twilight Burokrat's command-line project, consumer template and product lint policy SHALL live
under `apps/twilight-structure/twilight-burokrat`, keeping the Nx name `twilight-burokrat`, the
tag `product:twilight-burokrat`, the npm name, the bin names and the packed file list unchanged.
A name exception SHALL name exactly its root and SHALL be reported once no project occupies it.

#### Scenario: The workspace passes the layout gate after the move

- **WHEN** the layout gate reads the real workspace
- **THEN** it reports no violation and no stale exception

#### Scenario: The packed package is the same package

- **WHEN** the package suite packs the moved project
- **THEN** the tarball is `twilight-burokrat-0.1.0.tgz` and lists the same files as before the move

### Requirement: The retired apps/wiki root survives only in historical records

Every file the repository tracks or would track SHALL be free of the `apps/wiki` root except the
listed historical records and the listed dated proofs, no file SHALL remain under `apps/wiki/`,
and every listed excuse SHALL still excuse exactly what it names.

#### Scenario: A current file names the retired root

- **WHEN** a current document or source file contains `apps/wiki/`
- **THEN** the check fails naming that file and line

#### Scenario: A file is left under the retired root

- **WHEN** any file exists under `apps/wiki/`, whatever it contains
- **THEN** the check fails naming that path

#### Scenario: An excuse no longer matches

- **WHEN** a listed file holds more or fewer occurrences than its excuse counts, or a listed
  historical prefix holds none
- **THEN** the check fails naming that excuse
