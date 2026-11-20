---
id: R-LIN-002
context: linting
entities: [Rule, Anchor]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: Each anchor of a rule must match at least one file of the repository, or lint reports an error.
origin: extracted
evidence:
  - 'src/commands/lint.ts lintCatalog'
  - 'src/catalog/files.ts listRepoFiles'
  - 'test/cli/lint.test.ts "lists every finding and exits 1 when there are errors"'
---

# Anchors must match a file

Every glob in a rule's `anchors` must match at least one file in the repository. An anchor that matches nothing is an error on the rule file. The check applies to proposed and active rules; deprecated rules are not checked, so the code of a deprecated rule can be deleted without editing the rule. In a git repository, the files are the tracked ones plus the untracked ones git does not ignore; a file deleted from the work tree or ignored by git does not count.

```gherkin
Scenario: An anchor that matches nothing
  Given rule R-STK-001 has the anchor "src/stock/**"
  And no file in the repository is under "src/stock/"
  When "rulebookguard lint" runs
  Then it reports the error 'anchor "src/stock/**" matches no file'

Scenario: A deprecated rule whose code was deleted
  Given rule R-CLI-004 is deprecated and has the anchor "src/legacy/deactivate.ts"
  And the file "src/legacy/deactivate.ts" was deleted
  When "rulebookguard lint" runs
  Then it reports no finding for R-CLI-004
```

## Decisions

- **D1 (2026-11-19)** Should lint keep checking the anchors of a deprecated rule after its code is deleted? "1" (option 1: do not check them). Decided: deprecated rules are exempt from the anchor check; proposed and active rules are still checked. Implemented (2026-11-19).
