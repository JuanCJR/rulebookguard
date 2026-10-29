# rulebookguard — rule regions (M-03)

Objective: make `pending-implementation` require a change inside the test that tags the rule, not anywhere in its file, by closing every `@rule <ID>` with `@endrule <ID>`. Branch: `feat/rule-regions`. Delivery: `ask-on-risk`. Test runner: `pnpm exec vp test`.

## Specs

- **S1 — Every `@rule` has its `@endrule`.** A test region is the lines from `@rule <ID>` to the matching `@endrule <ID>` in the same file, both included. Regions may nest when properly paired. User (verbatim): "el lint deberia validar que cada rule tambien tenga su endrule". `lint` reports `unclosed-rule-tag` for a `@rule` without its `@endrule`, and `unmatched-endrule-tag` for an `@endrule` without an open `@rule` of the same id. Crossed markers (`@rule A`, `@rule B`, `@endrule A`) report `B` as unclosed. The `@endrule` tag follows the same matching rules as `@rule` (id shape, word boundaries, several per line).
- **S2 — `pending-implementation` looks at regions.** With `--base`, a changed active rule is satisfied only when a line changed since `<ref>` (`git diff -U0`) falls inside one of its closed regions, or the test file is untracked. A deletion counts when it happens strictly inside the region. M-03 (verbatim): "Basta cualquier cambio en el archivo de test (un espacio, otro test del mismo archivo). Exigir que el cambio caiga cerca del tag, por ejemplo en el bloque siguiente a la línea del `@rule`, usando `git diff -U0`."
- **S3 — Breaking release.** No project uses the tag yet (user, verbatim: "no existe aun ningun proyecto con esto, entonces en problemas de adopcion no tendriamos problema"), but 0.6.0 is on npm: ship as a minor bump with the breaking change stated. README, plugin skill and lint hints describe `@endrule`. Read commands (`show`, `for`, site) keep their output shape.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S3 | inline | pending | |
| T2 | S2, S3 | inline | pending | |

## Log

- **L1 (2026-10-29, user, verbatim):** "vamos a tomar el punto M-03 de este artefacto https://claude.ai/artifact/Ba736SALZjbwqvEkokCt4d", then "se me ocurre que ademas del tag agregar una region que defina de donde a donde corresponde el test a la regla y asi no lo dejamos tan al azar", then "dale, arrancá".
- **L2 (2026-10-29, decision):** explicit `@endrule` over a heuristic or tree-sitter (M-11 stays separate). Route inline: one maintainer, one behavior. `scanTestTags` keeps returning the tag index; a new `scanTestRegions` adds regions and marker problems. `lintCatalog` and `pendingImplementation` change signature (public API, part of the breaking release). Risk: item 3 (tag format and lint contract change, requested).
