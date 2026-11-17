---
id: R-AGT-006
context: agents
entities: [McpTool]
status: proposed
anchors:
  - 'src/mcp/server.ts'
  - 'src/agents/protocol.ts'
summary: The MCP server sends the rule impact protocol as its instructions, for workspaces that have a rulebook.
origin: authored
---

# The MCP server carries the rule impact protocol

The MCP server answers the initialize request with instructions that hold the rule impact protocol, the same steps the SessionStart hook hands over, in English. The server does not know yet which workspace the agent works in, so the instructions say they apply when the workspace has a `rulebookguard.config.yaml`. This reaches the agent in clients that have no hook, without any text in the project.

```gherkin
Scenario: A client connects
  Given a client connects to the MCP server
  When the server answers the initialize request
  Then its instructions start with "When the workspace has a rulebookguard.config.yaml"
  And they hold the steps of the rule impact protocol
```
