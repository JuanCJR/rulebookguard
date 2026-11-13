<!-- prettier-ignore -->
<div align="center">

# rulebookguard

[![npm version](https://img.shields.io/npm/v/rulebookguard?style=flat-square)](https://www.npmjs.com/package/rulebookguard)
[![CI](https://img.shields.io/github/actions/workflow/status/JuanCJR/rulebookguard/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/JuanCJR/rulebookguard/actions/workflows/ci.yml)
![Node version](https://img.shields.io/node/v/rulebookguard?style=flat-square)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

**English** • [Español](README.es.md)

[Install](#install) • [Quick start](#quick-start) • [Writing rules](#writing-rules) • [Commands](#commands) • [Configuration](#configuration) • [CI](#ci-recipe) • [AI agents](#ai-agents) • [Upgrading](#upgrading)

</div>

Business rules drift apart from the code and tests that implement them. rulebookguard keeps each rule in a small Markdown file, links it to its code (**anchors**) and its tests (**`@rule` … `@endrule` regions**), and fails CI when they drift. It is language-agnostic, and it hands the rules of a file to AI agents before they edit it.

```text
docs/rules/clients/R-CLI-001.md   ── anchors ──▶  src/clients/**/*.ts
          ▲
          └── @rule R-CLI-001 … @endrule R-CLI-001  in  src/clients/create.test.ts
```

## Install

Requires Node.js 22 or later. Nothing in your code imports rulebookguard, so run it with `npx` and pin the version:

```sh
npx rulebookguard@0.14.0 lint
```

Each release locks its dependencies for npm and `npx` (`pnpm dlx` and others ignore that lock). To keep the version in your lockfile instead:

```sh
npm install --save-dev rulebookguard
```

## Quick start

1. `npx rulebookguard@0.14.0 init clients --ci` writes `rulebookguard.config.yaml`, the `clients` context and a CI workflow. Adjust `testGlobs` in the [config](#configuration).
2. `npx rulebookguard@0.14.0 new clients` creates `docs/rules/clients/R-CLI-001.md` as `proposed`.
3. Write the rule, add its `anchors`, and set `status: active`. Wrap the test that proves it with `@rule R-CLI-001` and `@endrule R-CLI-001`.
4. `npx rulebookguard@0.14.0 lint`. Then add it to CI with the [CI recipe](#ci-recipe).

## Writing rules

### Catalog layout

One directory per context, one file per rule:

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

`context` must match the directory name. Every rule id in the directory must start with `R-<prefix>-`.

### Rule file

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

| Field           | Required | Meaning                                                            |
| --------------- | -------- | ------------------------------------------------------------------ |
| `id`            | yes      | `R-<PREFIX>-<NNN>`, three digits, unique, equal to the file name   |
| `context`       | yes      | the context directory the rule lives in                            |
| `entities`      | yes      | domain entities the rule talks about                               |
| `status`        | yes      | `proposed`, `active` or `deprecated`                               |
| `supersedes`    | no       | id of the rule this one replaces                                   |
| `dependsOn`     | no       | ids of the rules this one needs in force; no cycles                |
| `conflictsWith` | no       | ids of the rules that cannot be active together with this one      |
| `origin`        | no       | `authored` (written from intent) or `extracted` (lifted from code) |
| `evidence`      | no       | where the rule shows in code or tests, see [Evidence](#evidence)   |
| `anchors`       | yes      | repo-relative globs of the code that implements the rule           |
| `summary`       | yes      | one line; this is what `list` shows                                |

The body holds the full rule and its examples. Rules do not list their tests: the link lives only in the tests.

### Linking tests: `@rule` … `@endrule`

In a file matched by `testGlobs`, `@rule <ID>` opens a region and `@endrule <ID>` closes it. Both lines belong to the region.

```ts
// @rule R-CLI-001
it('rejects a duplicate document in the same country', () => {
  /* ... */
});
// @endrule R-CLI-001
```

> [!IMPORTANT]
> Every `@rule` needs its `@endrule`, or `lint` reports `unclosed-rule-tag`. An `@endrule` with no open `@rule` of the same id is `unmatched-endrule-tag`. `lint --base` needs a change **inside** a region of a changed rule, not anywhere in the test file.

- A marker counts only on a line that starts with a comment: `//`, `/*`, `*`, `#`, `--`, `;`, `<!--` or `%`, after any indentation.
- A marker in a test name, a string, or after code on the same line is not a link.
- Inside a `/* … */` block, start each marker line with `*`.
- Regions may nest if they close in order. One line can carry several markers.

<details>
<summary>Go and Java examples</summary>

Several markers on one line (Go):

```go
// @rule R-CLI-001 @rule R-BIL-001
func TestCreateClient(t *testing.T) {}
// @endrule R-BIL-001 @endrule R-CLI-001
```

Block comments (Java or Kotlin):

```java
/** @rule R-CLI-001 */
@Test
void rejectsDuplicateDocument() {}
/** @endrule R-CLI-001 */
```

</details>

### Marking enforcing code: `@implements` … `@endimplements`

Optional. Anchors say which files a rule governs; an `@implements <ID>` … `@endimplements <ID>` region says which lines enforce it. Same comment, nesting and pairing rules as `@rule`. Only files matched by some rule's `anchors` are scanned, and a region must sit in a file its own rule anchors.

```go
// @implements R-CLI-001
func validateDocument(country, number string) error {
	// ...
}
// @endimplements R-CLI-001
```

### Evidence

`evidence` links a rule to code without touching the code. Each entry is a path, optionally followed by what to find in it:

| entry                                                        | resolves to                                       |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `src/clients/create.ts validateDocument`                     | the definition of `validateDocument`              |
| `src/clients/service.ts Clients.create`                      | `create` inside `Clients` (`::` and `#` work too) |
| `test/clients/create.test.ts "rejects a duplicate document"` | the test with that name                           |
| `src/clients/create.ts`                                      | the file                                          |

Lines are resolved when the rule is read, so the link follows the code. `lint` warns `dead-evidence` when the file or symbol is gone; deprecated rules are not checked. A legacy `path:line` or `path:line-endLine` entry still works, but only its file is checked.

By default a heuristic finds one line. For full ranges, install the optional package (uses [tree-sitter](https://tree-sitter.github.io/); JavaScript, TypeScript/TSX, Python, Go, Java, C#, Rust; ~11 MB, nothing to build):

```sh
npm install --save-dev rulebookguard @rulebookguard/symbols
```

Other languages, and files it fails to read, fall back to the heuristic.

## Commands

`rulebookguard --help` lists them. Exit codes: `0` success, `1` failure (unknown id or context, missing config, lint errors, git errors), `2` usage error (unknown command or option, missing or extra argument).

| Command                                       | What it does                                                 |
| --------------------------------------------- | ------------------------------------------------------------ |
| [`init <context>`](#init)                     | sets up the config, a first context and optionally CI        |
| [`contexts`](#contexts-list-show-search)      | the contexts map (L0)                                        |
| [`list`](#contexts-list-show-search)          | rule ids and summaries (L1)                                  |
| [`show <id>`](#contexts-list-show-search)     | the full rule (L2)                                           |
| [`search <text>`](#contexts-list-show-search) | rules holding every word of a text                           |
| [`for <path>`](#for)                          | the active rules anchored to a file                          |
| [`for --changed <ref>`](#for)                 | the active rules anchored to the files changed since a ref   |
| [`impact <id>`](#impact)                      | the files and tests a rule touches                           |
| [`new <context>`](#new)                       | scaffolds the next rule of a context                         |
| [`lint`](#lint)                               | checks the whole catalog, and optionally changes since a ref |
| [`export gherkin`](#export)                   | writes the rules' scenarios as Cucumber `.feature` files     |
| [`export cursor\|copilot\|kiro`](#export)     | writes the active rules as rule files of other AI tools      |
| [`export agents-md`](#export)                 | keeps an index of the active rules in `AGENTS.md`            |
| [`export kiro-agents`](#export)               | writes the `rule-author` and `rule-miner` agents for Kiro    |
| [`hook`](#hook)                               | Claude Code hook that injects the rules of a file            |
| [`mcp`](#mcp)                                 | MCP server for AI agents                                     |
| [`site:generate`](#site)                      | builds a static site of the rulebook                         |
| [`site:run`](#site)                           | builds the site and serves it locally                        |

The read commands (`contexts`, `list`, `show`, `search`, `for`, `impact`) accept `--json`. With catalog problems they still run and print one warning on stderr pointing at `lint`.

### `init`

`init <context> [--prefix <P>] [--language <en|es>] [--ci]`

```sh
$ rulebookguard init clients --ci
rulebookguard.config.yaml
docs/rules/clients/_context.md
.github/workflows/rulebookguard.yml
```

- Writes `rulesDir: docs/rules` and `testGlobs` `**/*.test.*`, `**/*.spec.*`, `**/test_*.py`, `**/*_test.go`. Narrow them afterwards.
- `--prefix` works as in `new`. `--language` writes `language` into the config.
- `--ci` writes the [CI recipe](#ci-recipe) workflow, pinned to the running version.
- Exit 1, writing nothing: the config (or, with `--ci`, the workflow) already exists, or the context name or prefix is invalid. Exit 2: `--language` other than `en` or `es`.

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

| Command                                  | Notes                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contexts`                               | Says so when the catalog has no context yet.                                                                                                                                                                                                           |
| `list [--context <c>] [--status <s>]`    | `No rules found.` when nothing matches. Exit 1: unknown context. Exit 2: invalid status.                                                                                                                                                               |
| `search <text> [--context <c>] [--json]` | Rules in any status whose id, summary, entities or text hold every word, ignoring case. Plain substring, no index. Output and `--json` (`{ "rules": [...] }`) like `list`; `No rules found.` on no match. Exit 2: empty text. Exit 1: unknown context. |
| `show <id>`                              | The full rule. Exit 1: unknown id.                                                                                                                                                                                                                     |

<details>
<summary><code>show</code> output and JSON shape</summary>

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

- `supersedes`, `dependsOn`, `conflictsWith`, `origin` and `evidence` lines appear only when set. `--json` always has `supersedes` and `origin` (or `null`), and `dependsOn`, `conflictsWith` and `evidence` (or `[]`).
- Each [evidence](#evidence) entry with a symbol is followed by `(lines a-b)`. `--json` keeps `evidence` as written and adds `evidenceLinks: [{ entry, file, line, endLine }]`, with `null` lines when unresolved (or `[]`).
- `implementations:` lists the rule's [`@implements` regions](#marking-enforcing-code-implements--endimplements) as `file:line-endLine`, read from the files its anchors match. `--json`: `implementations: [{ file, line, endLine }]` (or `[]`).

</details>

### `for`

`for <path>` lists the active rules anchored to a path (relative to the current directory). Ask it before touching a file.

```sh
$ rulebookguard for src/clients/create.ts
R-CLI-001 (clients): A client document number is unique per country. (lines 12-30)
```

Line ranges come from `@implements` regions and resolved [evidence](#evidence). `--json` rows carry `regions: [{ line, endLine }]` and `evidence: [{ entry, line, endLine }]` (`[]` when none). Exit 1: path outside the rulebook root.

`for --changed <ref>` lists the active rules anchored to the files changed since a ref, each with those files. Use it to see which rules a pull request touches.

```sh
$ rulebookguard for --changed origin/main
R-BIL-001 (billing): Every new client gets a zero-balance account.
  src/clients/create.ts
R-CLI-001 (clients): A client document number is unique per country.
  src/clients/create.ts
  src/clients/update.ts
```

- Compares the ref with the working tree, like `lint --base`: deleted files and non-ignored untracked files count. A renamed file counts under both paths.
- On a branch behind the ref, files changed on the ref since the branch point count too. In CI, compare against the pull request base on the merge commit (the default pull request checkout).
- `--json`: `{ base, files, rules }`; each rule carries its own `files`.
- None: `No active rules anchored to the files changed since <ref>.` Exit 1: unknown ref or outside a git work tree. Exit 2: both a path and `--changed`.

### `impact`

`impact <id>`: files matched by a rule's anchors, and the tests tagging it. Exit 1: unknown id.

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

`new <context> [--prefix <P>]` scaffolds the next free id as a `proposed` rule and prints its path. A missing context gets its `_context.md` first.

```sh
$ rulebookguard new inventory
docs/rules/inventory/_context.md
docs/rules/inventory/R-INV-001.md
```

- Ids are never reused; existing files are never overwritten. Placeholder text follows `language`.
- The prefix defaults to the first three letters and digits of the name, upper-cased. `--prefix` sets another.
- Exit 1, writing nothing: no free id left; name not lowercase letters, digits, `-` or `_`; prefix invalid or used by another context; `--prefix` differs from an existing context's prefix.

### `lint`

`lint [--base <ref>] [--json]` checks the whole catalog. Exit 1 on any error; 0 with only warnings or nothing (`No issues found.`).

```sh
$ rulebookguard lint
error untested-rule docs/rules/billing/R-BIL-002.md active rule R-BIL-002 has no test tagging it
  hint: wrap a test in a file matched by testGlobs with "@rule R-BIL-002" and "@endrule R-BIL-002", or set the rule's status to proposed
warning context-over-budget docs/rules/clients/_context.md context "clients" has 31 rules, more than the contextBudget of 30
  hint: split the context into smaller ones, or raise contextBudget in rulebookguard.config.yaml
1 error, 1 warning
```

Format: `<severity> <code> <file>[:line] <message>`, a `hint:` line, then a count. `--json`: `{ "findings": [{ "severity", "code", "file", "line"?, "message", "hint" }], "errors", "warnings" }`.

| Severity | Code                          | Meaning                                                            |
| -------- | ----------------------------- | ------------------------------------------------------------------ |
| error    | `untested-rule`               | an active rule has no test tagging it                              |
| error    | `unknown-rule-tag`            | a test tags a rule id that does not exist                          |
| error    | `deprecated-rule-tag`         | a test tags a deprecated rule                                      |
| error    | `unclosed-rule-tag`           | a `@rule` has no matching `@endrule`                               |
| error    | `unmatched-endrule-tag`       | an `@endrule` has no open `@rule` of the same id                   |
| error    | `unclosed-implements-tag`     | an `@implements` has no matching `@endimplements`                  |
| error    | `unmatched-endimplements-tag` | an `@endimplements` has no open `@implements` of the same id       |
| error    | `unknown-implements-tag`      | code is marked as implementing a rule id that does not exist       |
| error    | `deprecated-implements-tag`   | code is marked as implementing a deprecated rule                   |
| error    | `implements-outside-anchors`  | an `@implements` region sits in a file its rule does not anchor    |
| error    | `unmatched-anchor`            | an anchor glob matches no file                                     |
| error    | `schema`                      | a config, context or rule file breaks the JSON Schema              |
| error    | `duplicate-id`                | two rule files share an id                                         |
| error    | `file-name-mismatch`          | a rule file is not named `<id>.md`                                 |
| error    | `id-prefix-mismatch`          | a rule id does not use its context prefix                          |
| error    | `context-mismatch`            | a `context` field does not match its directory                     |
| error    | `missing-context-file`        | a context directory has no `_context.md`                           |
| error    | `missing-rules-dir`           | `rulesDir` does not exist                                          |
| error    | `pending-implementation`      | with `--base`: an active rule changed, but none of its regions did |
| error    | `invalid-rule-reference`      | `dependsOn` or `conflictsWith` names an unknown rule or itself     |
| error    | `dependency-cycle`            | `dependsOn` links form a cycle (reported once, at its lowest id)   |
| error    | `active-rule-conflict`        | two active rules where one lists the other in `conflictsWith`      |
| warning  | `context-over-budget`         | a context holds more rules than `contextBudget`                    |
| warning  | `dead-evidence`               | an `evidence` entry names a file or a symbol that no longer exists |

An invalid config is reported as `schema` findings. Tags of a rule file that fails the schema are not reported again as `unknown-rule-tag`.

**`--base <ref>`** also checks what changed against `<ref>`: a changed rule file needs a change inside one of its `@rule` … `@endrule` regions, or it is `pending-implementation`.

```sh
$ rulebookguard lint --base origin/main
error pending-implementation docs/rules/clients/R-CLI-001.md rule R-CLI-001 changed since origin/main but none of the tests tagging it changed
  hint: update or add a test inside an "@rule R-CLI-001" … "@endrule R-CLI-001" region that covers the changed rule
1 error, 0 warnings
```

<details>
<summary>How <code>--base</code> decides what changed</summary>

- Changed files: `git diff --name-only <ref>` plus untracked files, so uncommitted work counts.
- Region changes: `git diff -U0 <ref>`. An untracked test file counts whole. A deletion counts when it falls strictly inside the region.
- A change elsewhere in the test file (another test, a blank line between regions) does not count.
- An active rule no test tags is reported only as `untested-rule`.
- Only rules `active` after the change are checked: new active rules yes, `proposed` and `deprecated` no.
- Exit 1 outside a git work tree, with a ref git cannot resolve, or when git fails listing changes.

</details>

### `export`

All `export` commands take `[--out <dir>]`, relative to the current directory. Generated files carry a "Generated by" line; edit the rule instead.

| Command                        | Writes                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `export gherkin`               | the ` ```gherkin ` blocks of every non-deprecated rule as `<out>/<context>/<id>.feature` (default `features/rules`)                    |
| `export cursor\|copilot\|kiro` | one file per active rule with anchors, scoped to its anchors (table below)                                                             |
| `export agents-md`             | an index of the active rules in `AGENTS.md`                                                                                            |
| `export kiro-agents`           | `rule-author` and `rule-miner` as [Kiro custom agents](https://kiro.dev/docs/custom-agents/) in `.kiro/agents/rulebookguard-<name>.md` |

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
<summary>Export details</summary>

**`export gherkin`**

- Each file is tagged with the rule id: run or filter a rule's scenarios with Cucumber `--tags @R-CLI-001`. These are Cucumber tags, not `@rule` regions: link step definitions with `@rule` … `@endrule`.
- `# language:` lines in blocks are dropped. With `language: es` the file starts with `# language: es` and uses `Característica:`.
- Generated files are overwritten; nothing else in the output directory is touched. A feature of a rule that was deprecated or lost its scenarios stays until you delete it.
- Nothing to write: `No rule has Gherkin scenarios.`

**`export cursor|copilot|kiro`**: files go under the rulebook root, or directly in `--out`:

| Format    | File                                                      | Scoped with                                         |
| --------- | --------------------------------------------------------- | --------------------------------------------------- |
| `cursor`  | `.cursor/rules/rulebookguard-<id>.mdc`                    | `globs`, comma-separated, with `alwaysApply: false` |
| `copilot` | `.github/instructions/rulebookguard-<id>.instructions.md` | `applyTo`, comma-separated                          |
| `kiro`    | `.kiro/steering/rulebookguard-<id>.md`                    | `inclusion: fileMatch` and `fileMatchPattern`       |

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

- Rerun after changing rules (in CI or before committing). It overwrites generated files and removes those of rules no longer active, printing `removed <path>`.
- Only a file named after a rule id, with the generated line right after its frontmatter, is removed. If an active rule's file lacks that line, the command exits 1 before writing or removing anything.
- An active rule without anchors is skipped with a warning on stderr.
- Nothing to write: `No active rule to export.` or `No active rule with anchors to export.`
- Brace anchors expand into one pattern per option. An anchor with a literal comma in a file name cannot be written in the comma-separated formats.

**`export agents-md`**

- Writes at the rulebook root or in `--out`. `AGENTS.md` is always read and has no path scoping, so it holds each rule's id, anchors (or `no anchors`), summary and rule file, not the full text.
- The index lives between `<!-- rulebookguard:start -->` and `<!-- rulebookguard:end -->`. The rest of the file is kept; the block is appended the first time and replaced after that.
- No active rule: the block is removed, and the file too if nothing else is left (`removed AGENTS.md`).
- Anything other than one start marker followed by one end marker, or neither, exits 1 and leaves the file untouched.

**`export kiro-agents`**

- Writes under the rulebook root or directly in `--out`. Each file carries its own MCP server, pinned to the CLI version that wrote it, and the rule writing guide, so it works without the [Kiro power](#kiro). Rerun after upgrading.
- Other files in the directory are left alone. If `rulebookguard-rule-author.md` or `rulebookguard-rule-miner.md` lacks the generated line, the command exits 1 before writing anything.

</details>

### `hook`

A Claude Code hook for `PreToolUse` and `PostToolUse` events of tools that take a `file_path`. The [Claude Code plugin](#claude-code-plugin) wires it up. It prints the active rules anchored to the file as additional context, under the same `hookEventName`:

```sh
$ echo '{"hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"/repo/src/billing/invoice.go"}}' | rulebookguard hook
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Business rules anchored to src/billing/invoice.go (rulebookguard). …"}}
```

> [!NOTE]
> The hook never blocks a tool and never answers the permission prompt: with no config, a path outside the rulebook root, no active rule, another event, unreadable input or any error, it prints nothing and exits 0.

<details>
<summary>Hook details</summary>

- Reads the event JSON on stdin and takes `tool_input.file_path` (relative paths resolve against the event's `cwd`). Finds `rulebookguard.config.yaml` by walking up from that file.
- A `PostToolUse` hook on `Read` delivers the rules with the file contents, before Claude writes a change (Claude Code requires reading a file before editing it).
- Each rule comes with its id, context, summary, rule file, the lines of its `@implements` regions and evidence in that file, and full text. Above 10,000 characters only summaries are listed, with a pointer to `rulebookguard show <id>`.
- The header follows `language`.

</details>

### `mcp`

`mcp [--project <dir>]`: an [MCP](https://modelcontextprotocol.io) server over stdio with read-only tools. The rulebook is found from `--project` (default: the current directory). Without `--project`, when no `rulebookguard.config.yaml` is found from the current directory up, each tool call uses the first [root](https://modelcontextprotocol.io/specification/2025-06-18/client/roots) the client offers that has one, so a single global entry works for every project of a client that starts servers outside the workspace.

| Tool           | Input                                                  | Answers                                                       |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `rules_for`    | `path`: absolute, or relative to the project directory | what `rulebookguard for <path> --json` prints                 |
| `rules_show`   | `id`: a rule id                                        | what `rulebookguard show <id> --json` prints                  |
| `contexts`     | none                                                   | what `rulebookguard contexts --json` prints                   |
| `rules_list`   | `context`?, `status`?                                  | what `rulebookguard list --json` prints with those options    |
| `rules_search` | `text`, `context`?                                     | what `rulebookguard search <text> --json` prints              |
| `lint`         | `base`?: a git ref                                     | what `rulebookguard lint --json` prints, with `--base` if set |

A failing command answers a tool error with the CLI's message, for example `Unknown rule id "R-NOPE-001". Run "rulebookguard list" to list them.` Lint findings are data: `lint` fails only when lint cannot run.

### `site`

> [!IMPORTANT]
> The site commands need a separate package (Astro, Node.js 22.23.4 or later):
>
> ```sh
> npm install --save-dev rulebookguard @rulebookguard/site
> ```
>
> Without it they exit 1 with `The site commands need the @rulebookguard/site package. Install it next to rulebookguard: npm install --save-dev @rulebookguard/site`. One-off: `npx -p rulebookguard@0.14.0 -p @rulebookguard/site@0.14.0 rulebookguard site:run`.

| Command                                                   | What it does                                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `site:generate [--out <dir>] [--base <path>]` (or `site`) | builds a read-only [Astro Starlight](https://starlight.astro.build) site into `--out` (default `site`) and prints the path |
| `site:run [--out <dir>] [--base <path>] [--port <n>]`     | builds, then serves `--out` on `127.0.0.1` (port 4321, or `--port`) until Ctrl+C                                           |

```sh
$ rulebookguard site:generate --out public/rules --base /rules
public/rules

$ rulebookguard site:run
site
Serving site at http://127.0.0.1:4321/ (Ctrl+C to stop)
```

- Open it from disk or publish it as is (for example GitHub Pages). Use `--base` when served from a sub-path.
- `site:run`: unknown paths get the 404 page; a taken port exits 1 before building.

> [!WARNING]
> `site` replaces `--out` only when it is empty or was written by an earlier `site`. Any other non-empty directory exits 1, untouched. Add the output directory to `.gitignore` unless you mean to commit it.

<details>
<summary>What the site shows</summary>

- **Home:** the contexts map, with rule counts per status.
- **A page per context** with its description and rules.
- **All rules:** one table filterable by text, context and status.
- **A page per rule:** summary, status, entities, rule file, supersedes chain both ways, origin (an `extracted` rule still `proposed` is flagged as not validated by the business yet), evidence with `file:line-endLine`, text, anchors and matched files, tagging tests, and the rule file's git history.
- **Health:** the `lint` findings at build time.
- Full-text search (Pagefind).

The interface follows `language`. The site is a view: edit rules in their files, through pull requests.

</details>

## Configuration

`rulebookguard.config.yaml` at the repository root. Commands find it by walking up from the current directory; catalog paths are relative to its directory.

```yaml
schema: 1
testGlobs: ['src/**/*.test.ts', 'tests/**/test_*.py']
language: es
```

| Key             | Required | Default      | Meaning                                                                                       |
| --------------- | -------- | ------------ | --------------------------------------------------------------------------------------------- |
| `schema`        | yes      | —            | config schema version (`1`)                                                                   |
| `testGlobs`     | yes      | —            | files scanned for `@rule` tags; `[]` is valid but finds no tags                               |
| `rulesDir`      | no       | `docs/rules` | where the contexts live                                                                       |
| `contextBudget` | no       | `30`         | `lint` warns when a context holds more rules                                                  |
| `language`      | no       | `en`         | `en` or `es`: language of the text rulebookguard generates (0.1.1+; older versions reject it) |

Unknown fields are rejected. The JSON Schemas ship under `rulebookguard/schemas/v1/`.

<details>
<summary>What <code>language</code> covers</summary>

It covers the `new` template, the hook context, the site, and every message printed once the config is loaded (lint findings, errors, warnings, headers, and the `message` of `--json` output). Lint codes, JSON keys and values such as `active` stay in English. So do `--help`, argument errors and the findings of an invalid config file, which come before the config is read. Rule content is never checked for language.

</details>

<details>
<summary>How files are listed</summary>

- Inside a git work tree: `git ls-files --cached --others --exclude-standard`, so anything in `.gitignore` (`dist/`, `coverage/`, caches) is never matched. Files inside submodules are listed too.
- A submodule path that is a symlink, or resolves outside the rulebook root, is skipped. A symlinked test file is scanned only when its target is inside the rulebook root.
- A submodule that cannot be listed prints `warning: could not list files of submodule "<path>" (<reason>); skipping it.` and the rest is kept.
- Outside git, or when the rulebook root is git-ignored, the whole tree is walked, skipping `.git` and `node_modules`.
- If git fails (missing from `PATH`, dubious ownership), commands print one warning on stderr and walk the tree.

</details>

## CI recipe

`rulebookguard init --ci` writes this as `.github/workflows/rulebookguard.yml`. `fetch-depth: 0` makes the base branch available.

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
> Keep the version pinned, or run it from your lockfile, so a new release never changes CI results by itself.

## AI agents

### Claude Code plugin

```sh
claude plugin marketplace add JuanCJR/rulebookguard
claude plugin install rulebookguard@rulebookguard
```

Or, in Claude Code 2.1.275 or later: `/plugin install rulebookguard --marketplace JuanCJR/rulebookguard`.

The plugin in [`plugin/`](plugin) provides:

| Piece                              | What it does                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hooks                              | run `rulebookguard hook` after every `Read` and before every `Write` (a `Write` of a new file gets the rules right after creation)                           |
| MCP server                         | the [`mcp`](#mcp) tools, for files Claude has not opened and for working on the rulebook                                                                     |
| Skill `rulebookguard:rules`        | the protocol: follow the rules; change a rule (then tests, then code, inside its `@implements` regions; new regions only on request) only when the user asks |
| Skill `rulebookguard:rule-writing` | the shared writing guide: one verifiable behavior, a one-line business summary, Gherkin, `origin` and `evidence` for extracted rules                         |
| Agent `rulebookguard:rule-miner`   | lifts rules existing code enforces into `proposed` rules, one context at a time. Ask: "use rule-miner on the clients context"                                |
| Agent `rulebookguard:rule-author`  | plans the rule changes a feature needs, stops for approval, then writes them. Ask: "use rule-author for this feature: …"                                     |

The plugin runs the project's own `node_modules/rulebookguard` (in the project directory or a parent) when its version is at least the plugin's; otherwise `npx rulebookguard@<plugin version>`, which needs Node.js and network the first time. In a rulebookguard checkout it runs the built `dist/cli.mjs` (from `vp pack`). Any hook failure, including a timeout, lets the tool go ahead without rules.

<details>
<summary>What the agents do and never do</summary>

**rule-miner** writes `proposed` rules with `origin: extracted`, evidence as `path symbol`, and questions for the business, through `rulebookguard new`. It traces every flow of the context from entry points to persistence first, and its report starts with those flows. It checks existing rules to avoid duplicates, stays within `contextBudget`, wraps tests that already verify a rule in `@rule` … `@endrule`, and finishes only when `lint` has no errors of its own. It never activates or edits existing rules, and does not edit production code: it suggests enforcing lines and adds `@implements` … `@endimplements` markers only when asked. A person reviews the diff and activates what holds.

**rule-author** writes nothing by default. It reads the rulebook by levels and returns a plan: new rules with Gherkin, changed rules as diffs, deprecations, conflicts with active rules, test skeletons and open questions. Called again with the approved plan, it writes new rules as `proposed` through `rulebookguard new`, applies the approved diffs, and finishes when `lint` has no errors of its own. Tests and code come after, as the `rules` skill says.

</details>

### Kiro

Keep `rulebookguard.config.yaml` at the Kiro workspace root: Kiro reads `.kiro/` from there, and steering patterns are relative to the rulebook root.

| Piece                        | What it gives Kiro                                       | How to get it                      |
| ---------------------------- | -------------------------------------------------------- | ---------------------------------- |
| [Steering files](#export)    | the active rules of the files it works on                | `rulebookguard export kiro`        |
| Power in [`plugin/`](plugin) | the `rules` and `rule-writing` skills and the MCP server | import the `plugin` folder         |
| [Custom agents](#export)     | `rule-author` and `rule-miner`                           | `rulebookguard export kiro-agents` |

To install the power: Powers panel → **Add Custom Power** → **Import power from a folder**, with a clone of this repository's `plugin` folder. Its MCP server runs `npx --yes rulebookguard@0.14.0 mcp` (needs Node.js and network the first time) and finds the rulebook from the directory Kiro starts it in or, failing that, from the workspace roots Kiro offers. If the tools still answer `rulebookguard.config.yaml not found`, add the same entry, without `--project`, to the workspace `.kiro/settings/mcp.json`: Kiro starts workspace servers in the first workspace folder. There is no Kiro hook: steering files already deliver the rules.

> [!NOTE]
> Kiro CLI V1 and V2 do not load `fileMatch` steering files automatically; use `rulebookguard export agents-md` there. Powers are listed for CLI V3. A custom agent reads steering files only if its `resources` include `file://.kiro/steering/**/*.md`.

<details>
<summary>Example prompts</summary>

Prompts work in any language. Naming the agent (`rule-miner`, `rule-author`) hands the task to it.

**Adopting rulebookguard in an existing project** — map first, then one context at a time:

- "Map this repository into rulebookguard contexts: list the business domains under `src/`, propose a context name and id prefix for each, and run `rulebookguard init` for the first one. Do not write rules yet."
- "Use rule-miner on the clients context."
- "Use rule-miner on the billing context, and mark the code that enforces each rule with `@implements`."

Then review the diff, answer the questions, and set `status: active` on what holds.

**Before a change:**

- "Use rule-author for this feature: clients who register online can be created without a phone number."
- "Which business rules apply to `src/billing/invoice.ts`, and which of them have no test?"
- "List the rules my branch touches against origin/main, and tell me which ones changed without a change in their tests."
- "List the open questions for the business in the proposed rules of the clients context, grouped by rule."

**After the code moves** (`lint` reports `dead-evidence` and `unmatched-anchor`):

- "Run `rulebookguard lint` and fix every `dead-evidence` warning: find where each symbol moved or what it was renamed to, and update the evidence entry. Do not change the rule text."
- "We moved `src/clients` to `src/customers`. Update the anchors and the evidence of the clients rules, then run lint until no `unmatched-anchor` or `dead-evidence` is left."
- "Rewrite every evidence entry written as `path:line` in the rulebook as `path symbol`, naming the function, method or test at that line."
- "Replace the `@implements` markers in `src/` with evidence entries on their rules: for each region, add the enclosing symbol as `path symbol` to the rule's evidence, then remove both marker lines. Show me the diff before removing anything."

**Upgrading:**

- "Read the Upgrading notes of rulebookguard between our version and the latest one, and tell me what they change for this repository before touching anything."
- "Upgrade rulebookguard to the latest version following the Upgrading section of its README: bump every pinned version, apply the notes of each version in between, and run lint."

</details>

## Upgrading

1. **Read the notes** below for every version between yours and the new one.
2. **Bump every pinned version**: `rulebookguard@<version>` in `npx` commands in CI (`.github/workflows/rulebookguard.yml` when `init --ci` wrote it) and scripts, and the `rulebookguard`, `@rulebookguard/site` and `@rulebookguard/symbols` dev dependencies, which must share the version:

   ```sh
   npm install --save-dev rulebookguard@<version> @rulebookguard/symbols@<version>
   ```

3. **Update the agents.** Claude Code: `claude plugin marketplace update rulebookguard`, then `claude plugin update rulebookguard@rulebookguard`, and restart. Kiro: update the `plugin` clone, import the power again, and rerun `rulebookguard export kiro-agents`.
4. **Regenerate exported files** you commit (`export gherkin`, `export cursor|copilot|kiro`, `export agents-md`).
5. **Run `rulebookguard lint`** and fix what it reports. New warnings never change the exit code.

| Version | What to do                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.14    | Nothing required. Without `--project`, `mcp` also finds the rulebook in the client roots, so clients that start servers outside the workspace (Kiro) can drop a hardcoded `--project`.                                                                  |
| 0.13.1  | Skip 0.13.0 (published by hand by mistake, without provenance and locked dependencies): upgrade to 0.13.1.                                                                                                                                              |
| 0.13    | Nothing required. [Evidence](#evidence) now resolves to lines and `lint` warns `dead-evidence`. Optionally install `@rulebookguard/symbols`, fix `dead-evidence`, and rewrite `path:line` entries as `path symbol`. `@implements` markers keep working. |
| 0.9     | A `@rule` marker counts only on a line that starts with a comment. Move markers in test names, strings or after code to their own comment line, or those rules report `untested-rule`.                                                                  |
| 0.7     | Close each `@rule <ID>` with `@endrule <ID>` after the test that proves it; `lint --base` needs a change inside a region of each changed rule.                                                                                                          |
| 0.5     | Install `@rulebookguard/site` next to `rulebookguard` to keep using `site:generate` and `site:run`.                                                                                                                                                     |

0.10, 0.11 and 0.12 need no action.
