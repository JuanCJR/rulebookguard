---
id: R-LIN-014
context: linting
entities: [Rule, Entity]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: A rule whose context defines entities gets a warning for each of its entities that no context defines.
---

# Rules name defined entities

Once a context describes its entities, the `entities` of its live rules must name entities that some context defines, its own or another. Each unknown name is an `undefined-entity` warning on the rule file. Rules of contexts that define no entities, and deprecated rules, are not checked, so catalogs without a context model see no new findings.

```gherkin
Scenario: A rule names an entity nobody defines
  Given context "clients" defines only entity "Client"
  And rule R-CLI-002 of context "clients" names the entities "Client" and "Contact"
  When "rulebookguard lint" runs
  Then it warns 'rule R-CLI-002 names entity "Contact", which no context defines'
  And it exits with status 0
```
