---
id: R-BIL-001
context: billing
entities: [Invoice, Client]
status: active
anchors:
  - 'src/billing/**'
  - 'src/clients/create.go'
summary: Every new client gets a zero-balance account.
---

# Zero-balance account

Creating a client opens a billing account with balance 0.
