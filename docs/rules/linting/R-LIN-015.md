---
id: R-LIN-015
context: linting
entities: [Entity, Relation, Evidence]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: Evidence of an entity or a relation that no longer resolves gets a dead-evidence warning, as rule evidence does.
---

# Context model evidence stays alive

The `evidence` entries of entities and relations are resolved like the evidence of rules. An entry whose file or symbol is gone is a `dead-evidence` warning on the context file, naming the entity or the relation it belongs to.

```gherkin
Scenario: An entity whose evidence file is gone
  Given context "billing" defines entity "Invoice" with evidence "src/billing/gone.go Invoice"
  And "src/billing/gone.go" does not exist
  When "rulebookguard lint" runs
  Then it warns 'evidence "src/billing/gone.go Invoice" of entity Invoice: src/billing/gone.go does not exist'
  And it exits with status 0
```
