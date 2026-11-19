---
name: rule-review
description: How to review proposed rulebookguard rules with the user before they become active - one question at a time, batches of confirmations, a Decisions section that keeps each answer verbatim, and the checks a rule must pass to be activated; for a context with no rules yet, it offers to mine it first with rule-miner. Use after rule-miner or rule-author writes proposed rules, when rules still have "Questions for the business", when lint reports open-questions, or when the user asks to review, confirm or activate rules.
---

# Reviewing rules with the user (rulebookguard)

A proposed rule is a claim about the business. Before it becomes `active`, the user and you confirm together that it is right, and every answer stays in the rule with its reason. Run this review in the conversation with the user, never inside a subagent: it needs their answers.

## 1. Pick the scope, and mine it first when it has no rules

The user may start this review with a shortcut (`/rulebookguard:rule-review clients` in Claude Code, `/rule-review` in Kiro) and nothing else.

- When they name rule ids, review those.
- When they name a context, check it with the `contexts` tool and `rules_list`. If the context does not exist or has no rules yet, there is nothing to review: offer to mine it first, saying that mining traces the code of the area and writes `proposed` rules. On a yes, delegate to the `rule-miner` agent for that context, show the user a short summary of its report, then go on with step 2 on the rules it wrote. On a no, stop. Never mine without asking.
- When they name nothing, list the contexts whose proposed rules still have questions, with how many each has, and ask which one to start with. If no context has any, say so and ask which context to mine.

A context that already has rules is reviewed as it is: mine it again only when the user asks.

## 2. Collect the questions

Read the proposed rules of the context with `rules_list` and `rules_show`, and gather each item of their "Questions for the business" sections, with the rule id it belongs to. Sort them into:

- **Decisions:** the answer changes what the rule says or what the code must do (a limit, a state, who may act, what happens on an edge).
- **Confirmations:** the likely answer is "it stays as today" or "it is a technical value".

Ask the decisions first, one at a time. Then present the confirmations as one batch.

## 3. Ask one decision at a time

Ask one question, then stop and wait for the answer. Never ask the next one in the same message. Every question has four parts, in this order:

1. **What it decides**, in one line.
2. **Context:** what the thing is and where the user sees it in the app.
3. **An example** with concrete names and numbers.
4. **Options**, each described by its practical effect, the recommended one first and marked as recommended.

Write in the user's business words: no class names, functions, tables, flags or HTTP codes. Rule ids go in parentheses.

**Well asked:**

> **What happens to a client's pending invoices when the client is deactivated? (R-CLI-004)**
>
> Context: in the client screen, an administrator can switch a client to "inactive". Today nothing happens to their invoices.
>
> Example: ACME Ltd. has 3 unpaid invoices for $1,200 in total. On March 3 an administrator deactivates ACME.
>
> Options:
>
> 1. **Keep them open (recommended):** the 3 invoices stay due and keep showing in collections, as today.
> 2. **Cancel them:** the 3 invoices are voided and the $1,200 disappears from collections.
> 3. **Block the deactivation:** ACME cannot be deactivated until the 3 invoices are paid or voided by hand.

**Badly asked:**

> Should `deactivateClient()` cascade to `invoices.status` or should we throw a 409? Also, is `MAX_RETRIES = 3` business? (R-CLI-004, R-CLI-007)

It names code instead of behavior, gives no context or example, offers no recommendation, and asks two things at once.

## 4. Batch the confirmations

Present the confirmations together as one numbered list, split in two parts:

- **Stay as today:** what the rule already says, kept.
- **Change:** the few confirmations where you suggest a change, with that change.

Each item names what it confirms in one line and the rule id in parentheses. The user confirms the whole batch or names the items that change. An item they name becomes a decision: ask it on its own, as in step 3.

## 5. Record every answer in `## Decisions`

Write each answer into the rule it belongs to, in a `## Decisions` section at the end of the body, as the `rule-writing` skill describes:

- the user's answer **verbatim**, in quotes, the date, and what was decided;
- when the rule changes, rewrite its text and its examples to match; if the code does not do it yet, end the decision with "Pending implementation." and keep the rule `proposed`;
- remove the answered question from "Questions for the business". A question that stays open on purpose (for example, it depends on each customer) stays in that list, and its decision says so.

For a confirmation batch, record one decision per rule, quoting the user's reply to the batch.

A later correction from the user is a new decision that names the one it corrects. Never rewrite or delete an earlier decision. If the rule is already `active`, the change is a product decision: follow the `rules` skill and ask whether to modify, deprecate or supersede it.

## 6. Clarify before you record

- When an answer is ambiguous, ask one focused question about the ambiguous part before writing anything.
- When an answer opens an edge (a limit that would block another flow, a state with no way out, a rule it contradicts), ask about that edge now, as its own question.

## 7. Ready to activate

A rule is ready to become `active` only when all of these hold:

- its "Questions for the business" list is empty, or gone;
- the code already does what the rule says: no decision of it is pending implementation;
- at least one test is tagged with `@rule <ID>` … `@endrule <ID>` and verifies it.

A rule whose text depends on a decision another rule has not implemented yet (it lists that rule in `dependsOn`) stays `proposed`. Add a line to its `## Decisions` naming the rule and the decision it waits for, and what will change in this rule.

Ask for activation once, at the end, with the list of ready rule ids. Set `status: active` only on the ids the user approves, then run `lint`. Report the rules that stay `proposed` and why.
