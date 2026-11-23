---
id: R-LIN-016
context: linting
entities: [Rule]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: An active rule that still lists questions for the business gets an open-questions warning, not an error.
origin: authored
---

# Active rules have no open questions

A rule is ready to be active only when the business has answered its questions. When an active rule still has a "Questions for the business" section with at least one list item, lint warns on the rule file and names how many questions are open. The heading matches at any level and in any letter case, with or without a trailing colon. The section ends at the next heading; lines inside fenced code blocks do not count.

It is a warning, not an error, so rulebooks that activated rules before answering their questions keep passing. Proposed and deprecated rules are not checked, and a section with no list items is not open.

```gherkin
Scenario: An active rule with open questions
  Given rule R-CLI-001 is active
  And its body ends with a "Questions for the business" section listing 2 questions
  When "rulebookguard lint" runs
  Then it warns 'active rule R-CLI-001 still has 2 open questions for the business'
  And it exits with status 0

Scenario: A proposed rule with open questions
  Given rule R-CLI-002 is proposed
  And its body has a "Questions for the business" section listing 1 question
  When "rulebookguard lint" runs
  Then it reports nothing about R-CLI-002
```
