---
id: R-LIN-011
context: linting
entities: [Rule, Test]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: With --base, an active rule changed since that ref is an error unless a line inside one of its test regions changed too.
origin: extracted
evidence:
  - 'src/commands/lint.ts lintCommand'
  - 'src/commands/lint.ts pendingImplementation'
  - 'src/commands/lint.ts changedActiveRules'
  - 'src/commands/lint.ts testLineChanges'
  - 'test/cli/lint-base.test.ts "reports an uncommitted rule change without a tagging test change"'
  - 'test/cli/lint-base.test.ts "passes when a line inside a region tagging the rule changed too"'
  - 'test/cli/lint-base.test.ts "passes when lines were only deleted inside a region tagging the rule"'
  - 'test/cli/lint-base.test.ts "reports the rule when the test file changed only outside its regions"'
  - 'test/cli/lint-base.test.ts "does not count a deletion right after a region"'
  - 'test/cli/lint-base.test.ts "ignores changed rules that are proposed or deprecated"'
  - 'test/cli/lint-base.test.ts "checks added active rules, counting untracked test files as changed"'
  - 'test/cli/lint-base.test.ts "reports only untested-rule for a changed active rule that no test tags"'
---

# A changed rule needs a changed test

`rulebookguard lint --base <ref>` compares the work tree with `<ref>`. For each active rule whose file changed and that some test tags, at least one added, changed or deleted line must fall inside an `@rule` … `@endrule` region of that rule. Otherwise lint reports the rule as pending implementation. A rule file or a test file not yet tracked by git counts as changed, the test file in full. A rule counts as changed when its summary, its other main fields, its text or its examples changed, typos included; changes only to its `## Decisions` section, its `## Questions for the business` section or its evidence do not count. Changing only the status from proposed to active does not count either. Proposed and deprecated rules are not checked, and an active rule no test tags is only reported by R-LIN-001.

```gherkin
Scenario: A rule edited without touching its test
  Given rule R-CLI-001 is active and tagged in tests/clients/test_create.py
  And R-CLI-001.md gained a paragraph since HEAD
  And tests/clients/test_create.py changed only outside the R-CLI-001 region
  When "rulebookguard lint --base HEAD" runs
  Then it reports "rule R-CLI-001 changed since HEAD but none of the tests tagging it changed"

Scenario: Only a decision was recorded
  Given rule R-CLI-001 is active and tagged in tests/clients/test_create.py
  And R-CLI-001.md only gained a line in its "## Decisions" section since HEAD
  And tests/clients/test_create.py did not change
  When "rulebookguard lint --base HEAD" runs
  Then it reports nothing for R-CLI-001

Scenario: A proposed rule is only activated
  Given rule R-CLI-002 is proposed at HEAD and tagged in tests/billing/test_numbering.py
  And only its status changed to active since HEAD
  When "rulebookguard lint --base HEAD" runs
  Then it reports nothing for R-CLI-002
```

## Decisions

- **D1 (2026-11-19)** Which changes to an active rule require a changed test? "1" (option 1: ignore the sections that do not define behavior). Decided: changes only to `## Decisions`, `## Questions for the business` or evidence do not count; any change to the summary, other main fields, text or examples counts, typos included. Implemented (2026-11-19).
- **D2 (2026-11-19)** Is deleting lines inside a region enough evidence that the test was updated? "confirmo" (confirmation batch: stays as today). Decided: a deletion inside a region counts; a deletion right after it does not.
- **D3 (2026-11-19), refines D1** Does activating a rule, with no other change, require a changed test with --base? "1" (option 1: activation does not count as a change). Decided: a change of status from proposed to active alone does not count; the test must still exist, as R-LIN-001 requires. Implemented (2026-11-19).
