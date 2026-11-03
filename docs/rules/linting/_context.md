---
context: linting
prefix: LIN
summary: The checks that rulebookguard lint runs over the rulebook and its test tags, and when they fail.
---

The linting context covers `rulebookguard lint`: which problems in rules, test tags and rule relations it reports, which of them are errors and which are warnings, and what `--base` adds. How the catalog files are parsed and validated against the JSON Schemas (`src/catalog/load.ts`, `src/format/`) is out of scope; those findings are only passed through by lint.
