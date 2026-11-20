---
id: R-LIN-001
context: linting
entities: [Rule, Test]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: An active rule must be tagged by at least one test, or lint reports an error.
origin: extracted
evidence:
  - 'src/commands/lint.ts lintCatalog'
  - 'test/cli/lint.test.ts "lists every finding and exits 1 when there are errors"'
  - 'test/cli/lint-base.test.ts "reports only untested-rule for a changed active rule that no test tags"'
---

# Active rules need a test

Every rule with status `active` must be tagged with `@rule <ID>` in at least one file matched by `testGlobs`. If none is, lint reports an error on the rule file. An opening `@rule <ID>` counts even when its `@endrule` is missing; that case is reported only by R-LIN-005. Proposed and deprecated rules need no test.

```gherkin
Scenario: An active rule without a test
  Given rule R-ORD-002 has status "active"
  And no test file tags R-ORD-002
  When "rulebookguard lint" runs
  Then it reports the error "active rule R-ORD-002 has no test tagging it"
  And it exits with status 1
```

## Decisions

- **D1 (2026-11-19)** Is one opening tag enough to count as "tested", or should only a closed region count? "1" (option 1: an opening tag is enough, as today). Decided: an unclosed `@rule` still counts as a test; the missing `@endrule` is reported once, by R-LIN-005.
- **D2 (2026-11-19)** Is "at least one tag" the intended bar, or should the tag sit on a test that actually runs? "confirmo" (confirmation batch: stays as today). Decided: one tag in a file matched by `testGlobs` is enough; whether the test runs is the test runner's job.
