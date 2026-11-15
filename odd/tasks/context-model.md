# rulebookguard — context model and visual rule documentation

Objective: let agents describe each context's entities, relations and kind in `_context.md`, check that model with `lint`, and have `rulebookguard site` draw it as a Level 1 domain map and a Level 2 page per context, like the user's "Kuadra canvas". Branch: `feat/context-model`. Delivery: `ask-on-risk` → `stacked-to-main` (L2). Test runner: `vp test` (plus `vp check`, `vp pack`).

## Specs

- **S1 — Visual documentation generated automatically.** User (verbatim): "revisa como estoy documentando de manera mas visual las reglas para que la lectura sea mucho mejor, podriamos llegar a algo asi de manera automatica?" Reference: the canvas pages "Nivel 1 · Dominios" (domain cards with rule counts by status, labeled arrows between domains, a separate band of crosscutting domains) and "Nivel 2 · Clientes" (entity boxes with a description, boxes of other domains drawn grey and dashed, labeled relations with cardinality in the label, rules grouped in named sections with id, status and summary).
- **S2 — Crosscutting contexts.** User (verbatim): "las transversales tambien deberiamos poder identificarlas". Assumption: optional `kind: domain | crosscutting` in `_context.md` (`domain` when unset).
- **S3 — Agents maintain the model.** User (verbatim): "en cuanto a hacerlo a mano, si bien se puede, la idea es que de esto se encarguen los agentes". `rule-miner` proposes entities, relations and kind from the code with evidence; `rule-author` includes them in its rule change plan; the `rule-writing` skill says how to write them.
- **S4 — Format.** Optional `_context.md` fields (schema v1, additive): `kind`; `entities: [{name, description, origin?, evidence?}]`; `relations: [{from, to, label, origin?, evidence?}]` where `from` is an entity of this context and `to` an entity of any context (cardinality goes in `label`). Optional rule field `group` (one-line section name). `contexts --json` adds `kind`, `entities` and `relations` (always present: `"domain"`, `[]`, `[]` when unset).
- **S5 — Lint.** Errors: `duplicate-entity` (an entity name defined twice in the catalog), `unknown-relation-entity` (`from` not an entity of its context, or `to` not defined in any context). Warning: `undefined-entity` (a rule names an entity no context defines, only when the rule's own context defines entities). `dead-evidence` (warning) also covers entity and relation evidence. Messages in `en` and `es`.
- **S6 — Site Level 1.** The home page draws the domain contexts as cards (summary, rule counts by status, link) with labeled arrows derived from relations that cross domain contexts, and the crosscutting contexts in their own band. Hand-built inline SVG, no new dependency (L2). Entities or relations with `origin: extracted` show as not validated (L2).
- **S7 — Site Level 2.** Each context page draws its entities, the entities of other contexts its relations touch (dashed, with their context), and every relation from or to its entities, labeled; then the rules grouped by `group`, falling back to the rule's first entity, in sections with id, status and summary (L2).

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S2, S4 | inline | pending | |
| T2 | S5 | inline | pending | |
| T3 | S3 | inline | pending | |
| T4 | S1, S6 | inline | pending | |
| T5 | S1, S7 | inline | pending | |

Slices (stacked-to-main): PR 1 = T1+T2, PR 2 = T3, PR 3 = T4+T5.

## Log

- **L1 (2026-11-15, user, verbatim):** "Mira este artefacto https://claude.ai/artifact/69MpaBfRzSFqW4U3oisDww#page-3a7652e60c3d y revisa como estoy documentando de manera mas visual las reglas para que la lectura sea mucho mejor, podriamos llegar a algo asi de manera automatica?" — then "las transversales tambien deberiamos poder identificarlas, en cuanto a hacerlo a mano, si bien se puede, la idea es que de esto se encarguen los agentes" — then "arranquemos y definamos todo lo necesario para que puedas ejecutar sin interrupciones".
- **L2 (2026-11-15, user choices):** diagrams "SVG propio"; rule sections "Campo `group`"; delivery "stacked-to-main"; agent-proposed entities and relations carry "origin + evidence". Route inline for every task (one maintainer, no parallel units with a writer reason). Forecast ≈ 1,500 authored changed lines. Out of scope: ticket references (KAN-xxx), a "to review" status, the canvas's survey progress board. Risk expected: none (optional schema fields, additive JSON fields, new findings only for catalogs that define entities).
