---
id: R-LIN-005
context: linting
entities: [Test, Rule]
status: proposed
anchors:
  - 'src/format/tag.ts'
  - 'src/catalog/tags.ts'
summary: Every @rule tag in a test must be closed by a matching @endrule after it, and every @endrule must close an open @rule.
origin: extracted
evidence:
  - 'src/format/tag.ts:42'
  - 'src/format/tag.ts:57'
  - 'src/format/tag.ts:69'
  - 'src/catalog/tags.ts:56'
  - 'src/commands/lint.ts:134'
  - 'test/cli/lint.test.ts:92'
---

# Tags open and close a region

A test is tagged by a region: `@rule <ID>` before it and `@endrule <ID>` after it. An `@rule` that is never closed is an error at its line. An `@endrule` with no open `@rule` of the same id before it is an error at its line. Regions may nest; closing an outer region while an inner one is still open reports the inner one as unclosed.

```gherkin
Scenario: A region left open and a stray end
  Given tests/billing/test_regions.py has "@rule R-BIL-001" on line 1 and no "@endrule R-BIL-001"
  And it has "@endrule R-BIL-002" on line 5 with no "@rule R-BIL-002" before it
  When "rulebookguard lint" runs
  Then it reports "tests/billing/test_regions.py:1 @rule R-BIL-001 has no matching @endrule R-BIL-001"
  And it reports "tests/billing/test_regions.py:5 @endrule R-BIL-002 has no open @rule R-BIL-002 before it"
```

## Questions for the business

- Is nesting regions of different rules an intended use (one test covering two rules), or only tolerated?
