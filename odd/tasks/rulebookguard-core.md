# rulebookguard — core (F0–F5)

Objective: a reusable, language-agnostic tool that keeps business rules as the single source of truth, readable by humans and AI, bound to code and tests so drift is detected. Branch: one `feat/` branch per phase from `master`. Delivery: `ask-on-risk`. Runtime: Node >= 20, TypeScript (ESM). Test runner: vitest.

## Specs

- **S1 — Problem statement (user, verbatim).** "la logica de negocio es la que manda siempre, el codigo, los procesos todo se basa en la logica de negocio definida, la reglas y logica de negocio es la biblia de la aplicacion". Rules must be persisted "legible tanto para humanos como para modelos de inteligencia artificial".
- **S2 — Atomic rule file.** One Markdown file per rule with YAML frontmatter:
  - `id` (string, `R-<PREFIX>-<NNN>`, unique), `context` (string), `entities` (string[]), `status` (`proposed | active | deprecated`), `supersedes` (rule id, optional), `anchors` (string[] of repo-relative globs), `summary` (one line).
  - The Markdown body holds the full rule text and its examples (Gherkin or tables).
  - Rule ↔ test linkage is NOT declared in the rule; it comes only from test tags (S5), to keep a single source.
- **S3 — Catalog layout.** `<rulesDir>/<context>/_context.md` (frontmatter: `context`, `prefix`, `summary`; body: what the context is) and `<rulesDir>/<context>/<id>.md`. `rulesDir` defaults to `docs/rules`.
- **S4 — Project config.** `rulebookguard.config.yaml` at the repo root: `schema: 1`, `rulesDir`, `testGlobs` (string[]), `contextBudget` (number; assumption: default 30 rules per context). Every file (config, context, rule) is validated against a versioned JSON Schema v1 shipped with the package.
- **S5 — Test tag convention.** A test links to a rule with `@rule <ID>` inside any comment, found by regex across `testGlobs`. Language-agnostic (TS, Go, Python…).
- **S6 — Inverse index (stable definition 2).** Given a file path, deterministically return the rules whose `anchors` match it. No embeddings or semantic search as the retrieval mechanism.
- **S7 — Progressive disclosure (stable definition 3).** L0 contexts map, L1 `id + summary` per context (generated, never hand-written), L2 full rule.
- **S8 — CLI.** Binary `rulebookguard`. Commands:
  - `contexts` (L0), `list [--context <c>] [--status <s>]` (L1), `show <id>` (L2);
  - `for <path>` (active rules anchored to the path), `impact <id>` (files matched by its anchors + tests tagging it);
  - `new <context>` (scaffold the next free id in that context);
  - `lint [--base <ref>]`.
  - Every read command supports `--json` for machine consumers (hook, MCP).
- **S9 — Lint checks (stable definition 5).** Errors: active rule with no tagging test; test tagging a missing or deprecated rule; anchor glob matching no file; schema violation; duplicate id. Warning: context over `contextBudget`. Non-zero exit code on any error.
- **S10 — Pending implementation.** `lint --base <ref>`: if a rule's body/frontmatter changed in `git diff <ref>` but none of the test files tagging it changed, report an error (rule pending implementation).
- **S11 — AI integration (stable definition 4).** Claude Code plugin: `PreToolUse` hook on `Edit`/`Write` injecting the rules for the target file; MCP server with `rules_for` and `rules_show`; a skill describing the protocol.
- **S12 — Human view.** Git files are the source of truth; the UI is a read-only view, edits go through PR. First scope is developers only (user: "las reglas por ahora en este primer alcance sera para los devs"), so no CMS. `rulebookguard site` builds a static site: contexts map, filterable list, rule page (anchors, tests, git history, supersedes chain), health board (lint results).
- **S13 — Reusability.** User: "quiero que esto que desidimos quede de alguna manera reutilizable para otros proyectos". Standalone repo, published as npm package `rulebookguard`; Kuadra is the first pilot consumer, not the owner.

## Tasks

| ID | Phase | Specs | Route | Status | Commit |
|----|-------|-------|-------|--------|--------|
| T1 | F0 | S13 | inline | pending | — |
| T2 | F0 | S2–S5 | inline | pending | — |
| T3 | F1 | S5–S6 | inline | pending | — |
| T4 | F1 | S7–S8 | inline | pending | — |
| T5 | F1 | S8 | inline | pending | — |
| T6 | F1 | S9 | inline | pending | — |
| T7 | F1 | S10 | inline | pending | — |
| T8 | F1 | S8, S13 | inline | pending | — |
| T9 | F2 | S2–S10 | inline | pending | — |
| T10 | F3 | S11 | inline | pending | — |
| T11 | F4 | S12 | inline | pending | — |
| T12 | F5 | S12 | inline | optional | — |

