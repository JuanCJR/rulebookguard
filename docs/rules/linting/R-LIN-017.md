---
id: R-LIN-017
context: linting
entities: [Code, Rule]
status: active
anchors:
  - 'src/commands/lint.ts'
  - 'src/format/tag.ts'
summary: Every @implements marker in code must be closed by a matching @endimplements after it, and every @endimplements must close an open @implements.
origin: extracted
evidence:
  - 'src/commands/lint.ts implementations'
  - 'src/format/tag.ts findRuleRegions'
  - 'src/catalog/tags.ts scanImplementations'
  - 'test/cli/lint.test.ts "reports broken, unknown, deprecated and misplaced regions"'
  - 'test/format/tag.test.ts "reports an unclosed @implements and a stray @endimplements"'
---

# Code regions open and close

Code that enforces a rule may be marked by a region: `@implements <ID>` before it and `@endimplements <ID>` after it. An `@implements` that is never closed is an error at its line. An `@endimplements` with no open `@implements` of the same id before it is an error at its line. Regions may nest; closing an outer region while an inner one is still open reports the inner one as unclosed. Only files that some rule anchors are checked.

```gherkin
Scenario: A code region left open and a stray end
  Given src/clients/create.go is anchored by rule R-CLI-001
  And it has "@implements R-CLI-001" on line 2 and no "@endimplements R-CLI-001"
  And it has "@endimplements R-CLI-002" on line 4 with no "@implements R-CLI-002" before it
  When "rulebookguard lint" runs
  Then it reports "src/clients/create.go:2 @implements R-CLI-001 has no matching @endimplements R-CLI-001"
  And it reports "src/clients/create.go:4 @endimplements R-CLI-002 has no open @implements R-CLI-002 before it"
  And it exits with status 1
```

## Decisions

- **D1 (2026-11-19)** Should a broken region in production code block (error), or only warn? "1" (option 1: error, as today). Decided: a broken code region is an error, the same as a broken test region.
