---
id: R-CLI-001
context: clients
entities: [Client]
status: active
anchors:
  - 'src/clients/**/*.ts'
summary: A client document number is unique per country.
---

# Unique document number

Two clients in the same country cannot share a document number.

```gherkin
Scenario: duplicate document
  Given a client with document "V-1" in "VE"
  When another client is created with document "V-1" in "VE"
  Then the creation is rejected
```
