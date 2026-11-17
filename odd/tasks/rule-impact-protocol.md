# rulebookguard — rule impact protocol on every task

Objective: the plugin drives a business-rule impact analysis on every task of a consuming project, not only per file. Branch: `feat/rule-impact-protocol` (from `origin/main` cea5693). Delivery: work-unit commits on one branch; PR split left to the user. Test runner: `pnpm exec vp test`.

## Specs

- **S1 — Protocol steps.** User (verbatim): "1. Explore: call `contexts` -> `rules_list` -> `rules_for` for the affected area. If the area has no context or no rules, say so explicitly. 2. Classify each new or changed behavior as one of: a. covered by an active rule (cite the rule ID); b. a new business rule: propose it through `rule-author` with status `proposed`; only the user promotes it to `active`; c. not a business rule (UI layout, performance, refactor): say so. Business rule = something the business would state (who, when, limits, states, required data), observable by the user and testable. If the area has no context yet, propose the context first. 3. Changing an active rule is a product decision: ask the user whether to modify, deprecate or supersede it. Never decide alone. 4. Large tasks: each spec item cites the affected rule IDs; new or changed rules are planned with `rule-author` and stay `proposed` until confirmed. 5. Implement in this order: rule file -> `@rule` tests -> code -> `lint`. 6. Close: run `rulebookguard lint --base <integration branch>` before the PR, and the final report names every rule touched." Approved deviation (L2): a single new rule in a small task may be written inline with the `rule-writing` guide; several rules, a new context or a conflict go through `rule-author`.
- **S2 — Delivery.** User (verbatim): "Must work for any consuming project (no project-specific paths or branch names)." and "Must not depend on a project's CLAUDE.md or on global agent config that other tools overwrite." Approved design (L2): the protocol lives in the `rules` skill; two triggers point to it: a SessionStart hook (R-AGT-005) and the MCP server instructions (R-AGT-006).
- **S3 — One-call exploration.** Approved design (L2): an `affected` command and `rules_affected` MCP tool (R-AGT-007); renamed from `impact` because `rulebookguard impact <id>` already exists.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S2 | inline | done | see L4 |
| T2 | S3 | inline | done | see L4 |

## Log

- **L1 (2026-11-16, user, verbatim request):** see S1 and S2; "First step: explore the plugin ... and propose where each step of the flow should live ... Do not implement until I approve the design."
- **L2 (2026-11-16, user, verbatim):** "aprobado, procede" — approves: MCP `instructions` + `SessionStart` hook as triggers, no `UserPromptSubmit` and no blocking `Stop`, the one-call exploration tool, and the inline exception for a single small rule.
- **L3 (2026-11-16, decision):** route inline (one maintainer, no parallel units with a writer reason). New rules R-AGT-005..007 stay `proposed` until the user promotes them. R-AGT-001 is not changed: SessionStart is a new handled event and the hook still never blocks.
- **L4 (2026-11-16, T1+T2 evidence):** one commit: T1's protocol text names `rules_affected`, so the two units are not independent; ≈ 560 changed lines, over the 400-line heuristic because docs in two languages travel with the behavior. RED: 19 failing (hook SessionStart ×6 incl. usage, plugin hooks ×2, MCP ×4, `affected` ×7). GREEN: 460 passed, 6 skipped; `vp check` pass; dogfood `lint` clean. One run timed out `site` "builds the static site into site/" at 30 s under full-suite load; it passes alone (environmental). Smoke: real SessionStart event on this repo prints the protocol; outside a rulebook prints nothing, exit 0. `rules_affected` does not resolve the rulebook from an absolute path (only `rules_for` does, R-AGT-004): left out because no rule asked for it. Not verified: whether Kiro shows MCP `instructions` to its agent.
