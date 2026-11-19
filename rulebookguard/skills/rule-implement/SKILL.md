---
name: rule-implement
description: How to implement the rulebookguard rules that the code does not do yet - decisions marked "Pending implementation." and proposed rules with no tagged test - one rule at a time, rule then tests then code then lint, and hand the ready ones to rule-review for activation. Use after rule-review or rule-author, when rules have pending decisions, or when the user asks to implement, develop or build the proposed rules of a context.
---

# Implementing pending rules (rulebookguard)

A reviewed rule says what the business decided; this turns it into tests and code. Work in the conversation with the user, following the order of the `rules` skill: the rule file, then tests tagged with `@rule <ID>` … `@endrule <ID>`, then the code, then `lint`.

## 1. Pick the scope

The user may start with a shortcut (`/rulebookguard:rule-implement clients` in Claude Code, `/rule-implement` in Kiro) and nothing else.

- When they name rule ids, implement those.
- When they name a context, take its rules (`rules_list`, then `rules_show`).
- When they name nothing, list the contexts with pending work (step 2), with how many rules each has, and ask which one to start with.

## 2. Find the pending work

A rule has pending work when either holds:

- a decision in its `## Decisions` ends with "Pending implementation." and no later decision says it implements that one (`implements D1`);
- it is `proposed`, has no open "Questions for the business", and no test tags it (`rulebookguard impact <ID>` lists the tests that tag it).

Skip a rule that still has open questions: it goes back to `rule-review` first. Skip a rule that waits on a decision another rule has not implemented yet, unless that rule is in this batch.

## 3. Confirm the plan once

Show the user one list, in the order you will work: each rule id, its summary in business words, and what will change (the pending decisions, or "first tests"). Put the rules another one `dependsOn` first. Name any rule you skipped and why. Ask once to go ahead, then wait.

If a pending decision changes an `active` rule, say so in the list: its tests change too, and `lint --base` checks that they did.

## 4. Implement one rule at a time

For each rule, in order:

1. **Rule file:** check that its text and examples already say what was decided. If they do not, stop and ask: the rule changes only through `rule-review` or `rule-author`.
2. **Tests:** write one test per scenario of the rule, in a file matched by `testGlobs`, wrapped in `@rule <ID>` and `@endrule <ID>` comments on their own lines. Run them and see them fail for the reason the rule names.
3. **Code:** change the code until those tests pass. Keep existing `@implements <ID>` regions around the code that enforces the rule.
4. **Record it:** add a decision to the rule that closes each one it implemented, as the `rule-writing` skill says, for example `- **D3 (2026-03-12), implements D1** Implemented; tested by test/clients/create.test.ts "rejects a sixth attempt".` Never edit or delete the decision it closes.
5. **Check:** run the focused tests, then the suite, then `lint`. Fix every error before the next rule.

When the code needs a choice the rule does not settle, stop and ask one focused question; record the answer as a decision before going on. Never change what a rule says on your own.

## 5. Close

- Run `rulebookguard lint --base <the branch the pull request targets>` before a pull request.
- Report each rule: done (with its tests), skipped and why, or stopped and on what.
- Do not set any rule `active`. Hand the done rules to `rule-review`, step "Ready to activate", which asks the user once which ones to activate.
- Do not commit or push unless the user asks.