- **T1** Bootstrap: `package.json` (bin, ESM, engines), `tsconfig`, vitest, eslint/prettier, GitHub Actions CI (typecheck, lint, test). Risk: item 5 (CI, dependencies).
- **T2** Format: JSON Schema v1 (config, context, rule), types, parsers with schema validation errors that name file and field.
- **T3** Catalog loader + inverse index (`path → rules`) + test-tag scanner.
- **T4** Read commands: `contexts`, `list`, `show`, `for`, `impact`, with `--json`.
- **T5** `new <context>`: next free id, scaffold file from template.
- **T6** `lint` static checks and exit codes.
- **T7** `lint --base <ref>` using `git diff --name-only <ref>`.
- **T8** README (format, config, commands, CI recipe), `npm pack` dry run. Publishing to npm is the user's decision.
- **T9** Kuadra pilot: 5–10 real rules of the clients module, tagged tests, `lint` in Kuadra CI. Runs in the Kuadra repo on a `feat/<JIRA-KEY>-…` branch from `uat` (Jira key pending). Validates the format before F3/F4; format changes found here reopen T2.
- **T10** Claude Code plugin (hook + MCP + skill).
- **T11** `site` command (Astro Starlight assumed; confirm before starting).
- **T12** Optional VS Code extension with CodeLens showing rule ids on anchored files.

Delivery forecast: F0–F1 ≈ 1,500 authored lines, above the ~400 slice budget; the chain strategy (`stacked-to-main` or `feature-branch-chain`) is asked before the second F1 commit.

## Log

- **L1 (2026-10-26, user, verbatim):** "Me esta pasando que con el desarrollo con IA no hay como una manera de centralizar la logica de negocio, todo esto queda al final en el codigo y su interpretacion queda a responsabilidad de la memoria del humano y de la interpretacion del modelo de ia, y en el caso de ambos no es determinista, no siempre se puede estar usando el mejor modelo de ia y la memoria del humano falla y/o queda a interpretacion y entendimiento de las personas. A que voy con esto? la logica de negocio es la que manda siempre, el codigo, los procesos todo se basa en la logica de negocio definida, la reglas y logica de negocio es la biblia de la aplicacion, ya que esta trascience el lenguage de programacion, la arquitectura, todo, son las bases. Entonces aqui viene mi pregunta, existe actualmente alguna herramienta que me ayude a cubrir esto?  a alguien mas se le ocurrio esta forma de poder persistir la logica de negocio legible tanto para humanos como para modelos de inteligencia artificial?"
- **L2 (user, verbatim):** "Aqui viene otro tema, el catalogo de reglas puede volverse gigante, a nivel de lectura humana seria dificil buscar informacion ahi, a nivel de ia el contexto se llenaria y/o podria ensuciarse con otras cosas, y la mantenibilidad igual la vuelve compleja. como abordariamos este tema tambien? [...] quiero idear algo especificamente para este problema en concreto"
- **L3 (user, verbatim):** "Ok, me gusto mucho lo que me estas indicando desde el 1 al 5, vamos a ir dejandolo como una definicion estable. Ahora vamos a definir otro tema, el humano deberia poder visualizar de manera eficiente la informacion de las reglas, poder administralas de manera que se le haga facil poder consultar y modificar alguna regla, que podemos hacer aqui?" — Stable definitions 1–5: atomic rules with metadata, inverse index file→rules, progressive disclosure, PreToolUse injection, CI linter.
- **L4 (user, verbatim):** "las reglas por ahora en este primer alcance sera para los devs, quiero que esto que desidimos quede de alguna manera reutilizable para otros proyectos, esta idea me va a ayudar a otros proyectos entonces quiero que esto quedara reutilizable para otros. Planifica este desarrollo y definamos como lo haremos realidad"
- **L5 (user, verbatim):** "Si, vamos con typescript" — chosen over Go single binary.
- **L6 (user, verbatim):** "Pongamosle rulebookguard y ya cree el repo https://github.com/JuanCJR/rulebookguard" — npm name `rulebookguard` verified free (404 on registry, 2026-10-26).
- **L7 (decision):** the `tests:` frontmatter field from the first sketch was dropped; linkage lives only in test tags (S5) to avoid two sources of truth.
- Next step: user reviews Specs; then T1.
