---
id: R-AGT-001
context: agents
entities: [Hook]
status: active
anchors:
  - 'src/commands/hook.ts'
summary: The hook never blocks a tool; on any problem it prints nothing and exits 0.
---

# The hook never blocks

The hook only adds context. It never blocks a tool and never answers the permission prompt. With no config, an invalid config, a path outside the rulebook root, no active rule, another event, unreadable input or any error, it prints nothing and exits 0, so the agent goes ahead without rules.

```gherkin
Scenario: Invalid config
  Given a rulebookguard.config.yaml with "schema: 2"
  When the hook receives a PreToolUse event for a file of the repository
  Then it prints nothing
  And it exits 0
```
