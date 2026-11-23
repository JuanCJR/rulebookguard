---
id: R-LIN-020
context: linting
entities: [Code, Rule, Anchor]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: Code may be marked as implementing a rule only in a file that the rule itself anchors, or lint reports an error.
origin: extracted
evidence:
  - 'src/commands/lint.ts implementations'
  - 'test/cli/lint.test.ts "reports broken, unknown, deprecated and misplaced regions"'
  - 'test/cli/lint.test.ts "accepts a closed region of a rule whose anchors match the file"'
---

# Code regions sit inside the rule's anchors

A rule's `@implements` region must be in a file that one of that rule's own `anchors` matches. A region in a file that only other rules anchor is an error at its opening line, and the hint tells to add an anchor to the rule or to move the region. A closed region in a file the rule anchors is accepted. A file that no rule anchors is not read, so a region there is not reported (R-LIN-018).

```gherkin
Scenario: A region in a file the rule does not anchor
  Given rule R-CLI-001 anchors "src/clients/**"
  And rule R-BIL-001 anchors "src/billing/**"
  And src/billing/tax.go has a region of R-CLI-001 starting on line 1
  When "rulebookguard lint" runs
  Then it reports "src/billing/tax.go:1 marks code as implementing R-CLI-001, but no anchor of R-CLI-001 matches this file"
  And it exits with status 1
```
