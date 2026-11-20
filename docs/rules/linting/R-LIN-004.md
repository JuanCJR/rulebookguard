---
id: R-LIN-004
context: linting
entities: [Test, Rule]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: A test that tags a deprecated rule makes lint report an error that names the replacing rule when there is one.
origin: extracted
evidence:
  - 'src/commands/lint.ts lintCatalog'
  - 'test/cli/lint.test.ts "lists every finding and exits 1 when there are errors"'
  - 'test/cli/lint.test.ts "names the superseding rule in the hint of a deprecated tag"'
---

# Tags must not name a deprecated rule

A test may not keep tagging a rule whose status is `deprecated`. Lint reports an error at the tag's line. When a rule that is not itself deprecated supersedes the deprecated one, the hint tells to tag that rule instead.

```gherkin
Scenario: A tag on a superseded rule
  Given rule R-ORD-003 is deprecated
  And rule R-ORD-001 supersedes R-ORD-003
  And tests/orders_test.py tags R-ORD-003 on line 6
  When "rulebookguard lint" runs
  Then it reports the error "tests/orders_test.py:6 tags R-ORD-003, which is deprecated"
  And the hint is "tag R-ORD-001, which supersedes R-ORD-003, instead"
```

## Decisions

- **D1 (2026-11-19)** Should a test tagged with a deprecated rule block, or only warn during a migration? "1" (option 1: error, as today). Decided: it stays an error that names the replacing rule; deprecating a rule means updating its tags in the same change.
