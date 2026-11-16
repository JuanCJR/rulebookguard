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
- If the body needs more than about 20 lines of prose, it most likely states two behaviors: split it.

## The fields

- `summary`: one line, a full sentence, stating the behavior itself ("A client document number is unique per country."), not its topic ("Document numbers").
- `entities`: the domain nouns the rule talks about, in singular (`Client`, `Invoice`).
- `anchors`: globs of the files that implement the rule. Point at the narrowest files that decide the behavior, not whole directories by default.
- `status`: always `proposed`. Only a person sets `active`, after confirming the rule and tagging a test.
- `supersedes`: the id of the rule this one replaces; set the old one to `deprecated`.
- `dependsOn`: rules that must hold for this one to make sense. `conflictsWith`: rules that cannot be active together with this one.
- `group`: optional, one line naming the theme the rule belongs to within its context ("Client lifecycle", "Contacts"). The site shows the context's rules in sections by `group`, falling back to the rule's first entity. Reuse a group the context's rules already use before inventing a new one.
- `origin`: `extracted` when the rule was lifted from existing code, `authored` when written from a feature or a decision.
- `evidence`: for extracted rules, every place in code or tests where the behavior shows, as `path symbol` (the function, method or constant), never `path:line`: line numbers go stale when the code moves. Write a test name as a quoted string (`test/clients/create.test.ts "rejects a duplicate document"`) and a method as `Class.method`. `rulebookguard show` resolves each entry to the lines it names, and `lint` warns with `dead-evidence` when the file or the symbol is gone. Optional `@implements` regions mark exact lines when a symbol is too coarse. No evidence, no extracted rule.

## The body

1. A `#` title of a few words.
2. The full rule in plain sentences: the behavior, its limits and its exceptions. One idea per sentence, active voice, common words.
3. At least one example as a ` ```gherkin ` scenario (`Given` / `When` / `Then`) with concrete values, or a table. Cover the edge the rule names (the limit, the duplicate, the expired case).
4. For an extracted rule, a final "Questions for the business" list: what the code does that might be a bug or a technical detail rather than intent, for example "Is the limit of 3 attempts a business rule or a technical value?".

## The context model

A context's `_context.md` describes what the context is made of, so the site can draw it. Keep it in step with the rules:

- `entities`: the business concepts the context owns, each with a `name` and a one-line `description` in business language ("A person or a company that hires the service."). Use the same name the rules list in `entities`. An entity name is defined once in the whole rulebook: before adding one, check the other contexts (`contexts` tool, or `rulebookguard contexts --json`), and when another context owns it, use it from there instead of defining it again.
- `relations`: how an entity of this context relates to an entity of any context: `from` (an entity of this context), `to` (an entity some context defines), and a `label` that reads as a sentence in business words, cardinality included ("Has one or more; exactly one is the main contact"). A relation to another context's entity is what links two domains on the map.
- `kind`: leave it unset for a business domain. Set `crosscutting` only for a context that serves all the others and owns no business flow of its own, such as auditing, notifications, files or synchronization.
- `origin` and `evidence` work as in rules: what an agent lifts from the code gets `origin: extracted` and `evidence` as `path symbol` (the model, type, table or constraint that shows it). A person validates it by removing `origin: extracted`.

## Before you finish

- Search existing rules first (`rules_search`, or `rulebookguard search <words>`); change or supersede a rule instead of writing a duplicate.
- Create files only with `rulebookguard new <context>`, then fill them in.
- When you change an existing rule, compare the old and new text: every limit, value, exception and example of the old rule is still there, or its removal is intended and named in your plan or summary.
- Run `rulebookguard lint` (or the `lint` tool). If it reports an error, the rule is not done.
