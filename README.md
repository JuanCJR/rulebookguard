# rulebookguard

Keep business rules as the single source of truth, readable by humans and AI, and bound to the code and tests that implement them.

Business rules usually end up scattered across code, tickets and people's memory. Neither a developer's memory nor an AI model's reading of the code is deterministic. `rulebookguard` keeps each rule in its own small Markdown file, links it to the code it governs (anchors) and to the tests that prove it (`@rule` tags), and fails CI when they drift apart.

- **Atomic rules.** One file per rule, with YAML frontmatter validated against a versioned JSON Schema.
- **Progressive disclosure.** Contexts map (L0), `id + summary` per context (L1), the full rule (L2), so neither people nor AI models have to read the whole catalog.
- **Inverse index.** Given a file path, list the active rules anchored to it. Deterministic glob matching, no embeddings.
- **Linter.** Untested rules, tags pointing at missing or deprecated rules, dead anchors, invalid files, and rules changed without a test change.

It is language-agnostic: rules are Markdown, and tests in any language link to them through a comment.

## Install

Requires Node.js 22.23.4 or later (the `site:generate` and `site:run` commands build with Astro 7, which needs it).

```sh
npx rulebookguard lint
```

Or add it to a project:

```sh
npm install --save-dev rulebookguard
```

## Configuration

Put `rulebookguard.config.yaml` at the repository root. Commands find it by walking up from the current directory, and every path in the catalog is relative to the directory that holds it.

```yaml
schema: 1
rulesDir: docs/rules # default: docs/rules
testGlobs: # required: files scanned for @rule tags
  - 'src/**/*.test.ts'
  - 'tests/**/test_*.py'
contextBudget: 30 # default: 30; lint warns when a context holds more rules
language: es # default: en; language of the text that rulebookguard generates
```

`schema` and `testGlobs` are required (`testGlobs: []` is valid but finds no tags). Unknown fields are rejected.

`language` (`en` or `es`) sets the language of the text rulebookguard writes for you, such as the template of `new`. Rule content is free text and is never checked for language, so rules can be written in any language whatever this setting says. `language` needs rulebookguard 0.1.1 or later; older versions reject it as an unknown field. The JSON Schemas ship with the package under `rulebookguard/schemas/v1/`.

Inside a git work tree, files are listed with `git ls-files --cached --others --exclude-standard`, so anything in `.gitignore` (`dist/`, `coverage/`, caches) is never matched by anchors or test globs; files inside submodules are listed too. A submodule path that is a symlink, or that resolves outside the rulebook root, is skipped. A test file that is a symlink is scanned for `@rule` tags only when its target lies inside the rulebook root. If one submodule cannot be listed, commands print `warning: could not list files of submodule "<path>" (<reason>); skipping it.` and keep the rest of the git listing. Outside git, or when the rulebook root itself is git-ignored, the whole tree is walked, skipping only `.git` and `node_modules`. If git fails (for example, git is missing from `PATH` or the repository has dubious ownership), commands print one warning on stderr and walk the tree instead.

## Catalog layout

Rules are grouped by context, one directory per context:

```text
docs/rules/
  clients/
    _context.md       # the context: name, id prefix, summary
    R-CLI-001.md      # one rule per file, named after its id
    R-CLI-002.md
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

The `context` field must match the directory name, and every rule id in the directory must start with `R-<prefix>-`.

## Rule file format

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

| Field        | Required | Meaning                                                          |
| ------------ | -------- | ---------------------------------------------------------------- |
| `id`         | yes      | `R-<PREFIX>-<NNN>`, three digits, unique, equal to the file name |
| `context`    | yes      | the context directory the rule lives in                          |
| `entities`   | yes      | domain entities the rule talks about                             |
| `status`     | yes      | `proposed`, `active` or `deprecated`                             |
| `supersedes` | no       | id of the rule this one replaces                                 |
| `anchors`    | yes      | repo-relative globs of the code that implements the rule         |
| `summary`    | yes      | one line; this is what `list` shows                              |

The Markdown body holds the full rule and its examples (Gherkin scenarios or tables). Rules do not list their tests: the link lives only in the tests, through `@rule` tags.

## The `@rule` tag

A test links to a rule with `@rule <ID>` inside any comment, in any file matched by `testGlobs`. One comment can carry several tags.

TypeScript or JavaScript:

```ts
// @rule R-CLI-001
it('rejects a duplicate document in the same country', () => {
  /* ... */
});
```

Go:

```go
// @rule R-CLI-001 @rule R-BIL-001
func TestCreateClient(t *testing.T) {}
```

Python:

```python
# @rule R-CLI-001
def test_duplicate_document():
    ...
