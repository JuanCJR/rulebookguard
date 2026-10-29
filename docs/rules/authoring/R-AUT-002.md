---
id: R-AUT-002
context: authoring
entities: [Rule]
status: active
anchors:
  - 'src/commands/new.ts'
summary: A new rule always starts as proposed; only a person makes it active.
---

# New rules start as proposed

`new` writes every rule with `status: proposed` and placeholder text. A proposed rule needs no test, so scaffolding never breaks `lint`. A person sets `status: active` once the rule is written and a test covers it.

```gherkin
Scenario: Scaffold a rule
  When "rulebookguard new clients" runs
  Then the new rule file has status "proposed"
  And "rulebookguard show" can read it
```
