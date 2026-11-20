---
id: R-LIN-007
context: linting
entities: [Rule]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: Rules must not depend on each other in a cycle; lint reports each cycle once, starting at its lowest id.
origin: extracted
evidence:
  - 'src/commands/lint.ts ruleRelations'
  - 'src/commands/lint.ts dependencyCycles'
  - 'test/cli/lint.test.ts "reports a dependsOn cycle once, starting at its lowest id"'
  - 'test/cli/lint.test.ts "prints relation findings in Spanish"'
---

# No dependency cycles

Following `dependsOn` from rule to rule must never lead back to the starting rule. Each cycle is one error, reported on the rule with the lowest id of the cycle and listing the cycle from that rule. A rule that depends on a cycle without being part of it is not reported. A cycle that goes through a deprecated rule is not reported; a cycle through proposed or active rules is.

```gherkin
Scenario: A three-rule cycle
  Given R-CLI-001 depends on R-BIL-001
  And R-BIL-001 depends on R-BIL-002
  And R-BIL-002 depends on R-CLI-001
  And R-CLI-002 depends on R-CLI-001
  When "rulebookguard lint" runs
  Then it reports one error "dependsOn forms a cycle: R-BIL-001 → R-BIL-002 → R-CLI-001 → R-BIL-001"

Scenario: A cycle through a deprecated rule
  Given R-CLI-001 depends on R-BIL-001
  And R-BIL-001 depends on R-CLI-001
  And R-BIL-001 is deprecated
  When "rulebookguard lint" runs
  Then it reports no cycle
```

## Decisions

- **D1 (2026-11-19)** Should a cycle that goes through a deprecated or proposed rule also block? "1" (option 1: ignore deprecated, keep checking proposed). Decided: a cycle through a deprecated rule is not reported; a cycle through proposed or active rules stays an error. Implemented (2026-11-19).
