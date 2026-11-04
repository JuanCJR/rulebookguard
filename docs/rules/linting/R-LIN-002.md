---
id: R-LIN-002
context: linting
entities: [Rule, Anchor]
status: proposed
anchors:
  - 'src/commands/lint.ts'
summary: Each anchor of a rule must match at least one file of the repository, or lint reports an error.
origin: extracted
evidence:
  - 'src/commands/lint.ts lintCatalog'
  - 'test/cli/lint.test.ts "lists every finding and exits 1 when there are errors"'
---

# Anchors must match a file

Every glob in a rule's `anchors` must match at least one file in the repository. An anchor that matches nothing is an error on the rule file. The check applies to every rule, whatever its status.

```gherkin
Scenario: An anchor that matches nothing
  Given rule R-STK-001 has the anchor "src/stock/**"
  And no file in the repository is under "src/stock/"
  When "rulebookguard lint" runs
  Then it reports the error 'anchor "src/stock/**" matches no file'
```

## Questions for the business

- Deprecated rules are checked too, so deleting the code of a deprecated rule makes lint fail. Is that intended, or should deprecated rules be exempt?
