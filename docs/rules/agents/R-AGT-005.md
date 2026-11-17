---
id: R-AGT-005
context: agents
entities: [Hook]
status: proposed
anchors:
  - 'src/commands/hook.ts'
  - 'src/agents/protocol.ts'
summary: At the start of a session in a project with a rulebook, the hook hands the agent the rule impact protocol.
origin: authored
---

# The session starts with the rule impact protocol

On a SessionStart event, the hook looks for `rulebookguard.config.yaml` from the folder of the event up. When it finds a valid one, it answers the rule impact protocol as additional context, in the language of the config: the steps an agent follows on every task, small or large, before it plans or changes behavior. It answers the same for every source of the event (startup, resume, clear and compact), so the protocol survives a compacted conversation. Without a rulebook, or with an invalid config, it prints nothing and exits 0, as R-AGT-001 says for every problem.

```gherkin
Scenario: A project with a rulebook
  Given a folder with a valid rulebookguard.config.yaml with "language: es"
  When the hook receives a SessionStart event whose cwd is that folder
  Then it answers additional context for the event "SessionStart"
  And that context is the rule impact protocol in Spanish

Scenario: After a compaction
  Given a folder with a valid rulebookguard.config.yaml
  When the hook receives a SessionStart event with source "compact" whose cwd is that folder
  Then it answers the rule impact protocol

Scenario: A project without a rulebook
  Given a folder without rulebookguard.config.yaml in it or any parent folder
  When the hook receives a SessionStart event whose cwd is that folder
  Then it prints nothing
  And it exits 0
```
