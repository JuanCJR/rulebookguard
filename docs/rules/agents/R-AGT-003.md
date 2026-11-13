---
id: R-AGT-003
context: agents
entities: [McpTool]
status: proposed
anchors:
  - 'src/mcp/server.ts'
  - 'src/commands/mcp.ts'
summary: Without --project, an MCP tool whose start directory has no rulebook uses the first client root that has one.
---

# MCP tools find the rulebook in the client roots

Some clients start MCP servers outside the project, for example in their own install directory. When `mcp` runs without `--project` and no `rulebookguard.config.yaml` is found from its start directory up, each tool call asks the client for its roots and runs in the first `file:` root that has a rulebook in it or in a parent directory. The start directory keeps priority, so a server started inside the project never asks. With `--project`, the tools use that directory only. When no root has a rulebook, or the client offers no roots, the tool answers the CLI error for the start directory.

```gherkin
Scenario: Server started outside the project
  Given the server was started without --project in a directory without rulebookguard.config.yaml
  And the client offers the roots "file:///other" and "file:///repo"
  And only "/repo" holds rulebookguard.config.yaml
  When the tool "contexts" is called
  Then it answers what "rulebookguard contexts --json" answers in "/repo"

Scenario: Explicit project
  Given the server was started with --project pointing to a directory without rulebookguard.config.yaml
  And the client offers the root "file:///repo" that holds rulebookguard.config.yaml
  When the tool "contexts" is called
  Then it answers a tool error
  And its text is "rulebookguard.config.yaml not found in <project> or any parent directory."
```
