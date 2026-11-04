---
id: R-LIN-001
context: linting
entities: [Rule, Test]
status: proposed
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

Every rule with status `active` must be tagged with `@rule <ID>` in at least one file matched by `testGlobs`. If none is, lint reports an error on the rule file. Proposed and deprecated rules need no test.

```gherkin
Scenario: An active rule without a test
  Given rule R-ORD-002 has status "active"
  And no test file tags R-ORD-002
  When "rulebookguard lint" runs
  Then it reports the error "active rule R-ORD-002 has no test tagging it"
  And it exits with status 1
```

## Questions for the business

- The check counts a bare `@rule` tag even when its `@endrule` is missing (that case is reported separately by R-LIN-005). Is one opening tag enough to count as "tested", or should only a closed region count?
- Is "at least one tag" the intended bar, or should the tag sit on a test that actually runs?
