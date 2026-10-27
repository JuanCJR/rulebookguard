# rulebookguard — site package (M-01)

Objective: move Astro and Starlight out of the `rulebookguard` package into `@rulebookguard/site`, so installing the linter no longer downloads Astro and the core no longer requires Node 22.23.4. Branch: `feat/site-package`. Delivery: `ask-on-risk`. Test runner: `pnpm exec vp test`.

## Specs

- **S1 — Source (review artifact, item M-01, verbatim).** "`astro` y `@astrojs/starlight` son `dependencies` de un linter, así que `npx rulebookguard lint` en CI descarga todo Astro. Además obligan a exigir Node `>=22.23.4`. Mover `site` a `@rulebookguard/site` o a `optionalDependencies` permite que el núcleo vuelva a Node 20 o 22.x."
- **S2 — Packaging (user decision, verbatim choice).** "Paquete aparte": a pnpm workspace with `rulebookguard` (core, no Astro) and `@rulebookguard/site` (Astro + Starlight). `optionalDependencies` was discarded because npm and pnpm install them by default.
- **S3 — Core.** `rulebookguard` has no `astro`, `@astrojs/starlight` or `@astrojs/markdown-remark` dependency; it declares `@rulebookguard/site` as an optional peer dependency. `engines.node` is `>=22` (Node 20 is end of life and the toolchain needs `^22.18`, see core L16).
- **S4 — Site commands.** `site`, `site:generate` and `site:run` keep their behavior and output when `@rulebookguard/site` is installed, resolved from the rulebook root first, then from rulebookguard's own location. When it is not installed they fail with exit 1 and a message that says how to install it, before building.
- **S5 — Site package.** `@rulebookguard/site` takes the generated project files and an output directory, builds them with Astro inside the `node_modules` that holds Astro (core L30–L32), and replaces the output with the build. It does not depend on `rulebookguard`. `engines.node` `>=22.23.4`.
- **S6 — Release.** One tag publishes both packages with the same version; the release fails when the tag, the two versions and the core's peer range disagree. README and help text document the extra install.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S2–S5 | inline | done | cf2da3a |
| T2 | S6 | inline | done | see L4 |

## Log

- **L1 (2026-10-27, user, verbatim):** "vamos a tomar el punto M-01 de este artefacto https://claude.ai/artifact/Ba736SALZjbwqvEkokCt4d"
- **L2 (2026-10-27, decision):** user chose "Paquete aparte" over optional peer dependencies in one package. Route inline: one behavior, no writer reason. Risk: item 5 (dependencies, release). Design: the core keeps `siteData` and `sitePages` (pure strings) and the serving code; the site package is only the Astro runner (`buildSite(files, out)`, `siteWorkRoot()`, `astroFailureDetail()`), so it needs no import of the core and there is no build order between packages. Plain ESM JavaScript with a hand-written `.d.mts`, no build step.
- **L3 (2026-10-27, T1 evidence):** `cf2da3a`. RED: `test/cli/site.test.ts` failed to import `@rulebookguard/site`. GREEN: 209/209, `vp lint` clean (`vp check` only flags the untracked `.atl/skill-registry.md`, not part of the change). Finding: pnpm's bin shims put `node_modules/.pnpm/node_modules` on `NODE_PATH`, where the workspace package is linked, so the "not installed" test runs in a child process with `NODE_PATH` empty. Consumer checks with packed tarballs of both packages on the fixture repo: core alone with npm installs 11 packages, 21 MB (was 230 MB), `lint` works, `site:generate` exits 1 with the install message; core + site with npm (361 packages) and pnpm build the site (pnpm work root `node_modules/.pnpm/@rulebookguard+site@…/node_modules/.rulebookguard-site`); `npx -p <core> -p <site> rulebookguard site:generate` builds too. `vp pack`: `@rulebookguard/site` stays external in `dist`.
- **L4 (2026-10-27, T2):** release checks tag = core version = site version and peer range `^<version>`, publishes `packages/site` with `--access public`, then pins the core's `workspace:*` dev dependency with `npm pkg set` (npm does not rewrite the workspace protocol) and publishes the core. Dry run of the check values and of `npm pkg set` locally: `0.4.0 0.4.0 ^0.4.0`, dev dependency set to `0.4.0`. Pending, human: create the `rulebookguard` npm organization; the first publish of `@rulebookguard/site` may need a manual `npm publish --access public` before trusted publishing can be configured for it. Versions stay 0.4.0 until the release.
