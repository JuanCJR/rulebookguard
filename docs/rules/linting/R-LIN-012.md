---
id: R-LIN-012
context: linting
entities: [Entity]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: An entity name is defined once in the whole rulebook, or lint reports an error.
---

# Entities are defined once

Relations and rules name an entity without saying which context owns it, so every `entities[].name` in the `_context.md` files must be unique across the rulebook. Contexts are read in name order: the first definition owns the name and every later one, in the same or another context, is a `duplicate-entity` error on its context file that names the first.

```gherkin
Scenario: The same entity in two contexts
  Given context "billing" defines entity "Client"
  And context "clients" defines entity "Client"
  When "rulebookguard lint" runs
  Then it reports 'entity "Client" is already defined in docs/rules/billing/_context.md' on the clients context file
  And it exits with status 1
```
