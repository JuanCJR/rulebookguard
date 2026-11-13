<!-- prettier-ignore -->
<div align="center">

# rulebookguard

[![npm version](https://img.shields.io/npm/v/rulebookguard?style=flat-square)](https://www.npmjs.com/package/rulebookguard)
[![CI](https://img.shields.io/github/actions/workflow/status/JuanCJR/rulebookguard/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/JuanCJR/rulebookguard/actions/workflows/ci.yml)
![Node version](https://img.shields.io/node/v/rulebookguard?style=flat-square)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[English](README.md) • **Español**

[Instalación](#instalación) • [Inicio rápido](#inicio-rápido) • [Escribir reglas](#escribir-reglas) • [Comandos](#comandos) • [Configuración](#configuración) • [CI](#receta-de-ci) • [Agentes de IA](#agentes-de-ia) • [Actualización](#actualización)

</div>

> [!NOTE]
> Esta es una traducción de [README.md](README.md). Si ambas versiones difieren, la versión en inglés es la de referencia.

Las reglas de negocio se desalinean del código y de los tests que las implementan. rulebookguard guarda cada regla en un archivo Markdown pequeño, la vincula con su código (**anchors**) y con sus tests (**regiones `@rule` … `@endrule`**), y hace fallar la CI cuando se desalinean. No depende del lenguaje, y entrega las reglas de un archivo a los agentes de IA antes de que lo editen.

```text
docs/rules/clients/R-CLI-001.md   ── anchors ──▶  src/clients/**/*.ts
          ▲
          └── @rule R-CLI-001 … @endrule R-CLI-001  in  src/clients/create.test.ts
```

## Instalación

Requiere Node.js 22 o superior. Ningún archivo de tu código importa rulebookguard, así que ejecútalo con `npx` y fija la versión:

```sh
npx rulebookguard@0.14.0 lint
```

Cada versión fija sus dependencias para npm y `npx` (`pnpm dlx` y otros ignoran ese bloqueo). Para mantener la versión en tu lockfile:

```sh
npm install --save-dev rulebookguard
```

## Inicio rápido

1. `npx rulebookguard@0.14.0 init clients --ci` escribe `rulebookguard.config.yaml`, el contexto `clients` y un workflow de CI. Ajusta `testGlobs` en la [configuración](#configuración).
2. `npx rulebookguard@0.14.0 new clients` crea `docs/rules/clients/R-CLI-001.md` como `proposed`.
3. Escribe la regla, agrega sus `anchors` y pon `status: active`. Envuelve el test que la prueba con `@rule R-CLI-001` y `@endrule R-CLI-001`.
4. Ejecuta `npx rulebookguard@0.14.0 lint`. Luego agrégalo a la CI con la [receta de CI](#receta-de-ci).

## Escribir reglas

### Estructura del catálogo

Un directorio por contexto, un archivo por regla:

```text
docs/rules/
  clients/
    _context.md       # the context: name, id prefix, summary
    R-CLI-001.md      # one rule per file, named after its id
  billing/
    _context.md
    R-BIL-001.md
```

`_context.md`:

```markdown
---
context: clients
prefix: CLI
summary: Customers that receive installation services.
---

The clients context owns customer identity and contact data.
```

`context` debe coincidir con el nombre del directorio. Todo id de regla del directorio debe empezar con `R-<prefix>-`.

### Archivo de regla

````markdown
---
id: R-CLI-001
context: clients
entities: [Client]
status: active
supersedes: R-CLI-000
anchors:
  - 'src/clients/**/*.ts'
  - 'src/api/clients.controller.ts'
summary: A client document number is unique per country.
---

# Unique document number

Two clients in the same country cannot share a document number.
The check ignores letter case and leading zeros.

```gherkin
Scenario: Duplicate document in the same country
  Given a client with document "00123" in "VE"
  When another client is created with document "123" in "VE"
  Then the creation is rejected with "document already registered"
```
````

| Campo           | Obligatorio | Significado                                                                       |
| --------------- | ----------- | --------------------------------------------------------------------------------- |
| `id`            | sí          | `R-<PREFIX>-<NNN>`, tres dígitos, único, igual al nombre del archivo              |
| `context`       | sí          | el directorio de contexto donde vive la regla                                     |
| `entities`      | sí          | entidades de dominio de las que habla la regla                                    |
| `status`        | sí          | `proposed`, `active` o `deprecated`                                               |
| `supersedes`    | no          | id de la regla que esta reemplaza                                                 |
| `dependsOn`     | no          | ids de las reglas que esta necesita vigentes; sin ciclos                          |
| `conflictsWith` | no          | ids de las reglas que no pueden estar activas junto con esta                      |
| `origin`        | no          | `authored` (escrita a partir de la intención) o `extracted` (extraída del código) |
| `evidence`      | no          | dónde se ve la regla en el código o los tests, ver [Evidencia](#evidencia)        |
| `anchors`       | sí          | globs relativos al repositorio del código que implementa la regla                 |
| `summary`       | sí          | una línea; es lo que muestra `list`                                               |

El cuerpo contiene la regla completa y sus ejemplos. Las reglas no listan sus tests: el vínculo vive solo en los tests.

### Vincular tests: `@rule` … `@endrule`

En un archivo que coincide con `testGlobs`, `@rule <ID>` abre una región y `@endrule <ID>` la cierra. Ambas líneas pertenecen a la región.

```ts
// @rule R-CLI-001
it('rejects a duplicate document in the same country', () => {
  /* ... */
});
// @endrule R-CLI-001
```

> [!IMPORTANT]
> Cada `@rule` necesita su `@endrule`, o `lint` reporta `unclosed-rule-tag`. Un `@endrule` sin un `@rule` abierto del mismo id es `unmatched-endrule-tag`. `lint --base` exige un cambio **dentro** de una región de una regla modificada, no en cualquier parte del archivo de test.

- Un marcador cuenta solo en una línea que empieza con un comentario: `//`, `/*`, `*`, `#`, `--`, `;`, `<!--` o `%`, después de la indentación.
- Un marcador en el nombre de un test, en un string o después de código en la misma línea no es un vínculo.
- Dentro de un bloque `/* … */`, empieza cada línea de marcador con `*`.
- Las regiones se pueden anidar si se cierran en orden. Una línea puede llevar varios marcadores.

<details>
<summary>Ejemplos en Go y Java</summary>

Varios marcadores en una línea (Go):

```go
// @rule R-CLI-001 @rule R-BIL-001
func TestCreateClient(t *testing.T) {}
// @endrule R-BIL-001 @endrule R-CLI-001
```

Comentarios de bloque (Java o Kotlin):

```java
/** @rule R-CLI-001 */
@Test
void rejectsDuplicateDocument() {}
/** @endrule R-CLI-001 */
```

</details>

### Marcar el código que aplica la regla: `@implements` … `@endimplements`

Opcional. Los anchors dicen qué archivos gobierna una regla; una región `@implements <ID>` … `@endimplements <ID>` dice qué líneas la aplican. Usa las mismas reglas de comentarios, anidamiento y pares que `@rule`. Solo se revisan los archivos que coinciden con los `anchors` de alguna regla, y una región debe estar en un archivo que su propia regla ancla.

```go
// @implements R-CLI-001
func validateDocument(country, number string) error {
	// ...
}
// @endimplements R-CLI-001
```

### Evidencia

`evidence` vincula una regla con el código sin tocar el código. Cada entrada es una ruta, opcionalmente seguida de lo que hay que buscar en ella:

| entrada                                                      | apunta a                                          |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `src/clients/create.ts validateDocument`                     | la definición de `validateDocument`               |
| `src/clients/service.ts Clients.create`                      | `create` dentro de `Clients` (también `::` y `#`) |
| `test/clients/create.test.ts "rejects a duplicate document"` | el test con ese nombre                            |
| `src/clients/create.ts`                                      | el archivo                                        |

Las líneas se resuelven al leer la regla, así que el vínculo sigue al código. `lint` advierte `dead-evidence` cuando el archivo o el símbolo ya no existe; las reglas `deprecated` no se revisan. Una entrada antigua `path:line` o `path:line-endLine` sigue funcionando, pero solo se revisa su archivo.

Por defecto, una heurística encuentra una línea. Para rangos completos, instala el paquete opcional (usa [tree-sitter](https://tree-sitter.github.io/); JavaScript, TypeScript/TSX, Python, Go, Java, C#, Rust; ~11 MB, sin compilación):

```sh
npm install --save-dev rulebookguard @rulebookguard/symbols
```

Los demás lenguajes, y los archivos que no logra leer, usan la heurística.

## Comandos

`rulebookguard --help` los lista. Códigos de salida: `0` éxito, `1` fallo (id o contexto desconocido, falta la configuración, errores de lint, errores de git), `2` error de uso (comando u opción desconocidos, argumento faltante o sobrante).

| Comando                                       | Qué hace                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| [`init <context>`](#init)                     | crea la configuración, un primer contexto y, opcionalmente, la CI              |
| [`contexts`](#contexts-list-show-search)      | el mapa de contextos (L0)                                                      |
| [`list`](#contexts-list-show-search)          | ids y resúmenes de las reglas (L1)                                             |
| [`show <id>`](#contexts-list-show-search)     | la regla completa (L2)                                                         |
| [`search <text>`](#contexts-list-show-search) | reglas que contienen todas las palabras de un texto                            |
| [`for <path>`](#for)                          | las reglas activas ancladas a un archivo                                       |
| [`for --changed <ref>`](#for)                 | las reglas activas ancladas a los archivos cambiados desde una ref             |
| [`impact <id>`](#impact)                      | los archivos y tests que toca una regla                                        |
| [`new <context>`](#new)                       | crea el esqueleto de la siguiente regla de un contexto                         |
| [`lint`](#lint)                               | revisa todo el catálogo y, opcionalmente, los cambios desde una ref            |
| [`export gherkin`](#export)                   | escribe los escenarios de las reglas como archivos `.feature` de Cucumber      |
| [`export cursor\|copilot\|kiro`](#export)     | escribe las reglas activas como archivos de reglas de otras herramientas de IA |
| [`export agents-md`](#export)                 | mantiene un índice de las reglas activas en `AGENTS.md`                        |
| [`export kiro-agents`](#export)               | escribe los agentes `rule-author` y `rule-miner` para Kiro                     |
| [`hook`](#hook)                               | hook de Claude Code que inyecta las reglas de un archivo                       |
| [`mcp`](#mcp)                                 | servidor MCP para agentes de IA                                                |
| [`site:generate`](#site)                      | genera un sitio estático del rulebook                                          |
| [`site:run`](#site)                           | genera el sitio y lo sirve localmente                                          |

Los comandos de lectura (`contexts`, `list`, `show`, `search`, `for`, `impact`) aceptan `--json`. Si el catálogo tiene problemas, igual se ejecutan e imprimen una advertencia en stderr que remite a `lint`.

### `init`

`init <context> [--prefix <P>] [--language <en|es>] [--ci]`

```sh
$ rulebookguard init clients --ci
rulebookguard.config.yaml
docs/rules/clients/_context.md
.github/workflows/rulebookguard.yml
```

- Escribe `rulesDir: docs/rules` y los `testGlobs` `**/*.test.*`, `**/*.spec.*`, `**/test_*.py`, `**/*_test.go`. Acótalos después.
- `--prefix` funciona como en `new`. `--language` escribe `language` en la configuración.
- `--ci` escribe el workflow de la [receta de CI](#receta-de-ci), fijado a la versión en ejecución.
- Sale con 1 sin escribir nada si la configuración (o, con `--ci`, el workflow) ya existe, o si el nombre del contexto o el prefijo no son válidos. Sale con 2 si `--language` no es `en` ni `es`.

### `contexts`, `list`, `show`, `search`

```sh
$ rulebookguard contexts
billing (BIL, 2 rules): Invoices and taxes charged to clients.
clients (CLI, 3 rules): Customers that receive installation services.

$ rulebookguard list --context clients --status active
R-CLI-001 [active] A client document number is unique per country.

$ rulebookguard search "document number"
R-CLI-001 [active] A client document number is unique per country.
```

| Comando                                  | Notas                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contexts`                               | Lo indica cuando el catálogo todavía no tiene contextos.                                                                                                                                                                                                                                                                       |
| `list [--context <c>] [--status <s>]`    | `No rules found.` cuando nada coincide. Sale con 1: contexto desconocido. Sale con 2: estado no válido.                                                                                                                                                                                                                        |
| `search <text> [--context <c>] [--json]` | Reglas en cualquier estado cuyo id, resumen, entidades o texto contienen todas las palabras, sin distinguir mayúsculas. Búsqueda simple de subcadenas, sin índice. Salida y `--json` (`{ "rules": [...] }`) como `list`; `No rules found.` si no hay coincidencias. Sale con 2: texto vacío. Sale con 1: contexto desconocido. |
| `show <id>`                              | La regla completa. Sale con 1: id desconocido.                                                                                                                                                                                                                                                                                 |

<details>
<summary>Salida de <code>show</code> y forma del JSON</summary>

```sh
$ rulebookguard show R-CLI-001
R-CLI-001: A client document number is unique per country.
context: clients
status: active
entities: Client
anchors:
  src/clients/**/*.ts
  src/api/clients.controller.ts
supersedes: R-CLI-000
file: docs/rules/clients/R-CLI-001.md

# Unique document number
...
```

- Las líneas `supersedes`, `dependsOn`, `conflictsWith`, `origin` y `evidence` aparecen solo cuando tienen valor. `--json` siempre incluye `supersedes` y `origin` (o `null`), y `dependsOn`, `conflictsWith` y `evidence` (o `[]`).
- Cada entrada de [evidencia](#evidencia) con símbolo va seguida de `(lines a-b)`. `--json` mantiene `evidence` tal como está escrita y agrega `evidenceLinks: [{ entry, file, line, endLine }]`, con líneas `null` cuando no se resuelven (o `[]`).
- `implementations:` lista las [regiones `@implements`](#marcar-el-código-que-aplica-la-regla-implements--endimplements) de la regla como `file:line-endLine`, leídas de los archivos que coinciden con sus anchors. `--json`: `implementations: [{ file, line, endLine }]` (o `[]`).

</details>

### `for`

`for <path>` lista las reglas activas ancladas a una ruta (relativa al directorio actual). Consúltalo antes de tocar un archivo.

```sh
$ rulebookguard for src/clients/create.ts
R-CLI-001 (clients): A client document number is unique per country. (lines 12-30)
```

Los rangos de líneas salen de las regiones `@implements` y de la [evidencia](#evidencia) resuelta. Las filas de `--json` incluyen `regions: [{ line, endLine }]` y `evidence: [{ entry, line, endLine }]` (`[]` si no hay). Sale con 1: ruta fuera de la raíz del rulebook.

`for --changed <ref>` lista las reglas activas ancladas a los archivos cambiados desde una ref, cada una con esos archivos. Úsalo para ver qué reglas toca un pull request.

```sh
$ rulebookguard for --changed origin/main
R-BIL-001 (billing): Every new client gets a zero-balance account.
  src/clients/create.ts
R-CLI-001 (clients): A client document number is unique per country.
  src/clients/create.ts
  src/clients/update.ts
```

- Compara la ref con el árbol de trabajo, igual que `lint --base`: cuentan los archivos eliminados y los no rastreados que no estén ignorados. Un archivo renombrado cuenta con sus dos rutas.
- En una rama atrasada respecto de la ref, también cuentan los archivos que cambiaron en la ref desde el punto de bifurcación. En la CI, compara contra la base del pull request sobre el merge commit (el checkout por defecto de un pull request).
- `--json`: `{ base, files, rules }`; cada regla lleva sus propios `files`.
- Sin resultados: `No active rules anchored to the files changed since <ref>.` Sale con 1: ref desconocida o fuera de un árbol de trabajo de git. Sale con 2: se pasaron una ruta y `--changed` a la vez.

### `impact`

`impact <id>`: los archivos que coinciden con los anchors de una regla y los tests que la marcan. Sale con 1: id desconocido.

```sh
$ rulebookguard impact R-CLI-001
R-CLI-001: A client document number is unique per country.
Files matched by anchors (2):
  src/clients/create.ts
  src/clients/update.ts
Tests tagging R-CLI-001 (1):
  src/clients/create.test.ts:12
```

### `new`

`new <context> [--prefix <P>]` crea el esqueleto del siguiente id libre como regla `proposed` e imprime su ruta. Si el contexto no existe, primero crea su `_context.md`.

```sh
$ rulebookguard new inventory
docs/rules/inventory/_context.md
docs/rules/inventory/R-INV-001.md
```

- Los ids nunca se reutilizan y los archivos existentes nunca se sobrescriben. El texto de ejemplo sigue a `language`.
- Por defecto, el prefijo son las tres primeras letras y dígitos del nombre, en mayúsculas. `--prefix` define otro.
- Sale con 1 sin escribir nada si no quedan ids libres; si el nombre no está formado por letras minúsculas, dígitos, `-` o `_`; si el prefijo no es válido o lo usa otro contexto; o si `--prefix` difiere del prefijo de un contexto existente.

### `lint`

`lint [--base <ref>] [--json]` revisa todo el catálogo. Sale con 1 ante cualquier error; con 0 si solo hay advertencias o nada (`No issues found.`).

```sh
$ rulebookguard lint
error untested-rule docs/rules/billing/R-BIL-002.md active rule R-BIL-002 has no test tagging it
  hint: wrap a test in a file matched by testGlobs with "@rule R-BIL-002" and "@endrule R-BIL-002", or set the rule's status to proposed
warning context-over-budget docs/rules/clients/_context.md context "clients" has 31 rules, more than the contextBudget of 30
  hint: split the context into smaller ones, or raise contextBudget in rulebookguard.config.yaml
1 error, 1 warning
```

Formato: `<severity> <code> <file>[:line] <message>`, una línea `hint:` y al final un conteo. `--json`: `{ "findings": [{ "severity", "code", "file", "line"?, "message", "hint" }], "errors", "warnings" }`.

| Severidad | Código                        | Significado                                                                   |
| --------- | ----------------------------- | ----------------------------------------------------------------------------- |
| error     | `untested-rule`               | una regla activa no tiene ningún test que la marque                           |
| error     | `unknown-rule-tag`            | un test marca un id de regla que no existe                                    |
| error     | `deprecated-rule-tag`         | un test marca una regla `deprecated`                                          |
| error     | `unclosed-rule-tag`           | un `@rule` no tiene su `@endrule`                                             |
| error     | `unmatched-endrule-tag`       | un `@endrule` no tiene un `@rule` abierto del mismo id                        |
| error     | `unclosed-implements-tag`     | un `@implements` no tiene su `@endimplements`                                 |
| error     | `unmatched-endimplements-tag` | un `@endimplements` no tiene un `@implements` abierto del mismo id            |
| error     | `unknown-implements-tag`      | hay código marcado como implementación de un id de regla que no existe        |
| error     | `deprecated-implements-tag`   | hay código marcado como implementación de una regla `deprecated`              |
| error     | `implements-outside-anchors`  | una región `@implements` está en un archivo que su regla no ancla             |
| error     | `unmatched-anchor`            | un glob de anchor no coincide con ningún archivo                              |
| error     | `schema`                      | un archivo de configuración, contexto o regla no cumple el JSON Schema        |
| error     | `duplicate-id`                | dos archivos de regla comparten un id                                         |
| error     | `file-name-mismatch`          | un archivo de regla no se llama `<id>.md`                                     |
| error     | `id-prefix-mismatch`          | un id de regla no usa el prefijo de su contexto                               |
| error     | `context-mismatch`            | un campo `context` no coincide con su directorio                              |
| error     | `missing-context-file`        | un directorio de contexto no tiene `_context.md`                              |
| error     | `missing-rules-dir`           | `rulesDir` no existe                                                          |
| error     | `pending-implementation`      | con `--base`: cambió una regla activa, pero ninguna de sus regiones           |
| error     | `invalid-rule-reference`      | `dependsOn` o `conflictsWith` nombra una regla desconocida o a sí misma       |
| error     | `dependency-cycle`            | los vínculos `dependsOn` forman un ciclo (se reporta una vez, en su id menor) |
| error     | `active-rule-conflict`        | dos reglas activas donde una lista a la otra en `conflictsWith`               |
| warning   | `context-over-budget`         | un contexto tiene más reglas que `contextBudget`                              |
| warning   | `dead-evidence`               | una entrada de `evidence` nombra un archivo o símbolo que ya no existe        |

Una configuración no válida se reporta como hallazgos `schema`. Las marcas de un archivo de regla que no cumple el schema no se reportan de nuevo como `unknown-rule-tag`.

**`--base <ref>`** también revisa lo que cambió respecto de `<ref>`: un archivo de regla modificado necesita un cambio dentro de una de sus regiones `@rule` … `@endrule`, o se reporta `pending-implementation`.

```sh
$ rulebookguard lint --base origin/main
error pending-implementation docs/rules/clients/R-CLI-001.md rule R-CLI-001 changed since origin/main but none of the tests tagging it changed
  hint: update or add a test inside an "@rule R-CLI-001" … "@endrule R-CLI-001" region that covers the changed rule
1 error, 0 warnings
```

<details>
<summary>Cómo decide <code>--base</code> qué cambió</summary>

- Archivos cambiados: `git diff --name-only <ref>` más los archivos no rastreados, así que el trabajo sin commitear cuenta.
- Cambios en regiones: `git diff -U0 <ref>`. Un archivo de test no rastreado cuenta entero. Una eliminación cuenta cuando cae estrictamente dentro de la región.
- Un cambio en otra parte del archivo de test (otro test, una línea en blanco entre regiones) no cuenta.
- Una regla activa sin tests que la marquen se reporta solo como `untested-rule`.
- Solo se revisan las reglas que quedan `active` después del cambio: las reglas activas nuevas sí; las `proposed` y `deprecated`, no.
- Sale con 1 fuera de un árbol de trabajo de git, con una ref que git no puede resolver, o cuando git falla al listar los cambios.

</details>

### `export`

Todos los comandos `export` aceptan `[--out <dir>]`, relativo al directorio actual. Los archivos generados llevan una línea "Generated by"; edita la regla, no el archivo.

| Comando                        | Escribe                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `export gherkin`               | los bloques ` ```gherkin ` de cada regla no `deprecated` como `<out>/<context>/<id>.feature` (por defecto `features/rules`)               |
| `export cursor\|copilot\|kiro` | un archivo por regla activa con anchors, limitado a sus anchors (tabla más abajo)                                                         |
| `export agents-md`             | un índice de las reglas activas en `AGENTS.md`                                                                                            |
| `export kiro-agents`           | `rule-author` y `rule-miner` como [custom agents de Kiro](https://kiro.dev/docs/custom-agents/) en `.kiro/agents/rulebookguard-<name>.md` |

```sh
$ rulebookguard export gherkin
features/rules/clients/R-CLI-001.feature
$ cat features/rules/clients/R-CLI-001.feature
# Generated by "rulebookguard export gherkin" from docs/rules/clients/R-CLI-001.md; edit the rule instead.
@R-CLI-001
Feature: R-CLI-001 A client document number is unique per country.

  Scenario: Duplicate document in the same country
    Given a client with document "00123" in "VE"
    When another client is created with document "123" in "VE"
    Then the creation is rejected with "document already registered"
```

<details>
<summary>Detalles de la exportación</summary>

**`export gherkin`**

- Cada archivo lleva el id de la regla como tag: ejecuta o filtra los escenarios de una regla con `--tags @R-CLI-001` de Cucumber. Son tags de Cucumber, no regiones `@rule`: vincula las step definitions con `@rule` … `@endrule`.
- Las líneas `# language:` de los bloques se descartan. Con `language: es`, el archivo empieza con `# language: es` y usa `Característica:`.
- Los archivos generados se sobrescriben; nada más del directorio de salida se toca. El `.feature` de una regla que pasó a `deprecated` o perdió sus escenarios queda hasta que lo borres.
- Nada que escribir: `No rule has Gherkin scenarios.`

**`export cursor|copilot|kiro`**: los archivos van bajo la raíz del rulebook, o directamente en `--out`:

| Formato   | Archivo                                                   | Se limita con                                          |
| --------- | --------------------------------------------------------- | ------------------------------------------------------ |
| `cursor`  | `.cursor/rules/rulebookguard-<id>.mdc`                    | `globs`, separados por comas, con `alwaysApply: false` |
| `copilot` | `.github/instructions/rulebookguard-<id>.instructions.md` | `applyTo`, separados por comas                         |
| `kiro`    | `.kiro/steering/rulebookguard-<id>.md`                    | `inclusion: fileMatch` y `fileMatchPattern`            |

```sh
$ rulebookguard export kiro
.kiro/steering/rulebookguard-R-CLI-001.md
$ cat .kiro/steering/rulebookguard-R-CLI-001.md
---
inclusion: fileMatch
fileMatchPattern: "src/clients/**/*.go"
---

<!-- Generated by "rulebookguard export kiro" from docs/rules/clients/R-CLI-001.md; edit the rule instead. -->

**R-CLI-001:** A client document number is unique per country.

# Unique document number
…
```

- Vuelve a ejecutarlo después de cambiar reglas (en la CI o antes de commitear). Sobrescribe los archivos generados y elimina los de reglas que ya no están activas, imprimiendo `removed <path>`.
- Solo se elimina un archivo que se llama como un id de regla y tiene la línea de generación justo después de su frontmatter. Si al archivo de una regla activa le falta esa línea, el comando sale con 1 antes de escribir o eliminar nada.
- Una regla activa sin anchors se omite con una advertencia en stderr.
- Nada que escribir: `No active rule to export.` o `No active rule with anchors to export.`
- Los anchors con llaves se expanden en un patrón por opción. Un anchor con una coma literal en un nombre de archivo no se puede escribir en los formatos separados por comas.

**`export agents-md`**

- Escribe en la raíz del rulebook o en `--out`. `AGENTS.md` siempre se lee y no se limita por rutas, así que contiene el id, los anchors (o `no anchors`), el resumen y el archivo de cada regla, no el texto completo.
- El índice vive entre `<!-- rulebookguard:start -->` y `<!-- rulebookguard:end -->`. El resto del archivo se conserva; el bloque se agrega la primera vez y se reemplaza después.
- Sin reglas activas: se elimina el bloque, y también el archivo si no queda nada más (`removed AGENTS.md`).
- Cualquier cosa distinta de un marcador de inicio seguido de uno de fin, o de ninguno, sale con 1 y deja el archivo intacto.

**`export kiro-agents`**

- Escribe bajo la raíz del rulebook o directamente en `--out`. Cada archivo lleva su propio servidor MCP, fijado a la versión del CLI que lo escribió, y la guía de redacción de reglas, así que funciona sin el [power de Kiro](#kiro). Vuelve a ejecutarlo después de actualizar.
- Los demás archivos del directorio no se tocan. Si a `rulebookguard-rule-author.md` o `rulebookguard-rule-miner.md` les falta la línea de generación, el comando sale con 1 antes de escribir nada.

</details>

### `hook`

Un hook de Claude Code para los eventos `PreToolUse` y `PostToolUse` de herramientas que reciben un `file_path`. El [plugin de Claude Code](#plugin-de-claude-code) lo configura. Imprime las reglas activas ancladas al archivo como contexto adicional, con el mismo `hookEventName`:

```sh
$ echo '{"hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"/repo/src/billing/invoice.go"}}' | rulebookguard hook
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Business rules anchored to src/billing/invoice.go (rulebookguard). …"}}
```

> [!NOTE]
> El hook nunca bloquea una herramienta ni responde la solicitud de permiso: sin configuración, con una ruta fuera de la raíz del rulebook, sin reglas activas, con otro evento, con una entrada ilegible o ante cualquier error, no imprime nada y sale con 0.

<details>
<summary>Detalles del hook</summary>

- Lee el JSON del evento por stdin y toma `tool_input.file_path` (las rutas relativas se resuelven contra el `cwd` del evento). Busca `rulebookguard.config.yaml` subiendo desde ese archivo.
- Un hook `PostToolUse` sobre `Read` entrega las reglas junto con el contenido del archivo, antes de que Claude escriba un cambio (Claude Code exige leer un archivo antes de editarlo).
- Cada regla incluye su id, contexto, resumen, archivo de regla, las líneas de sus regiones `@implements` y su evidencia en ese archivo, y el texto completo. Por encima de 10.000 caracteres solo se listan los resúmenes, con una indicación de usar `rulebookguard show <id>`.
- El encabezado sigue a `language`.

</details>

### `mcp`

`mcp [--project <dir>]`: un servidor [MCP](https://modelcontextprotocol.io) sobre stdio con herramientas de solo lectura. El rulebook se busca desde `--project` (por defecto, el directorio actual). Sin `--project`, cuando no hay `rulebookguard.config.yaml` desde el directorio actual hacia arriba, cada llamada a una herramienta usa el primer [root](https://modelcontextprotocol.io/specification/2025-06-18/client/roots) que ofrece el cliente y que tenga uno, así que una sola entrada global sirve para todos los proyectos de un cliente que inicia los servidores fuera del workspace.

| Herramienta    | Entrada                                                | Responde                                                              |
| -------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `rules_for`    | `path`: absoluta o relativa al directorio del proyecto | lo que imprime `rulebookguard for <path> --json`                      |
| `rules_show`   | `id`: un id de regla                                   | lo que imprime `rulebookguard show <id> --json`                       |
| `contexts`     | ninguna                                                | lo que imprime `rulebookguard contexts --json`                        |
| `rules_list`   | `context`?, `status`?                                  | lo que imprime `rulebookguard list --json` con esas opciones          |
| `rules_search` | `text`, `context`?                                     | lo que imprime `rulebookguard search <text> --json`                   |
| `lint`         | `base`?: una ref de git                                | lo que imprime `rulebookguard lint --json`, con `--base` si se indica |

Un comando que falla responde con un error de herramienta que contiene el mensaje del CLI, por ejemplo `Unknown rule id "R-NOPE-001". Run "rulebookguard list" to list them.` Los hallazgos de lint son datos: `lint` falla solo cuando lint no puede ejecutarse.

### `site`

> [!IMPORTANT]
> Los comandos del sitio necesitan un paquete aparte (Astro, Node.js 22.23.4 o superior):
>
> ```sh
> npm install --save-dev rulebookguard @rulebookguard/site
> ```
>
> Sin él salen con 1 y el mensaje `The site commands need the @rulebookguard/site package. Install it next to rulebookguard: npm install --save-dev @rulebookguard/site`. Para una ejecución puntual: `npx -p rulebookguard@0.14.0 -p @rulebookguard/site@0.14.0 rulebookguard site:run`.

| Comando                                                  | Qué hace                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `site:generate [--out <dir>] [--base <path>]` (o `site`) | genera un sitio de solo lectura con [Astro Starlight](https://starlight.astro.build) en `--out` (por defecto `site`) e imprime la ruta |
| `site:run [--out <dir>] [--base <path>] [--port <n>]`    | genera y luego sirve `--out` en `127.0.0.1` (puerto 4321, o `--port`) hasta Ctrl+C                                                     |

```sh
$ rulebookguard site:generate --out public/rules --base /rules
public/rules

$ rulebookguard site:run
site
Serving site at http://127.0.0.1:4321/ (Ctrl+C to stop)
```

- Ábrelo desde el disco o publícalo tal cual (por ejemplo, en GitHub Pages). Usa `--base` cuando se sirve desde una subruta.
- `site:run`: las rutas desconocidas reciben la página 404; un puerto ocupado sale con 1 antes de generar.

> [!WARNING]
> `site` reemplaza `--out` solo cuando está vacío o lo escribió un `site` anterior. Cualquier otro directorio con contenido sale con 1 y queda intacto. Agrega el directorio de salida a `.gitignore`, salvo que quieras commitearlo.

<details>
<summary>Qué muestra el sitio</summary>

- **Inicio:** el mapa de contextos, con la cantidad de reglas por estado.
- **Una página por contexto** con su descripción y sus reglas.
- **Todas las reglas:** una tabla filtrable por texto, contexto y estado.
- **Una página por regla:** resumen, estado, entidades, archivo de regla, cadena de `supersedes` en ambos sentidos, origen (una regla `extracted` que sigue `proposed` se marca como todavía no validada por el negocio), evidencia con `file:line-endLine`, texto, anchors y archivos que coinciden, tests que la marcan e historial de git del archivo de regla.
- **Salud:** los hallazgos de `lint` al momento de generar.
- Búsqueda de texto completo (Pagefind).

La interfaz sigue a `language`. El sitio es solo una vista: edita las reglas en sus archivos, mediante pull requests.

</details>

## Configuración

`rulebookguard.config.yaml` en la raíz del repositorio. Los comandos lo buscan subiendo desde el directorio actual; las rutas del catálogo son relativas a su directorio.

```yaml
schema: 1
testGlobs: ['src/**/*.test.ts', 'tests/**/test_*.py']
language: es
```

| Clave           | Obligatoria | Por defecto  | Significado                                                                                           |
| --------------- | ----------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `schema`        | sí          | —            | versión del schema de configuración (`1`)                                                             |
| `testGlobs`     | sí          | —            | archivos donde se buscan marcas `@rule`; `[]` es válido, pero no encuentra ninguna                    |
| `rulesDir`      | no          | `docs/rules` | dónde viven los contextos                                                                             |
| `contextBudget` | no          | `30`         | `lint` advierte cuando un contexto tiene más reglas                                                   |
| `language`      | no          | `en`         | `en` o `es`: idioma del texto que genera rulebookguard (0.1.1+; las versiones anteriores lo rechazan) |

Los campos desconocidos se rechazan. Los JSON Schemas se distribuyen en `rulebookguard/schemas/v1/`.

<details>
<summary>Qué abarca <code>language</code></summary>

Abarca la plantilla de `new`, el contexto del hook, el sitio y todos los mensajes que se imprimen una vez cargada la configuración (hallazgos de lint, errores, advertencias, encabezados y el `message` de la salida `--json`). Los códigos de lint, las claves JSON y valores como `active` quedan en inglés. También quedan en inglés `--help`, los errores de argumentos y los hallazgos de un archivo de configuración no válido, porque ocurren antes de leer la configuración. El contenido de las reglas nunca se revisa por idioma.

</details>

<details>
<summary>Cómo se listan los archivos</summary>

- Dentro de un árbol de trabajo de git: `git ls-files --cached --others --exclude-standard`, así que nada de lo que está en `.gitignore` (`dist/`, `coverage/`, cachés) coincide nunca. También se listan los archivos dentro de submódulos.
- Se omite un submódulo cuya ruta es un enlace simbólico o que resuelve fuera de la raíz del rulebook. Un archivo de test enlazado simbólicamente se revisa solo si su destino está dentro de la raíz del rulebook.
- Un submódulo que no se puede listar imprime `warning: could not list files of submodule "<path>" (<reason>); skipping it.` y el resto se conserva.
- Fuera de git, o cuando la raíz del rulebook está ignorada por git, se recorre todo el árbol, omitiendo `.git` y `node_modules`.
- Si git falla (no está en el `PATH`, propiedad dudosa del repositorio), los comandos imprimen una advertencia en stderr y recorren el árbol.

</details>

## Receta de CI

`rulebookguard init --ci` escribe esto como `.github/workflows/rulebookguard.yml`. `fetch-depth: 0` hace disponible la rama base.

```yaml
name: rules
on: pull_request

jobs:
  rulebookguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7.0.1
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - run: npx --yes rulebookguard@0.14.0 lint --base origin/${{ github.base_ref }}
```

> [!TIP]
> Mantén la versión fijada, o ejecútala desde tu lockfile, para que una versión nueva nunca cambie por sí sola los resultados de la CI.

## Agentes de IA

### Plugin de Claude Code

```sh
claude plugin marketplace add JuanCJR/rulebookguard
claude plugin install rulebookguard@rulebookguard
```

O, en Claude Code 2.1.275 o superior: `/plugin install rulebookguard --marketplace JuanCJR/rulebookguard`.

El plugin de [`plugin/`](plugin) incluye:

| Pieza                              | Qué hace                                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hooks                              | ejecutan `rulebookguard hook` después de cada `Read` y antes de cada `Write` (un `Write` de un archivo nuevo recibe las reglas justo después de crearlo)                                      |
| Servidor MCP                       | las herramientas de [`mcp`](#mcp), para archivos que Claude no abrió y para trabajar sobre el rulebook                                                                                        |
| Skill `rulebookguard:rules`        | el protocolo: seguir las reglas; cambiar una regla (luego los tests y luego el código, dentro de sus regiones `@implements`; regiones nuevas solo si se piden) solo cuando el usuario lo pide |
| Skill `rulebookguard:rule-writing` | la guía de redacción compartida: un comportamiento verificable, un resumen de negocio en una línea, Gherkin, `origin` y `evidence` para reglas extraídas                                      |
| Agente `rulebookguard:rule-miner`  | extrae como reglas `proposed` las reglas que el código existente ya aplica, un contexto a la vez. Pídelo así: "use rule-miner on the clients context"                                         |
| Agente `rulebookguard:rule-author` | planifica los cambios de reglas que necesita una funcionalidad, se detiene para que se apruebe y luego los escribe. Pídelo así: "use rule-author for this feature: …"                         |

El plugin ejecuta el `node_modules/rulebookguard` propio del proyecto (en el directorio del proyecto o en uno superior) cuando su versión es al menos la del plugin; si no, `npx rulebookguard@<plugin version>`, que necesita Node.js y red la primera vez. En un checkout de rulebookguard ejecuta el `dist/cli.mjs` compilado (con `vp pack`). Cualquier fallo del hook, incluido un timeout, deja que la herramienta siga sin reglas.

<details>
<summary>Qué hacen los agentes y qué nunca hacen</summary>

**rule-miner** escribe reglas `proposed` con `origin: extracted`, evidencia como `path symbol` y preguntas para el negocio, mediante `rulebookguard new`. Primero recorre cada flujo del contexto, desde los puntos de entrada hasta la persistencia, y su informe empieza con esos flujos. Revisa las reglas existentes para evitar duplicados, respeta `contextBudget`, envuelve en `@rule` … `@endrule` los tests que ya verifican una regla, y termina solo cuando `lint` no tiene errores propios. Nunca activa ni edita reglas existentes, y no edita código de producción: sugiere las líneas que aplican cada regla y agrega marcadores `@implements` … `@endimplements` solo si se le pide. Una persona revisa el diff y activa lo que se sostiene.

**rule-author** no escribe nada por defecto. Lee el rulebook por niveles y devuelve un plan: reglas nuevas con Gherkin, reglas modificadas como diffs, reglas a deprecar, conflictos con reglas activas, esqueletos de tests y preguntas abiertas. Si se lo vuelve a llamar con el plan aprobado, escribe las reglas nuevas como `proposed` mediante `rulebookguard new`, aplica los diffs aprobados y termina cuando `lint` no tiene errores propios. Los tests y el código vienen después, como indica la skill `rules`.

</details>

### Kiro

Mantén `rulebookguard.config.yaml` en la raíz del workspace de Kiro: Kiro lee `.kiro/` desde ahí, y los patrones de steering son relativos a la raíz del rulebook.

| Pieza                           | Qué le da a Kiro                                       | Cómo obtenerla                     |
| ------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| [Archivos de steering](#export) | las reglas activas de los archivos con los que trabaja | `rulebookguard export kiro`        |
| Power en [`plugin/`](plugin)    | las skills `rules` y `rule-writing` y el servidor MCP  | importar la carpeta `plugin`       |
| [Custom agents](#export)        | `rule-author` y `rule-miner`                           | `rulebookguard export kiro-agents` |

Para instalar el power: panel Powers → **Add Custom Power** → **Import power from a folder**, con un clon de la carpeta `plugin` de este repositorio. Su servidor MCP ejecuta `npx --yes rulebookguard@0.14.0 mcp` (necesita Node.js y red la primera vez) y busca el rulebook desde el directorio en el que Kiro lo inicia o, si no lo encuentra ahí, desde los roots del workspace que ofrece Kiro. Si las herramientas siguen respondiendo `rulebookguard.config.yaml not found`, agrega la misma entrada, sin `--project`, al `.kiro/settings/mcp.json` del workspace: Kiro inicia los servidores del workspace en la primera carpeta del workspace. No hay hook para Kiro: los archivos de steering ya entregan las reglas.

> [!NOTE]
> Kiro CLI V1 y V2 no cargan automáticamente los archivos de steering `fileMatch`; ahí usa `rulebookguard export agents-md`. Los powers aparecen en CLI V3. Un custom agent lee los archivos de steering solo si sus `resources` incluyen `file://.kiro/steering/**/*.md`.

<details>
<summary>Prompts de ejemplo</summary>

Los prompts funcionan en cualquier idioma. Nombrar al agente (`rule-miner`, `rule-author`) le delega la tarea.

**Adoptar rulebookguard en un proyecto existente**: primero mapear, después un contexto a la vez:

- "Mapea este repositorio en contextos de rulebookguard: lista los dominios de negocio bajo `src/`, propón un nombre de contexto y un prefijo de id para cada uno, y ejecuta `rulebookguard init` para el primero. Todavía no escribas reglas."
- "Usa rule-miner en el contexto clients."
- "Usa rule-miner en el contexto billing y marca con `@implements` el código que aplica cada regla."

Luego revisa el diff, responde las preguntas y pon `status: active` en lo que se sostiene.

**Antes de un cambio:**

- "Usa rule-author para esta funcionalidad: los clientes que se registran en línea pueden crearse sin número de teléfono."
- "¿Qué reglas de negocio aplican a `src/billing/invoice.ts` y cuáles no tienen test?"
- "Lista las reglas que toca mi rama respecto de origin/main y dime cuáles cambiaron sin que cambiaran sus tests."
- "Lista las preguntas abiertas para el negocio en las reglas `proposed` del contexto clients, agrupadas por regla."

**Después de que el código se mueve** (`lint` reporta `dead-evidence` y `unmatched-anchor`):

- "Ejecuta `rulebookguard lint` y corrige cada advertencia `dead-evidence`: encuentra adónde se movió cada símbolo o cómo se renombró, y actualiza la entrada de evidencia. No cambies el texto de la regla."
- "Movimos `src/clients` a `src/customers`. Actualiza los anchors y la evidencia de las reglas de clients, y ejecuta lint hasta que no quede ningún `unmatched-anchor` ni `dead-evidence`."
- "Reescribe cada entrada de evidencia escrita como `path:line` en el rulebook como `path symbol`, nombrando la función, el método o el test de esa línea."
- "Reemplaza los marcadores `@implements` de `src/` por entradas de evidencia en sus reglas: para cada región, agrega el símbolo que la contiene como `path symbol` a la evidencia de la regla y luego elimina las dos líneas de marcador. Muéstrame el diff antes de eliminar nada."

**Actualización:**

- "Lee las notas de actualización de rulebookguard entre nuestra versión y la última, y dime qué cambian para este repositorio antes de tocar nada."
- "Actualiza rulebookguard a la última versión siguiendo la sección de actualización de su README: sube cada versión fijada, aplica las notas de cada versión intermedia y ejecuta lint."

</details>

## Actualización

1. **Lee las notas** de abajo para cada versión entre la tuya y la nueva.
2. **Sube cada versión fijada**: `rulebookguard@<version>` en los comandos `npx` de la CI (`.github/workflows/rulebookguard.yml` si lo escribió `init --ci`) y de los scripts, y las dependencias de desarrollo `rulebookguard`, `@rulebookguard/site` y `@rulebookguard/symbols`, que deben compartir la versión:

   ```sh
   npm install --save-dev rulebookguard@<version> @rulebookguard/symbols@<version>
   ```

3. **Actualiza los agentes.** Claude Code: `claude plugin marketplace update rulebookguard`, luego `claude plugin update rulebookguard@rulebookguard`, y reinicia. Kiro: actualiza el clon de `plugin`, vuelve a importar el power y ejecuta de nuevo `rulebookguard export kiro-agents`.
4. **Regenera los archivos exportados** que commiteas (`export gherkin`, `export cursor|copilot|kiro`, `export agents-md`).
5. **Ejecuta `rulebookguard lint`** y corrige lo que reporte. Las advertencias nuevas nunca cambian el código de salida.

| Versión | Qué hacer                                                                                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.14    | Nada obligatorio. Sin `--project`, `mcp` también busca el rulebook en los roots del cliente, así que los clientes que inician los servidores fuera del workspace (Kiro) pueden quitar un `--project` fijo.                                                                                       |
| 0.13.1  | Evita la 0.13.0 (se publicó a mano por error, sin provenance ni dependencias fijadas): actualiza a la 0.13.1.                                                                                                                                                                                    |
| 0.13    | Nada obligatorio. La [evidencia](#evidencia) ahora se resuelve a líneas y `lint` advierte `dead-evidence`. Opcionalmente instala `@rulebookguard/symbols`, corrige los `dead-evidence` y reescribe las entradas `path:line` como `path symbol`. Los marcadores `@implements` siguen funcionando. |
| 0.9     | Un marcador `@rule` cuenta solo en una línea que empieza con un comentario. Mueve los marcadores que están en nombres de tests, en strings o después de código a su propia línea de comentario, o esas reglas reportarán `untested-rule`.                                                        |
| 0.7     | Cierra cada `@rule <ID>` con `@endrule <ID>` después del test que la prueba; `lint --base` exige un cambio dentro de una región de cada regla modificada.                                                                                                                                        |
| 0.5     | Instala `@rulebookguard/site` junto a `rulebookguard` para seguir usando `site:generate` y `site:run`.                                                                                                                                                                                           |

Las versiones 0.10, 0.11 y 0.12 no requieren ninguna acción.
