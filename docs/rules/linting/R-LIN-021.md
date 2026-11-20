---
id: R-LIN-021
context: linting
entities: [Rule, Evidence]
status: active
anchors:
  - 'src/commands/lint.ts'
  - 'src/catalog/evidence.ts'
summary: An evidence entry of a proposed or active rule whose file or symbol is gone gets a dead-evidence warning, not an error.
origin: extracted
evidence:
  - 'src/commands/lint.ts deadEvidence'
  - 'src/catalog/evidence.ts createEvidenceResolver'
  - 'test/cli/lint.test.ts "warns when the file or the symbol of an evidence entry is gone, and exits 0"'
  - 'test/cli/lint.test.ts "does not check the evidence of deprecated rules"'
  - 'test/cli/lint.test.ts "does not follow an evidence path outside the repository"'
---

# Rule evidence stays alive

Each `evidence` entry of a proposed or active rule must still point at something that exists. When its file is gone, or its symbol or quoted test name is not found in the file, lint warns on the rule file, once per entry. An entry that names only a file, or a file and a line, is checked only for the file. A path that leads outside the repository counts as missing. Deprecated rules are not checked, because they keep the evidence of the code they once described.

```gherkin
Scenario: Evidence whose file and symbol are gone
  Given rule R-BIL-001 is proposed with the evidence "src/billing/gone.go Invoice" and "src/billing/invoice.go Missing"
  And src/billing/gone.go does not exist
  And src/billing/invoice.go has no symbol "Missing"
  When "rulebookguard lint" runs
  Then it warns 'evidence "src/billing/gone.go Invoice" of R-BIL-001: src/billing/gone.go does not exist'
  And it warns 'evidence "src/billing/invoice.go Missing" of R-BIL-001: "Missing" is not found in src/billing/invoice.go'
  And it exits with status 0
```

## Decisions

- **D1 (2026-11-19)** Should dead evidence on an active rule be an error? "1" (option 1: warning, as today). Decided: dead evidence stays a warning for every status; the test required by R-LIN-001 is what guarantees the rule, and entity evidence (R-LIN-015) behaves the same.
