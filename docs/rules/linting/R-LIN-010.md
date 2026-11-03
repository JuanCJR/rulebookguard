---
id: R-LIN-010
context: linting
entities: [Finding]
status: proposed
anchors:
  - 'src/commands/lint.ts'
summary: Lint fails only when it finds at least one error; warnings alone let it pass.
origin: extracted
evidence:
  - 'src/commands/lint.ts:107'
  - 'test/cli/lint.test.ts:121'
  - 'test/cli/lint.test.ts:136'
  - 'test/cli/lint.test.ts:20'
---

# Errors fail, warnings pass

Lint exits with status 1 when it reports one or more errors, and with status 0 when it reports nothing or only warnings. Every finding carries a one-line hint on how to fix it.

```gherkin
Scenario Outline: Exit status by findings
  Given the rulebook has <errors> errors and <warnings> warnings
  When "rulebookguard lint" runs
  Then it exits with status <status>

  Examples:
    | errors | warnings | status |
    | 0      | 0        | 0      |
    | 0      | 1        | 0      |
    | 7      | 1        | 1      |
```

## Questions for the business

- Is there a need for a strict mode where warnings also fail (for example in CI)?
