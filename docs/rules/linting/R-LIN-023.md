---
id: R-LIN-023
context: linting
entities: [Rule]
status: active
anchors:
  - 'src/commands/lint.ts'
  - 'src/catalog/git.ts'
summary: Lint with --base stops with a message and status 2, checking nothing, when the rulebook is not in a git work tree or the ref names no commit.
origin: extracted
evidence:
  - 'src/commands/lint.ts lintCommand'
  - 'src/commands/lint.ts changedFiles'
  - 'src/catalog/git.ts isCommitRef'
  - 'test/cli/lint-base.test.ts "fails clearly on an unknown ref and exits 2"'
  - 'test/cli/lint-base.test.ts "fails clearly outside a git work tree and exits 2"'
---

# --base needs a work tree and a known ref

`rulebookguard lint --base <ref>` can only compare when the rulebook sits inside a git work tree and `<ref>` names a commit. Otherwise lint prints one message, reports no findings and exits with status 2, so a caller can tell it apart from a rulebook with errors (status 1). A ref that starts with `-` is never accepted, so it cannot pass an option to git. If git fails while listing the changes, lint stops the same way, with status 2, and names the reason.

```gherkin
Scenario: An unknown ref
  Given the rulebook is in a git work tree with no branch "no-such-branch"
  When "rulebookguard lint --base no-such-branch" runs
  Then it prints 'Unknown git ref "no-such-branch".'
  And it reports no findings
  And it exits with status 2

Scenario: Outside a work tree
  Given the rulebook at /tmp/book is not inside a git work tree
  When "rulebookguard lint --base main" runs
  Then it prints "lint --base needs a git work tree, but /tmp/book is not inside one."
  And it exits with status 2
```

## Decisions

- **D1 (2026-11-19)** Should a failure of --base use a different exit status from a rulebook with errors? "1" (option 1: a distinct status, for example 2). Decided: when --base cannot compare, lint exits with status 2; status 1 stays for a rulebook with errors. Implemented (2026-11-19).
- **D2 (2026-11-19)** Should the other cases where lint cannot run also exit with status 2? "1" (option 1: yes). Recorded in R-LIN-010 D2.
