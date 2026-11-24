---
id: R-LIN-019
context: linting
entities: [Code, Rule]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: Code marked as implementing a deprecated rule makes lint report an error that names the replacing rule when there is one.
origin: extracted
evidence:
  - 'src/commands/lint.ts implementations'
  - 'src/commands/lint.ts lintCatalog'
  - 'test/cli/lint.test.ts "reports broken, unknown, deprecated and misplaced regions"'
---

# Code regions must not name a deprecated rule

Code may not keep a region of a rule whose status is `deprecated`. Lint reports an error at the region's opening line. When a rule that is not itself deprecated supersedes the deprecated one, the hint tells to mark the code with that rule instead; otherwise it tells to mark it with the rule that replaces it, or to remove the region.

```gherkin
Scenario: A code region of a deprecated rule with no successor
  Given rule R-CLI-003 is deprecated and no live rule supersedes it
  And src/clients/legacy/import.go has a region of R-CLI-003 starting on line 1
  When "rulebookguard lint" runs
  Then it reports "src/clients/legacy/import.go:1 marks code as implementing R-CLI-003, which is deprecated"
  And the hint is "mark the code with the rule that replaces R-CLI-003, or remove the region"
  And it exits with status 1
```

## Decisions

- **D1 (2026-11-19)** Should a code region marked with a deprecated rule block, or only warn during a migration? "1" (option 1: error, as today). Decided: it stays an error that names the replacing rule; deprecating a rule means updating its code regions in the same change.
