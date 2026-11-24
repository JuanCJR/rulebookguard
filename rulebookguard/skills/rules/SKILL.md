---
name: rules
description: Business rules protocol for repositories with a rulebookguard.config.yaml. Use on every task that plans or changes behavior, small or large, before planning it; when a rulebookguard hook injects rules for a file; or when asked to add, change or retire a business rule.
---

# Business rules (rulebookguard)

In this repository the business rules in the rulebook (`rulesDir` in `rulebookguard.config.yaml`, `docs/rules` by default) are the source of truth. Code implements them and tests verify them. Never infer a business rule from the code alone when a rule file exists.

Run the rule impact analysis below on every task that plans or changes behavior, small or large, before you plan it. A file-level hook or steering file only covers the files you open; this covers the requirement.

## 1. Explore

Find the rules the task touches:

- `rules_affected` with the files the task will change and its key words (one text per entry), in one call; or, step by step, the `contexts` tool (L0), then `rules_list` for the contexts involved (L1), then `rules_for` on each file and `rules_search` per key word. Read the relevant rules in full with `rules_show` (L2). From a shell: `rulebookguard affected --path <file> --search <words>`.
- `rules_search` matches text, needs every word and knows no synonyms: search once per key word and per obvious synonym.
- Pass `rules_for` an absolute file path. If a tool answers that there is no `rulebookguard.config.yaml`, call it again with `project` set to the absolute path of the workspace folder: some clients, such as Kiro, start the server outside the project.
- Before editing a file, a hook or a steering file may add the active rules anchored to it. When a hook lists rule texts as omitted, read each rule with `rules_show`.

Say explicitly when the area has no context or no rules. An empty answer is a finding, not a reason to skip the next steps.

## 2. Classify each new or changed behavior

A business rule is something the business would state: who may do what, when, the limits, the states, the data that is required. A user can observe it and a test can verify it. Each behavior the task adds or changes is one of:

- **Covered by an active rule:** cite its id, and keep the change consistent with it.
- **A new business rule:** propose it with status `proposed`, written as the `rule-writing` skill says. A single rule of a small task you may write yourself (`rulebookguard new <context>`, then fill it). Several rules, a new context, a change to a context model or a conflict with another rule go through the `rule-author` agent, which plans them for the user to approve. If the area has no context yet, propose the context first. Only the user makes a rule `active`.
- **Not a business rule** (UI layout, performance, a refactor, tooling): say so in one line.

## 3. Never change an active rule on your own

When the task would alter what an active rule says, stop and tell the user which rule and how. Changing it is a product decision: ask whether to modify it, deprecate it, or supersede it with a new rule. Do not change the behavior silently, and do not pick the option yourself.

## 4. Large tasks

When you keep a plan, a spec or a task list, each item cites the rule ids it affects (or says "no business rule"). Plan new and changed rules with `rule-author`; they stay `proposed` until the user confirms them.

## 5. Implement in this order

1. The rule file first: its summary, body and examples. A new rule starts with `rulebookguard new <context>` as `proposed`.
2. The tests that verify it. A test links to a rule by sitting between a `@rule <ID>` comment right above it and an `@endrule <ID>` comment right after it; the link lives only in the test.
3. The code, until those tests pass. If the rule already has `@implements <ID>` … `@endimplements <ID>` regions, keep the enforcing code inside them. Add a new region only when the user asks for one, in a file the rule anchors: regions are optional.
4. `rulebookguard lint` or the `lint` tool, until it reports no error.

## 6. Close

- Before a pull request, run `rulebookguard lint --base <the branch the pull request targets>` (or the `lint` tool with `base`). If you do not know that branch, use the remote default branch (`git symbolic-ref refs/remotes/origin/HEAD`). A changed rule whose tagging tests did not change fails as `pending-implementation`.
- Your final report names every rule you touched (cited, proposed, changed or deprecated), or says that the task touched none.

## Activating rules

Before you ask the user to make a rule `active`, review it with them as the `rule-review` skill says: its "Questions for the business" one at a time, each answer recorded under `## Decisions`, and activation asked once for the rules that are ready. `lint` warns with `open-questions` on an active rule that still lists questions. Rules whose decisions are "Pending implementation.", or proposed rules with no tagged test, are implemented with the `rule-implement` skill, rule by rule in the order above.

## Retiring and relating rules

Retire a rule by setting `status: deprecated` and removing its `@rule`/`@endrule` tags and its `@implements`/`@endimplements` regions; a replacement rule names it in `supersedes`.

A rule that needs another one in force lists it in `dependsOn`; two rules that cannot both be active list each other in `conflictsWith`. `lint` rejects unknown ids, `dependsOn` cycles and two active rules in conflict.
