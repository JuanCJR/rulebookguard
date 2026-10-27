---
description: Business rules protocol for repositories with a rulebookguard.config.yaml. Use before changing code that may implement a business rule, when a rulebookguard hook injects rules for a file, or when asked to add, change or retire a business rule.
---

# Business rules (rulebookguard)

In this repository the business rules in the rulebook (`rulesDir` in `rulebookguard.config.yaml`, `docs/rules` by default) are the source of truth. Code implements them and tests verify them. Never infer a business rule from the code alone when a rule file exists.

## Before changing code

1. Before editing a file, a hook adds the active rules anchored to it. When it lists rule texts as omitted, read each rule with the `rules_show` tool (or `rulebookguard show <id>`).
2. For a file you have not edited yet, or a broader change, ask the `rules_for` tool (or `rulebookguard for <path>`).
3. Keep the change consistent with every rule listed. If the change would alter what a rule says, stop and tell the user which rule conflicts and how; do not change the behavior silently.

## Changing a rule

Only when the user asks for the behavior change:

1. Edit the rule file first: its summary, body and examples. A new rule starts with `rulebookguard new <context>` as `proposed`; it becomes `active` only when the user confirms it.
2. Update or add the tests that verify it. A test links to a rule with a `@rule <ID>` comment right above it; the link lives only in the test.
3. Change the code until those tests pass.
4. Run `rulebookguard lint` (and `rulebookguard lint --base <base branch>` before opening a pull request). A changed rule whose tagging tests did not change fails as `pending-implementation`.

Retire a rule by setting `status: deprecated` and removing its `@rule` tags; a replacement rule names it in `supersedes`.
