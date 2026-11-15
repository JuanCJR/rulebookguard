---
id: R-AGT-004
context: agents
entities: [McpTool]
status: active
anchors:
  - 'src/mcp/server.ts'
summary: An MCP tool runs in the project folder its call names, and rules_for finds the rulebook of an absolute file path.
---

# MCP tools take the project folder

Some clients start an MCP server outside the project and offer no roots: Kiro starts a power's server in the power's own folder. Every tool takes an optional `project`, the path of the workspace folder; when a call names it, the tool runs there, whatever the start directory, the client roots or `--project`. Without it, `rules_for` given an absolute file path runs in the rulebook that holds that file, when the start directory has none. When the tool then finds no rulebook, and neither `project` nor `--project` was given, its error adds a line asking to call the tool again with `project`.

```gherkin
Scenario: The call names the project
  Given the server was started in a directory without rulebookguard.config.yaml
  When the tool "contexts" is called with project "/repo", which holds rulebookguard.config.yaml
  Then it answers what "rulebookguard contexts --json" answers in "/repo"

Scenario: An absolute file path
  Given the server was started in a directory without rulebookguard.config.yaml
  When the tool "rules_for" is called with path "/repo/src/clients/create.go"
  Then it answers what "rulebookguard for /repo/src/clients/create.go --json" answers in "/repo"

Scenario: No rulebook anywhere
  Given the server was started without --project in a directory without rulebookguard.config.yaml
  And the client offers no roots
  When the tool "contexts" is called without project
  Then it answers a tool error that starts with "No rulebookguard.config.yaml in <start directory> or any parent directory."
  And its last line asks to call the tool again with project set to the workspace folder
```
