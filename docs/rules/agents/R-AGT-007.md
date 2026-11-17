---
id: R-AGT-007
context: agents
entities: [McpTool]
status: proposed
anchors:
  - 'src/commands/read.ts'
  - 'src/mcp/server.ts'
summary: The affected command and the rules_affected tool answer, for each file and each text, the rules involved, and say so when there are none.
origin: authored
---

# The rules a change touches, in one call

`rulebookguard affected` takes one or more `--path` files and one or more `--search` texts, at least one of either. For each file it answers the active rules anchored to it, as `for` does. For each text it answers the rules in any status that hold every word of it, as `search` does. Then it names the contexts of all those rules. A file, a text or the context list with no rules says so explicitly, so the agent cannot read an empty answer as "nothing to check". The MCP tool `rules_affected` answers what `affected --json` prints. With neither `--path` nor `--search` the command is a usage error.

```gherkin
Scenario: A file with rules and a text with none
  Given the active rules R-BIL-001 of context "billing" and R-CLI-001 of context "clients" are anchored to "src/clients/create.go"
  And no rule holds the words "loyalty points"
  When I run "rulebookguard affected --path src/clients/create.go --search 'loyalty points'"
  Then it prints "src/clients/create.go" with R-BIL-001 and R-CLI-001 below it
  And it prints "loyalty points" with "(none)" below it
  And it prints "Contexts: billing, clients"

Scenario: Nothing found
  Given no active rule is anchored to "README.md"
  When I run "rulebookguard affected --path README.md --json"
  Then it prints {"paths":[{"path":"README.md","rules":[]}],"searches":[],"contexts":[]}

Scenario: Nothing asked
  When I run "rulebookguard affected"
  Then it exits 2 with a usage error
```
