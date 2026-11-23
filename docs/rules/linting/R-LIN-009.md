---
id: R-LIN-009
context: linting
entities: [Context, Rule]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: A context with more rules than the configured context budget gets a warning, not an error.
origin: extracted
evidence:
  - 'src/commands/lint.ts lintCatalog'
  - 'schemas/v1/config.schema.json contextBudget'
  - 'test/cli/lint.test.ts "lists every finding and exits 1 when there are errors"'
  - 'test/cli/lint.test.ts "exits 0 when there are only warnings"'
---

# Context budget

When a context holds more rules than `contextBudget` (30 when the config does not set it), lint warns on the context file and suggests splitting the context. Reaching the budget exactly is fine. Proposed and active rules count; deprecated rules do not.

```gherkin
Scenario: A context over its budget
  Given contextBudget is 2
  And context "clients" has 3 rules
  When "rulebookguard lint" runs
  Then it warns 'context "clients" has 3 rules, more than the contextBudget of 2'
  And it exits with status 0

Scenario: Deprecated rules do not count
  Given contextBudget is 30
  And context "clients" has 26 proposed or active rules and 6 deprecated rules
  When "rulebookguard lint" runs
  Then it gives no context-budget warning for "clients"
```

## Decisions

- **D1 (2026-11-19)** Should deprecated rules count toward the context budget? "1" (option 1: do not count them). Decided: only proposed and active rules count toward the budget. Implemented (2026-11-19).
- **D2 (2026-11-19)** Is 30 rules per context a business limit, or a technical value? "confirmo" (confirmation batch: stays as today). Decided: 30 is a technical default sized for what an agent reads comfortably; each project may change it with `contextBudget`.
