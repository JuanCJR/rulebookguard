# rulebookguard — CLI output gaps

Objective: close the gaps found while testing rulebookguard on kuadra: `new` on a missing context, read-command output that misleads people and AI models, lint findings without a fix, and `language` applied only to part of the output. Branch: `feat/cli-output-gaps`. Delivery: `ask-on-risk`. Test runner: `pnpm exec vp test`.

## Specs

- **S1 — `new` creates a missing context.** User (verbatim): "el comportamiento normal deberia ser que con el new sino existe el context.md lo cree". Agreed variant (user: "si"): when the context does not exist, `new <context>` creates `<rulesDir>/<context>/_context.md` and the first rule `R-<PREFIX>-001`, printing both paths (context first). When it exists, `new` keeps creating the next rule as today. The prefix defaults to the first three letters and digits of the name, upper-cased (`inventory` → `INV`); `--prefix <P>` overrides it. It fails with exit 1, writing nothing, when the prefix is already used by another context, when the derived prefix is not valid (`^[A-Z][A-Z0-9]*$`), when `--prefix` differs from the prefix of an existing context, or when the name is not a safe directory name (`^[a-z0-9][a-z0-9_-]*$`). The context template follows `language`.
- **S2 — Accurate catalog warning.** Read commands warned `the catalog has 2 issues` while `lint` reported 5 errors. The warning must not present a partial count as the catalog total: it states the number of invalid catalog files/entries and points to `lint` for every check.
- **S3 — Empty results are explicit.** `list` with no matching rule printed nothing with exit 0. Every human (non-JSON) read output with no results prints a line saying so; JSON stays an empty array.
- **S4 — Lint findings say how to fix them.** Each lint finding carries a `hint` (one line, what to do), shown under the finding in human output and as a `hint` field in `--json`.
- **S5 — `language` applies to everything after the config is loaded.** User decision (verbatim choice): "Todo lo que va después de cargar la config (Recomendado)": lint messages and hints, errors (unknown rule or context, path outside root, git), warnings, headers of `impact`/`for`/`show`/`contexts`/`list`, catalog and schema issue messages, and the JSON `message`/`hint` follow `language`. `code` values, JSON keys and enum values (`active`, `proposed`) stay English. `--help` and argument errors (exit 2 from parsing) stay English because they happen before the config is found; an invalid config file reports in English.
- **S6 — `show` lists anchors one per line**, like `impact`.
- **S7 — `--help` for `hook`** describes PreToolUse and PostToolUse (Read) as the README does.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S5 | inline | done | 2ce30b3 |
| T2 | S1, S5 | inline | done | 7130a08 |
| T3 | S2, S3, S6, S7 | inline | done | 7fcd240 |
| T4 | S4 | inline | done | 482f65a |

## Log

- **L1 (2026-10-27, user, verbatim):** "vamos con todos y de ahi retomamos a la prueba" (after the gap list: 1 `new` on a missing context, 2 warning count mismatch, 3 silent empty `list`, 4 lint findings without a fix, 5 `language` applied partially, 6 `show` anchors on one line, 7 outdated `hook` help).
- **L2 (2026-10-27, decision):** route inline for every task: one maintainer, small modules, no parallel units with a writer reason. T1 first so every new string of T2–T4 is born in both languages. Localized messages live in one module keyed by language; `language` is threaded as an optional parameter through the format parsers (additive to the public API). Risk: item 3 (human CLI output and JSON `message` text change for `language: es` catalogs; codes and keys unchanged).
- **L3 (2026-10-27, T1 evidence):** `2ce30b3`. RED: `test/cli/language.test.ts` 5 failing. GREEN: 216/216. Found while wiring: `issues.map(formatIssue)` passed the array index as the new language argument; parsers now take an options object (`ParseOptions`) and `formatIssue` keeps its signature, so mapping public functions over arrays stays safe. `tsc` reports the same 4 pre-existing isolatedDeclarations errors as the base. The `show` labels are frontmatter field names and stay English.
- **L4 (2026-10-27, T2 evidence):** `7130a08`. RED: 10 failing in `test/cli/new.test.ts`. GREEN: 224/224. The context file is removed again if writing the first rule fails.
- **L5 (2026-10-27, T3 evidence):** `7fcd240`. RED: 5 failing. GREEN: 226/226. The warning keeps counting catalog issues (no test or anchor scan on read commands, which stay fast) and now says the count covers format issues only.
- **L6 (2026-10-27, T4 evidence):** `482f65a`. RED: 9 failing. GREEN: 227/227, `vp lint` clean. `formatFinding` stays one line (public API); the report adds the hint line. `LintFinding.hint` is a new required field of the exported type.
- **L7 (2026-10-27, end-to-end):** source CLI on a scratch copy of kuadra's catalog (`language: es`): `new inventory` printed the context and `R-INV-001`, a second call `R-INV-002`; `contexts`, empty `list`, `show` and `lint` print in Spanish with hints. New gap found: `show` prints `entities: ` with a trailing space when the list is empty. Next: resume the kuadra walkthrough (user, L1).