```

Java or Kotlin:

```java
/** @rule R-CLI-001 */
@Test
void rejectsDuplicateDocument() {}
```

SQL:

```sql
-- @rule R-BIL-002
SELECT count(*) FROM invoices WHERE number IS NULL;
```

## Commands

`rulebookguard --help` prints the command list. Exit codes: `0` success, `1` failure (unknown id or context, missing config, lint errors, git errors), `2` usage error (unknown command or option, missing or extra argument).

The read commands (`contexts`, `list`, `show`, `for`, `impact`) accept `--json` for machine consumers. When the catalog has problems they still run, and print one warning on stderr pointing at `lint`.

### `contexts` (L0)

```sh
$ rulebookguard contexts
billing (BIL, 2 rules): Invoices and taxes charged to clients.
clients (CLI, 3 rules): Customers that receive installation services.
```

### `list [--context <c>] [--status <s>]` (L1)

```sh
$ rulebookguard list --context clients --status active
R-CLI-001 [active] A client document number is unique per country.
```

Exits 1 for an unknown context and 2 for an invalid status.

### `show <id>` (L2)

```sh
$ rulebookguard show R-CLI-001
R-CLI-001: A client document number is unique per country.
context: clients
status: active
entities: Client
anchors: src/clients/**/*.ts, src/api/clients.controller.ts
supersedes: R-CLI-000
file: docs/rules/clients/R-CLI-001.md

# Unique document number
...
```

Exits 1 for an unknown id.

### `for <path>`

Active rules whose anchors match a path, relative to the current directory. This is what an editor hook or an AI agent asks before touching a file.

```sh
$ rulebookguard for src/clients/create.ts
R-CLI-001 (clients): A client document number is unique per country.
```

Exits 1 when the path is outside the rulebook root.

### `impact <id>`

Files matched by a rule's anchors and the tests tagging it.

```sh
$ rulebookguard impact R-CLI-001
R-CLI-001: A client document number is unique per country.
Files matched by anchors (2):
  src/clients/create.ts
  src/clients/update.ts
Tests tagging R-CLI-001 (1):
  src/clients/create.test.ts:12
```

Exits 1 for an unknown id.

### `new <context>`

Scaffolds the next free id of a context as a `proposed` rule and prints its path. Ids are never reused, and an existing file is never overwritten. The placeholder text of the new rule follows `language` in the config.

```sh
$ rulebookguard new clients
docs/rules/clients/R-CLI-004.md
```

Exits 1 for an unknown context or when the context has no free id left.

### `hook`

A Claude Code hook for `PreToolUse` and `PostToolUse` events of tools that take a `file_path` (the Claude Code plugin below wires it up). It reads the hook event as JSON on stdin, takes `tool_input.file_path` (relative paths resolve against the event's `cwd`), finds `rulebookguard.config.yaml` by walking up from that file, and prints the active rules anchored to it as additional context for Claude, under the same `hookEventName`:

```sh
$ echo '{"hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"/repo/src/billing/invoice.go"}}' | rulebookguard hook
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Business rules anchored to src/billing/invoice.go (rulebookguard). …"}}
```

Claude Code adds the context next to the tool result, so a `PostToolUse` hook on `Read` delivers the rules together with the file contents, before Claude writes a change (Claude Code requires reading a file before editing it).

Each rule comes with its id, context, summary, rule file and full text; when the texts add up to more than 10,000 characters only the summaries are listed, with a pointer to `rulebookguard show <id>`. The header follows `language` in the config. The hook never blocks a tool and never answers the permission prompt: with no config, a path outside the rulebook root, no active rule, another event, unreadable input or any error, it prints nothing and exits 0.

### `mcp [--project <dir>]`

An [MCP](https://modelcontextprotocol.io) server over stdio for AI agents, with two read-only tools:

| Tool         | Input                                                  | Answers                                       |
| ------------ | ------------------------------------------------------ | --------------------------------------------- |
| `rules_for`  | `path`: absolute, or relative to the project directory | what `rulebookguard for <path> --json` prints |
| `rules_show` | `id`: a rule id                                        | what `rulebookguard show <id> --json` prints  |

The rulebook is found from `--project` (default: the current directory). A command that would fail answers a tool error carrying the same message the CLI prints, for example `Unknown rule id "R-NOPE-001". Run "rulebookguard list" to list them.`

### `site:generate [--out <dir>] [--base <path>]`

Builds a read-only static site of the rulebook with [Astro Starlight](https://starlight.astro.build) into `--out` (default `site`, relative to the current directory) and prints that path. Open it from disk or publish it as is, for example on GitHub Pages; pass `--base` when it is served from a sub-path (`--base /rules`).

```sh
$ rulebookguard site:generate --out public/rules --base /rules
public/rules
```

`site` is the same command.

### `site:run [--out <dir>] [--base <path>] [--port <n>]`

Builds the site like `site:generate`, then serves `--out` on `127.0.0.1` (port 4321, or `--port`) and prints the URL, until Ctrl+C. Unknown paths get the site's 404 page. A taken port fails, exit 1, before building.

```sh
$ rulebookguard site:run
site
Serving site at http://127.0.0.1:4321/ (Ctrl+C to stop)
```

The site has:

- **Home:** the contexts map, with how many rules of each status every context holds.
- **A page per context** with its description and rules.
- **All rules:** one table filterable by text, context and status.
- **A page per rule:** summary, status, entities, rule file, the supersedes chain both ways, the rule text, its anchors and the files they match, the tests tagging it, and the git history of the rule file.
- **Health:** the `lint` findings when the site was built.
- Full-text search (Pagefind).

Generated text and the interface follow `language` in the config. The site is a view: rules are still edited in their files, through pull requests. `site` replaces `--out` only when it is empty or was written by an earlier `site`; any other non-empty directory makes it fail, exit 1, without touching it. Add the output directory to `.gitignore` unless you mean to commit it.

### `lint [--base <ref>] [--json]`

Checks the whole catalog. Each finding is printed as `<severity> <code> <file>[:line] <message>`, followed by a count.

| Severity | Code                     | Meaning                                                          |
| -------- | ------------------------ | ---------------------------------------------------------------- |
| error    | `untested-rule`          | an active rule has no test tagging it                            |
| error    | `unknown-rule-tag`       | a test tags a rule id that does not exist                        |
| error    | `deprecated-rule-tag`    | a test tags a deprecated rule                                    |
| error    | `unmatched-anchor`       | an anchor glob matches no file                                   |
| error    | `schema`                 | a config, context or rule file breaks the JSON Schema            |
| error    | `duplicate-id`           | two rule files share an id                                       |
| error    | `file-name-mismatch`     | a rule file is not named `<id>.md`                               |
| error    | `id-prefix-mismatch`     | a rule id does not use its context prefix                        |
| error    | `context-mismatch`       | a `context` field does not match its directory                   |
| error    | `missing-context-file`   | a context directory has no `_context.md`                         |
| error    | `missing-rules-dir`      | `rulesDir` does not exist                                        |
| error    | `pending-implementation` | with `--base`: an active rule changed, but none of its tests did |
| warning  | `context-over-budget`    | a context holds more rules than `contextBudget`                  |

```sh
$ rulebookguard lint
error untested-rule docs/rules/billing/R-BIL-002.md active rule R-BIL-002 has no test tagging it
warning context-over-budget docs/rules/clients/_context.md context "clients" has 31 rules, more than the contextBudget of 30
1 error, 1 warning
```

Exits 1 when there is any error, and 0 when there are only warnings or nothing at all (`No issues found.`). An invalid `rulebookguard.config.yaml` is reported as `schema` findings too; tags of a rule file that fails the schema are not reported again as `unknown-rule-tag`.

With `--base <ref>`, lint also compares `<ref>` with the working tree (`git diff --name-only <ref>` plus untracked files, so uncommitted work counts). A rule whose file changed must come with a change in at least one test that tags it, otherwise it is reported as `pending-implementation`; an active rule that no test tags at all is reported only as `untested-rule`. Only rules whose status is `active` after the change are checked: new active rules are checked, `proposed` and `deprecated` rules are not. Outside a git work tree, with a ref git cannot resolve, or when git fails while listing the changes, lint fails with exit code 1.

```sh
$ rulebookguard lint --base origin/main
error pending-implementation docs/rules/clients/R-CLI-001.md rule R-CLI-001 changed since origin/main but none of the tests tagging it changed
1 error, 0 warnings
```

`--json` prints `{ "findings": [{ "severity", "code", "file", "line"?, "message" }], "errors", "warnings" }`.

## CI recipe

Run the linter on every pull request, comparing against the main branch. The full history is needed so that `origin/main` exists.

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
      - run: npx --yes rulebookguard@0.1.0 lint --base origin/main
```

