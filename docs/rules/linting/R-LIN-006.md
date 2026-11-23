---
id: R-LIN-006
context: linting
entities: [Rule]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: A rule's dependsOn and conflictsWith may only name other rules that exist, or lint reports an error.
origin: extracted
evidence:
  - 'src/commands/lint.ts ruleRelations'
  - 'test/cli/lint.test.ts "reports a reference to an unknown rule or to the rule itself"'
---

# Relations name other existing rules

Each id in `dependsOn` or `conflictsWith` must be the id of another rule in the rulebook. Naming the rule itself is an error, and naming an id that does not exist is an error. A rule whose file exists but fails validation counts as existing. When a proposed or active rule names a deprecated rule, lint warns and names the rule that replaces it, when there is one; it is not an error.

```gherkin
Scenario: A relation to a missing rule and to itself
  Given rule R-BIL-001 has dependsOn [R-BIL-009, R-BIL-001]
  And no rule R-BIL-009 exists
  When "rulebookguard lint" runs
  Then it reports "dependsOn names R-BIL-009, which does not exist"
  And it reports "dependsOn names the rule itself"

Scenario: A relation to a deprecated rule
  Given rule R-BIL-003 is active and has dependsOn [R-CLI-004]
  And R-CLI-004 is deprecated and R-CLI-009 supersedes it
  When "rulebookguard lint" runs
  Then it warns that R-BIL-003 depends on R-CLI-004, which is deprecated, and names R-CLI-009
  And it exits with status 0
```

## Decisions

- **D1 (2026-11-19)** Should a relation to a deprecated rule be reported? "confirmo" (confirmation batch: change suggested, warn and name the replacement). Decided: a proposed or active rule whose `dependsOn` or `conflictsWith` names a deprecated rule gets a warning that names the replacing rule when there is one; lint still passes. Implemented (2026-11-19).
