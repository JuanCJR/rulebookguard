---
id: R-LIN-010
context: linting
entities: [Finding]
status: active
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

Lint exits with status 1 when it reports one or more errors, and with status 0 when it reports nothing or only warnings. When lint cannot run at all, it exits with status 2: the command is misspelled, `rulebookguard.config.yaml` is missing or invalid, or `--base` cannot compare (R-LIN-023). An invalid config is listed as `schema` findings; the other cases print one message. Every finding carries a one-line hint on how to fix it.

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

Scenario: No config
  Given no rulebookguard.config.yaml in the folder or any parent
  When "rulebookguard lint" runs
  Then it prints that the config is missing
  And it exits with status 2
```

## Decisions

- **D1 (2026-11-19)** Is there a need for a strict mode where warnings also fail? "1" (option 1: no, keep it as today). Decided: warnings never fail lint; a check that must block is raised to an error in its own rule.
- **D2 (2026-11-19)** Should every case where lint cannot run also exit with status 2, like a failure of --base? "1" (option 1: yes). Decided: 0 means no errors, 1 means the rulebook has errors, 2 means lint could not run (misspelled command, missing or invalid config, or --base cannot compare). Implemented (2026-11-19).
