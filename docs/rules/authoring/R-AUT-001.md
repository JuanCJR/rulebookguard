---
id: R-AUT-001
context: authoring
entities: [Rule, RuleId]
status: active
anchors:
  - 'src/commands/new.ts'
summary: A new rule takes the id after the highest one in its context, never a gap, and never overwrites a file.
---

# Next id after the highest

`new` gives a rule the id that follows the highest id already taken in its context. A file counts as taken by its name, even when it fails to parse. Gaps left by missing ids are never filled, so an id that was handed out once is not handed out again while a higher one exists. An existing file is never overwritten.

When the highest id of a context is taken, `new` fails and writes nothing.

```gherkin
Scenario: A broken file still takes its id
  Given the context "clients" holds R-CLI-001 to R-CLI-003
  And a file R-CLI-007.md that is not a valid rule
  When "rulebookguard new clients" runs
  Then it creates R-CLI-008
  And R-CLI-007.md is left untouched

Scenario: No free id left
  Given the context "clients" holds R-CLI-999.md
  When "rulebookguard new clients" runs
  Then it fails with "No free rule id left in context "clients" (R-CLI-999 is taken)."
```
