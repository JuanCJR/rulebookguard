# rulebookguard

Keep business rules as the single source of truth, readable by humans and AI, and bound to the code and tests that implement them.

Business rules usually end up scattered across code, tickets and people's memory. Neither a developer's memory nor an AI model's reading of the code is deterministic. `rulebookguard` keeps each rule in its own small Markdown file, links it to the code it governs (anchors) and to the tests that prove it (`@rule` tags), and fails CI when they drift apart.

- **Atomic rules.** One file per rule, with YAML frontmatter validated against a versioned JSON Schema.
- **Progressive disclosure.** Contexts map (L0), `id + summary` per context (L1), the full rule (L2), so neither people nor AI models have to read the whole catalog.
- **Inverse index.** Given a file path, list the active rules anchored to it. Deterministic glob matching, no embeddings.
- **Linter.** Untested rules, tags pointing at missing or deprecated rules, dead anchors, invalid files, and rules changed without a test change.

It is language-agnostic: rules are Markdown, and tests in any language link to them through a comment.

## Install

Requires Node.js 22 or later.

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
```

`schema` and `testGlobs` are required (`testGlobs: []` is valid but finds no tags). Unknown fields are rejected. The JSON Schemas ship with the package under `rulebookguard/schemas/v1/`.

Inside a git work tree, files are listed with `git ls-files --cached --others --exclude-standard`, so anything in `.gitignore` (`dist/`, `coverage/`, caches) is never matched by anchors or test globs; files inside submodules are listed too. Outside git, or when the rulebook root itself is git-ignored, the whole tree is walked, skipping only `.git` and `node_modules`. If git fails (for example, git is missing from `PATH` or the repository has dubious ownership), commands print one warning on stderr and walk the tree instead.

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

Scaffolds the next free id of a context as a `proposed` rule and prints its path. Ids are never reused, and an existing file is never overwritten.

```sh
$ rulebookguard new clients
docs/rules/clients/R-CLI-004.md
```

Exits 1 for an unknown context or when the context has no free id left.

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
      - run: npx --yes rulebookguard lint --base origin/main
```

## License

MIT
