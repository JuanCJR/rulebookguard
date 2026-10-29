---
id: R-AGT-002
context: agents
entities: [McpTool]
status: active
anchors:
  - 'src/mcp/server.ts'
summary: An MCP tool whose command would fail answers a tool error with the same message the CLI prints.
---

# MCP errors speak like the CLI

When the command behind an MCP tool would fail, the tool answers a tool error, not a crash, and its text is the message the CLI prints for the same failure. An agent gets the same guidance a person gets in the terminal.

```gherkin
Scenario: Unknown rule id
  When the tool "rules_show" is called with id "R-NOPE-001"
  Then it answers a tool error
  And its text is "Unknown rule id "R-NOPE-001". Run "rulebookguard list" to list them."
```
