---
id: R-LIN-018
context: linting
entities: [Code, Rule]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: Code marked as implementing a rule id that does not exist makes lint report an error.
origin: extracted
evidence:
  - 'src/commands/lint.ts implementations'
  - 'test/cli/lint.test.ts "reports broken, unknown, deprecated and misplaced regions"'
  - 'test/cli/lint.test.ts "does not scan files that no rule anchors"'
---

# Code regions name an existing rule

Every `@implements <ID>` region must name a rule of the rulebook. A region that names no rule is an error at its opening line. A rule whose file exists but fails validation still counts as existing. Only files that some rule anchors are read, so a marker in a file no rule anchors is never reported.

```gherkin
Scenario: A code region with an unknown id
  Given src/clients/update.go is anchored by rule R-CLI-001
  And it has a region "@implements R-XYZ-001" … "@endimplements R-XYZ-001" starting on line 1
  And no rule R-XYZ-001 exists
  When "rulebookguard lint" runs
  Then it reports "src/clients/update.go:1 marks code as implementing R-XYZ-001, which does not exist"
  And it exits with status 1

Scenario: A marker in a file no rule anchors
  Given README.md has the marker "@implements R-XYZ-001"
  And no rule anchors README.md
  When "rulebookguard lint" runs
  Then it reports nothing about README.md
```

## Decisions

- **D1 (2026-11-19)** Markers in files that no rule anchors are not checked at all. Is that intended, or should every file of the repository be checked? "2" (option 2: only files some rule anchors, as today). Decided: lint reads code markers only in files that some rule anchors; a marker elsewhere is not reported. This also limits R-LIN-020.
