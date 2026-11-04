---
id: R-LIN-003
context: linting
entities: [Test, Rule]
status: proposed
anchors:
  - 'src/commands/lint.ts'
summary: A test that tags a rule id which does not exist makes lint report an error.
origin: extracted
evidence:
  - 'src/commands/lint.ts lintCatalog'
  - 'test/cli/lint.test.ts "lists every finding and exits 1 when there are errors"'
  - 'test/cli/lint.test.ts "does not report tags of a rule that fails the schema as unknown"'
---

# Tags must name an existing rule

Every `@rule <ID>` tag in a test file must name a rule of the rulebook. A tag that names no rule is an error at the tag's line. A rule whose file exists but fails validation still counts as existing, so its tags are not reported as unknown.

```gherkin
Scenario: A tag with an unknown id
  Given tests/orders_test.py tags R-XYZ-001 on line 11
  And no rule R-XYZ-001 exists
  When "rulebookguard lint" runs
  Then it reports the error "tests/orders_test.py:11 tags R-XYZ-001, which does not exist"
```

## Questions for the business

- Each occurrence of the unknown tag is reported, one finding per line. Is one finding per tag the intended granularity?
