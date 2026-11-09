# @rulebookguard/symbols

Gives [rulebookguard](https://github.com/JuanCJR/rulebookguard#readme) the exact line ranges of the symbols named in rule `evidence`, with [tree-sitter](https://tree-sitter.github.io/). Install it next to `rulebookguard`:

```sh
npm install --save-dev rulebookguard @rulebookguard/symbols
```

Without it, rulebookguard finds the line where a symbol is defined with a heuristic. With it, files in these languages resolve to the full range of the definition, or of the test whose name the entry quotes: JavaScript, TypeScript (and TSX), Python, Go, Java, C# and Rust. Other languages keep using the heuristic.

It is kept apart so that `rulebookguard` stays small: the grammars add about 11 MB. They ship inside this package, under `grammars/`, with the license of each grammar; installing it builds nothing.
