---
id: R-LIN-008
context: linting
entities: [Rule]
status: proposed
anchors:
  - 'src/commands/lint.ts'
summary: Two rules that conflict with each other cannot both be active; lint reports the pair once.
origin: extracted
evidence:
  - 'src/commands/lint.ts:257'
  - 'src/commands/lint.ts:263'
  - 'test/cli/lint.test.ts:305'
---

# Conflicting rules cannot both be active

When an active rule lists another active rule in `conflictsWith`, lint reports one error for the pair, on the rule with the lower id, whichever side declared it. A conflict with a proposed or deprecated rule is allowed.

```gherkin
Scenario: Two active rules in conflict, one proposed
  Given R-BIL-001 and R-BIL-002 are active and conflict with each other
  And R-BIL-001 also conflicts with R-CLI-003, which is proposed
  When "rulebookguard lint" runs
  Then it reports one error "active rules R-BIL-001 and R-BIL-002 conflict"
  And it reports nothing about R-CLI-003
```

## Questions for the business

- A conflict declared on only one side counts the same as one declared on both. Is a one-sided declaration intended to be enough?
