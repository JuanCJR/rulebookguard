---
id: R-AUT-003
context: authoring
entities: [Config, Context]
status: active
anchors:
  - 'src/commands/init.ts'
summary: init writes nothing when a file it would create already exists or the context is invalid.
---

# init never overwrites

`init` sets up a rulebook only from scratch. When `rulebookguard.config.yaml` already exists in the current directory, or, with `--ci`, the workflow `.github/workflows/rulebookguard.yml` does, it fails and writes nothing. When the context name or prefix is invalid, it fails and leaves no config behind.

```gherkin
Scenario: The config already exists
  Given a rulebookguard.config.yaml in the current directory
  When "rulebookguard init clients --ci" runs
  Then it fails with "rulebookguard.config.yaml already exists; nothing was written."
  And no other file is written

Scenario: Invalid context name
  When "rulebookguard init Clients" runs
  Then it fails
  And the directory is still empty
```
