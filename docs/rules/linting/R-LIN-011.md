---
id: R-LIN-011
context: linting
entities: [Rule, Test]
status: proposed
anchors:
  - 'src/commands/lint.ts'
summary: With --base, an active rule changed since that ref is an error unless a line inside one of its test regions changed too.
origin: extracted
evidence:
  - 'src/commands/lint.ts:83'
  - 'src/commands/lint.ts:318'
  - 'src/commands/lint.ts:345'
  - 'src/commands/lint.ts:371'
  - 'test/cli/lint-base.test.ts:46'
  - 'test/cli/lint-base.test.ts:57'
  - 'test/cli/lint-base.test.ts:75'
  - 'test/cli/lint-base.test.ts:125'
  - 'test/cli/lint-base.test.ts:137'
  - 'test/cli/lint-base.test.ts:164'
---

# A changed rule needs a changed test

`rulebookguard lint --base <ref>` compares the work tree with `<ref>`. For each active rule whose file changed and that some test tags, at least one added, changed or deleted line must fall inside an `@rule` … `@endrule` region of that rule. Otherwise lint reports the rule as pending implementation. A test file not yet tracked by git counts as fully changed. Proposed and deprecated rules are not checked, and an active rule no test tags is only reported by R-LIN-001.

```gherkin
Scenario: A rule edited without touching its test
  Given rule R-CLI-001 is active and tagged in tests/clients/test_create.py
  And R-CLI-001.md gained a paragraph since HEAD
  And tests/clients/test_create.py changed only outside the R-CLI-001 region
  When "rulebookguard lint --base HEAD" runs
  Then it reports "rule R-CLI-001 changed since HEAD but none of the tests tagging it changed"
```

## Questions for the business

- Any change to the rule file counts, including a typo fix in the body. Is that intended, or should only changes to the rule statement count?
- A deletion right after a region does not count, but a deletion inside one does. Is deleting lines inside a region enough evidence that the test was updated?
