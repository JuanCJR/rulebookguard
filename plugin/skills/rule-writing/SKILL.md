---
name: rule-writing
description: How to write a rulebookguard business rule so every rule reads the same, whoever writes it. Use when writing, extracting, proposing or reviewing a rule file, or turning a feature, ticket or existing code into rules.
---

# Writing a business rule (rulebookguard)

Follow these rules for every rule file, whether a person or an agent writes it, and whether it comes from a feature or from existing code.

## One rule, one behavior

- A rule states one business behavior. If its text needs "and also", split it into two rules.
- Write it in the language of the business: what a client, an invoice or an order may or may not do. No class names, functions, tables or HTTP codes in the summary or the rule statement.
- It must be verifiable: a person can write a test that passes when the rule holds and fails when it does not. "Fast", "secure" or "user friendly" are not rules.

## The fields

- `summary`: one line, a full sentence, stating the behavior itself ("A client document number is unique per country."), not its topic ("Document numbers").
- `entities`: the domain nouns the rule talks about, in singular (`Client`, `Invoice`).
- `anchors`: globs of the files that implement the rule. Point at the narrowest files that decide the behavior, not whole directories by default.
- `status`: always `proposed`. Only a person sets `active`, after confirming the rule and tagging a test.
- `supersedes`: the id of the rule this one replaces; set the old one to `deprecated`.
- `dependsOn`: rules that must hold for this one to make sense. `conflictsWith`: rules that cannot be active together with this one.
- `origin`: `extracted` when the rule was lifted from existing code, `authored` when written from a feature or a decision.
- `evidence`: for extracted rules, every place in code or tests where the behavior shows, as `path symbol` (the function, method or constant), never `path:line`: line numbers go stale when the code moves. The exact lines live in `@implements` regions. No evidence, no extracted rule.

## The body

1. A `#` title of a few words.
2. The full rule in plain sentences: the behavior, its limits and its exceptions.
3. At least one example as a ` ```gherkin ` scenario (`Given` / `When` / `Then`) with concrete values, or a table. Cover the edge the rule names (the limit, the duplicate, the expired case).
4. For an extracted rule, a final "Questions for the business" list: what the code does that might be a bug or a technical detail rather than intent, for example "Is the limit of 3 attempts a business rule or a technical value?".

## Before you finish

- Search existing rules first (`rules_search`, or `rulebookguard search <words>`); change or supersede a rule instead of writing a duplicate.
- Create files only with `rulebookguard new <context>`, then fill them in.
- Run `rulebookguard lint` (or the `lint` tool). If it reports an error, the rule is not done.
