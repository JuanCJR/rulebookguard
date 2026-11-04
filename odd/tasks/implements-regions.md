# rulebookguard — `@implements` regions in production code (M-11)

Objective: anchor a rule to the exact code that enforces it, not only to whole files, so evidence moves with the code. Branch: `feat/implements-regions`. Delivery: `ask-on-risk` → `stacked-to-main` (reused from agent-prerequisites L4). Test runner: `pnpm exec vp test`.

## Specs

- **S1 — Regions in code.** Artifact M-11 (verbatim): "Por ejemplo `src/clients/create.ts#validateDocument` con tree-sitter, o un tag `@implements R-CLI-001` en código de producción. Los globs por archivo se vuelven ruidosos en archivos grandes." User choice (verbatim): "@implements en código". Assumptions: `@implements <ID>` … `@endimplements <ID>` on comment lines (same comment rule as `@rule`, M-02), nesting and unclosed/unmatched handling like `@rule`/`@endrule`. Files scanned: those matched by any rule's `anchors`; a file no rule anchors is not scanned.
- **S2 — Lint.** Assumptions, all errors: `unclosed-implements-tag`, `unmatched-endimplements-tag`, `unknown-implements-tag` (no such rule), `deprecated-implements-tag`, and `implements-outside-anchors` (the region's file is not matched by that rule's `anchors`). EN and ES messages with hints. Regions are optional: no rule needs one.
- **S3 — Readers show regions.** Assumptions: `show` prints an Implementations section (`file:line-endLine`) and its JSON gains `implementations: [{file, line, endLine}]` (`[]` when none). `for <path>` JSON rows gain `regions: [{line, endLine}]` for that path (`[]` when none); the human line ends with ` (lines a-b, c-d)` only when regions exist. The hook context lists the same lines. With no `@implements` anywhere, human output is unchanged.
- **S4 — Agents and docs.** Assumptions: `rule-miner` may add `@implements`/`@endimplements` comment lines around the enforcing code (comment lines only) and writes evidence as `path symbol`, without line numbers. The `rules` skill tells implementers to wrap new enforcing code in a region. README documents tags, lint codes and output. Dogfood: the R-LIN rules' evidence drops line numbers and `src/` gets their regions.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S2 | inline | done | 1f5a134 |
| T2 | S3 | inline | done | 3ca60c2 |
| T3 | S4 | inline | done | (this commit) |

## Log

- **L1 (2026-11-04, user, verbatim):** "vamos con m-11 para dejar todo robusto" — then chose "@implements en código (Recommended)" over tree-sitter `path#symbol` and text `path#symbol`.
- **L2 (2026-11-04, decision):** route inline (one maintainer, no parallel units with a writer reason). Forecast ≈ 500 authored changed lines: slices T1 | T2+T3. Risk: item 3 watch — `findRuleRegions` (M-02 scanner) is generalized; `@rule` behavior is pinned by the existing tag tests. `for`/hook/`show` output changes are additive.
- **L3 (2026-11-04, T1 evidence):** RED: 5 failing (3 in `test/format/tag.test.ts` "findRuleRegions for @implements", 2 in `test/cli/lint.test.ts` "lint @implements regions"). GREEN: 288/288, `vp check` pass, dogfood `lint` clean. `findRuleRegions(source, kind = 'rule')`: the `@rule` pattern source is byte-identical to before and every existing tag and lint test passes unchanged. `scanImplementations` takes the file list lint already has, so the repo is listed once. Regions of schema-invalid rule ids are skipped, like tags. README documents the markers and the five codes.
- **L4 (2026-11-04, T2 evidence):** T1 assessed medium, `under_budget`. RED: 5 failing (show JSON + regions, for JSON + regions, hook lines). GREEN: 292/292, `vp check` pass, dogfood `lint` clean. Differential check found a regression the tests missed: `for src/clients` (a directory) crashed with EISDIR once `for` read the path; `scanImplementations` now skips non-files and a test pins the old answer. The hook keeps its rules without line numbers when the file cannot be read. `show` reads regions only from files the rule's anchors match, consistent with `implements-outside-anchors`.
- **L5 (2026-11-04, T3 evidence):** passive prompt and docs changes plus dogfood, no runnable RED for the prompts; `test/plugin/agents.test.ts` and `claude plugin validate plugin` pass. Dogfood: `src/commands/lint.ts` and `src/format/tag.ts` hold `@implements` regions for R-LIN-001 to R-LIN-011 (R-LIN-007 has two), `show R-LIN-007` lists both, `lint` clean. Each R-LIN evidence `path:line` was mapped against `main` to its enclosing function or test name (`path symbol`, test names quoted), duplicates dropped. 292/292 (one run hit the 30 s timeout of the Astro site test under load; it passed alone and on the rerun). Not done: no R-LIN rules for the five new lint codes (not requested).
