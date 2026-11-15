---
id: R-LIN-013
context: linting
entities: [Entity, Relation]
status: active
anchors:
  - 'src/commands/lint.ts'
summary: A relation goes from an entity of its own context to an entity that some context defines, or lint reports an error.
---

# Relations name defined entities

Each relation in a `_context.md` starts at an entity that the same context defines (`from`) and ends at an entity that any context defines (`to`). Each side that breaks this is its own `unknown-relation-entity` error on the context file.

```gherkin
Scenario: A relation from another context's entity and to an undefined one
  Given context "billing" defines entity "Invoice"
  And context "clients" defines entity "Client"
  And context "clients" has the relations "Invoice → Client" and "Client → Payment"
  When "rulebookguard lint" runs
  Then it reports 'relation Invoice → Client: "Invoice" is not an entity of context "clients"'
  And it reports 'relation Client → Payment: no context defines "Payment"'
  And it exits with status 1
```
