---
id: R-LIN-022
context: linting
entities: [Test, Code, Rule]
status: active
anchors:
  - 'src/format/tag.ts'
  - 'src/catalog/tags.ts'
  - 'src/commands/lint.ts'
summary: A rule marker counts only on a line that starts with a comment; an id inside a test name, a string or after code is not a marker.
origin: extracted
evidence:
  - 'src/format/tag.ts COMMENT_LINE'
  - 'src/format/tag.ts findRuleTags'
  - 'src/format/tag.ts findRuleRegions'
  - 'test/format/tag.test.ts "ignores tags in a test name, a string or a comment after code"'
  - 'test/format/tag.test.ts "finds tags in the other comment openers"'
  - 'test/format/tag.test.ts "ignores markers outside comments"'
  - 'test/format/tag.test.ts "pairs each @implements with its @endimplements, on comment lines only"'
---

# Markers live on comment lines

`@rule`, `@endrule`, `@implements` and `@endimplements` count only on a line whose first non-blank characters open a comment: `//`, `/*`, `*`, `#`, `--`, `;`, `<!--` or `%`. The same text inside a test name, a string, or a comment that follows code on the same line is ignored: it neither tags a test nor opens a region. Lint reports nothing about a marker inside a test name or a string. A marker in a comment that follows code on the same line gets a warning that it does not count and must move to its own comment line. A marker also needs an id of the shape `R-<PREFIX>-<NNN>`.

```gherkin
Scenario: Ids quoted in a test name and after code
  Given a test file has the line "it('rejects a duplicate @rule R-CLI-001', () => {});"
  And it has the line "check(); // @rule R-CLI-004"
  And no other line tags R-CLI-001 or R-CLI-004
  When "rulebookguard lint" runs
  Then neither R-CLI-001 nor R-CLI-004 counts as tagged by that file
  And lint reports nothing about the test name line
  And it warns that the marker "@rule R-CLI-004" follows code and does not count
```

## Decisions

- **D1 (2026-11-19)** Should lint warn about a marker in a comment that follows code on the same line? "1" (option 1: warn). Decided: such a marker still does not count, and lint warns that it must move to its own comment line; markers inside test names or strings stay unreported. Implemented (2026-11-19).
