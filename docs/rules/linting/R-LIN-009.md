---
id: R-LIN-009
context: linting
entities: [Context, Rule]
status: proposed
anchors:
  - 'src/commands/lint.ts'
summary: A context with more rules than the configured context budget gets a warning, not an error.
origin: extracted
evidence:
  - 'src/commands/lint.ts:201'
  - 'schemas/v1/config.schema.json:10'
  - 'test/cli/lint.test.ts:28'
  - 'test/cli/lint.test.ts:136'
---

# Context budget

When a context holds more rules than `contextBudget` (30 when the config does not set it), lint warns on the context file and suggests splitting the context. Reaching the budget exactly is fine. Rules of every status count.

```gherkin
Scenario: A context over its budget
  Given contextBudget is 2
  And context "clients" has 3 rules
  When "rulebookguard lint" runs
  Then it warns 'context "clients" has 3 rules, more than the contextBudget of 2'
  And it exits with status 0
```

## Questions for the business

- Is 30 rules per context a business limit, or a technical value chosen for agent context size?
- Deprecated rules count toward the budget. Should they?
