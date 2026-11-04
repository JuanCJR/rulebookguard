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
  - 'src/commands/lint.ts report'
  - 'test/cli/lint.test.ts "exits 0 with no findings"'
  - 'test/cli/lint.test.ts "exits 0 when there are only warnings"'
  - 'test/cli/lint.test.ts "lists every finding and exits 1 when there are errors"'
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