Pin the version, or add rulebookguard as a dev dependency and run it from the lockfile, so a new release never changes CI results by itself.

## Claude Code plugin

The plugin in [`plugin/`](plugin) connects the rulebook to Claude Code:

- **Hooks:** after every `Read` and before every `Write`, it runs `rulebookguard hook`, so Claude gets the active rules anchored to a file together with its contents, before it writes a change. A `Write` of a new file, which needs no `Read`, gets them right after the file is created.
- **MCP server:** the `rules_for` and `rules_show` tools from `rulebookguard mcp`, for rules of files Claude has not opened yet.
- **Skill** `rulebookguard:rules`: the protocol, that is, follow the rules, and change a rule (then its tests, then the code) only when the user asks for the behavior change.

Install it from this repository's marketplace:

```sh
claude plugin marketplace add JuanCJR/rulebookguard
claude plugin install rulebookguard@rulebookguard
```

Or, inside Claude Code 2.1.275 or later: `/plugin install rulebookguard --marketplace JuanCJR/rulebookguard`.

The plugin runs the project's own rulebookguard (`node_modules/rulebookguard`, in the project directory or a parent) when its version is at least the plugin's; otherwise it runs `npx rulebookguard@<plugin version>`, which needs Node.js and network access the first time. The hooks never block a tool: any failure, including a timeout, lets it go ahead without rules.

## Releasing

Releases are published to npm from GitHub Actions with [trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is stored and every version carries a provenance attestation. To release, bump `version` in `package.json` and in `plugin/.claude-plugin/plugin.json` (a test keeps them equal), merge it to `main`, then push a matching tag:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The `Release` workflow fails without publishing when the tag does not match the package version, or when `vp check`, `vp test` or `vp pack` fails.

## License

MIT
