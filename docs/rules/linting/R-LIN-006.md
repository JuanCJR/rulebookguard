---
id: R-LIN-006
context: linting
entities: [Rule]
status: proposed
anchors:
  - 'src/commands/lint.ts'
summary: A rule's dependsOn and conflictsWith may only name other rules that exist, or lint reports an error.
origin: extracted
evidence:
  - 'src/commands/lint.ts ruleRelations'
  - 'test/cli/lint.test.ts "reports a reference to an unknown rule or to the rule itself"'
---

# Relations name other existing rules

Each id in `dependsOn` or `conflictsWith` must be the id of another rule in the rulebook. Naming the rule itself is an error, and naming an id that does not exist is an error. A rule whose file exists but fails validation counts as existing.

```gherkin
Scenario: A relation to a missing rule and to itself
  Given rule R-BIL-001 has dependsOn [R-BIL-009, R-BIL-001]
  And no rule R-BIL-009 exists
  When "rulebookguard lint" runs
  Then it reports "dependsOn names R-BIL-009, which does not exist"
  And it reports "dependsOn names the rule itself"
```

## Questions for the business

- A relation to a deprecated rule is accepted. Should depending on a deprecated rule be reported?
